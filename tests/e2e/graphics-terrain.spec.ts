import { test, expect } from "@playwright/test";

test("3D terrain preserves province interaction, 2D fallback and phone controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "3d");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await expect(page.getByTestId("terrain-3d")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  // The shared renderer's public geographic projection is the interaction contract.
  const paris = await page.evaluate(() => {
    const r = (window as any).__gcTerrain;
    const point = r.project(2.35, 48.86);
    return {
      point,
      geo: r.unproject(...point),
      province: r.provinceAtPoint(...point),
    };
  });
  expect(paris.geo[0]).toBeCloseTo(2.35, 3);
  expect(paris.geo[1]).toBeCloseTo(48.86, 3);
  expect(paris.point[0]).toBeGreaterThan(200);
  expect(paris.point[0]).toBeLessThan(1000);
  expect(paris.province).toBe(273); // France, from the authored 1830 province atlas.
  await page.mouse.click(paris.point[0], paris.point[1]);
  await expect(
    page.getByRole("heading", { name: "Region Centre", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.screenshot({ path: "artifacts/graphics-terrain-desktop.png" });
  const beforeSwitch = await page.evaluate(() =>
    (window as any).__gcTerrain.project(2.35, 48.86),
  );
  await page
    .getByRole("button", { name: "2D · Low power", exact: true })
    .click();
  await expect(page.getByTestId("terrain-3d")).toHaveCount(0);
  await page.getByRole("button", { name: "3D · Terrain", exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  const afterSwitch = await page.evaluate(() =>
    (window as any).__gcTerrain.project(2.35, 48.86),
  );
  expect(afterSwitch[0]).toBeCloseTo(beforeSwitch[0], 0);
  expect(afterSwitch[1]).toBeCloseTo(beforeSwitch[1], 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/graphics-terrain-phone.png" });
  await page
    .getByRole("button", { name: "2D · Low power", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("grand-century-graphics-v1"),
    ),
  ).toBe("2d");
  expect(errors).toEqual([]);
});

test("loss of the graphics context recovers into the interactive 2D atlas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "3d");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await page
    .locator(".gc-terrain-view canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(
    page.getByRole("button", { name: "2D · Low power", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("3D graphics became unavailable. Switched to 2D."),
  ).toBeVisible();
  await expect(page.locator(".grand-map canvas")).toBeVisible();
});
