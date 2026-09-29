import { test, expect } from "@playwright/test";
for (const width of [390, 430])
  test(`native menus and flags remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/native-graphics/index.html?menus");
    await page.screenshot({ path: `artifacts/native-ui-home-${width}.png` });
    await page
      .getByRole("button", { name: "New campaign", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose nation", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Search nations" }).fill("Algeria");
    await page.getByRole("button", { name: "Select Algeria" }).click();
    await page
      .getByRole("button", { name: "Begin campaign as Algeria" })
      .click();
    await expect(page.getByTestId("player-country-flag")).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByTestId("player-country-flag")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    const nav = page.getByRole("button", { name: "Open Economy", exact: true });
    const bounds = await nav.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(844 - 34);
    await page.screenshot({ path: `artifacts/native-ui-map-${width}.png` });
    await nav.click();
    await page
      .getByRole("button", { name: "Raise poor tax", exact: true })
      .click();
    expect(
      await page.evaluate(() => (window as any).nativeCommand),
    ).toMatchObject({ t: "setTax", bracket: "poor" });
    await page.getByRole("button", { name: "All menus" }).click();
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Research", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Research Muzzle-loaded Rifles",
        exact: true,
      })
      .click();
    expect(
      await page.evaluate(() => (window as any).nativeCommand),
    ).toMatchObject({ t: "setResearch" });
    await page.screenshot({
      path: `artifacts/native-ui-research-${width}.png`,
    });
    await page.getByRole("button", { name: "All menus" }).click();
    await page
      .getByRole("button", { name: "Map and graphics", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Lighting night", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Weather snow", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lighting night", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "All menus" }).click();
    await page.getByRole("button", { name: "Main menu", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume Algeria" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume Algeria" }).click();
    await page
      .getByRole("button", { name: "Open Military", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Military", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Return to map" }).click();
    await page
      .getByRole("button", { name: "Open Diplomacy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Diplomacy", exact: true }),
    ).toBeVisible();
  });
