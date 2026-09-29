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
  await page
    .getByRole("button", { name: "3D · Balanced", exact: true })
    .click();
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

test("High renders detailed geometry, modeled scenery and moving water while paused", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "high");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await expect(
    page.getByRole("button", { name: "3D · High", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const metrics = await page.evaluate(() => {
    const r = (window as any).__gcTerrain;
    const c = document.querySelector(
      ".gc-terrain-view canvas",
    ) as HTMLCanvasElement;
    (window as any).__gcTerrainFocus({ lon: 8, lat: 46, zoom: 4.4 });
    r.render(0, false, null);
    const gl = c.getContext("webgl")!;
    const pixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    r.render(1.5, false, null);
    const later = new Uint8Array(pixels.length);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      later,
    );
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(pixels[i] - later[i]) +
          Math.abs(pixels[i + 1] - later[i + 1]) +
          Math.abs(pixels[i + 2] - later[i + 2]) >
        8
      )
        changed++;
    const anchor = r.project(7.5, 46.5);
    const v = r.zoomAt(anchor[0], anchor[1], 0.6);
    (window as any).__gcTerrainFocus(v);
    const after = r.project(7.5, 46.5);
    return {
      changed,
      pixels: pixels.length / 4,
      error: gl.getError(),
      size: r.data.size,
      scenery: r.sceneryCount,
      anchor,
      after,
    };
  });
  expect(metrics.size).toBe(4096);
  expect(metrics.error).toBe(0);
  expect(metrics.scenery).toBeGreaterThan(0);
  expect(metrics.changed / metrics.pixels).toBeGreaterThan(0.01);
  expect(metrics.after[0]).toBeCloseTo(metrics.anchor[0], 0);
  expect(metrics.after[1]).toBeCloseTo(metrics.anchor[1], 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const animation = await page.evaluate(
    () =>
      new Promise<{ frames: number; changed: boolean }>((resolve) => {
        const r = (window as any).__gcTerrain;
        const original = r.render.bind(r);
        const canvas = document.querySelector(
          ".gc-terrain-view canvas",
        ) as HTMLCanvasElement;
        const gl = canvas.getContext("webgl")!;
        let frames = 0,
          first = 0,
          changed = false;
        const finish = () => {
          r.render = original;
          clearTimeout(timeout);
          resolve({ frames, changed });
        };
        const timeout = setTimeout(finish, 30000);
        r.render = (
          time: number,
          political: boolean,
          selected: number | null,
        ) => {
          original(time, political, selected);
          const pixels = new Uint8Array(
            gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
          );
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          let hash = 0;
          for (let i = 0; i < pixels.length; i += 64)
            hash = (Math.imul(hash, 31) + pixels[i]) | 0;
          if (!frames) first = hash;
          else changed ||= hash !== first;
          frames++;
          if (frames >= 2) finish();
        };
      }),
  );
  expect(animation.frames).toBeGreaterThanOrEqual(2);
  expect(animation.changed).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.screenshot({ path: "artifacts/graphics-high-alps.png" });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.evaluate(() =>
    (window as any).__gcTerrainFocus({ lon: 54, lat: 24, zoom: 5 }),
  );
  await page.screenshot({ path: "artifacts/graphics-high-phone.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "3D · Balanced", exact: true })
    .click();
  await page.waitForFunction(
    () => (window as any).__gcTerrain?.quality === "balanced",
  );
  await expect(page.getByTestId("terrain-3d")).toBeVisible();
});
