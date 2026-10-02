import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function start(page: Page) {
  await page.goto("/tests/native-graphics/index.html?menus");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose nation", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search nations" }).fill("France");
  await page
    .getByRole("button", { name: "Select France", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Begin campaign as France", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Economy", exact: true }),
  ).toBeVisible({ timeout: 90000 });
}

test("map mode control stays inside a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const b = await page
    .getByRole("button", { name: "Map mode: Political", exact: true })
    .boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(390);
  for (const label of [
    "Terrain",
    "Population",
    "Economy",
    "Military",
    "Diplomatic",
    "Unrest",
    "Ruling ideology",
    "Cores",
    "Culture",
    "Political",
  ]) {
    await page.getByRole("button", { name: /^Map mode:/ }).click();
    await page
      .getByRole("button", { name: `${label} map`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Map mode: ${label}`, exact: true }),
    ).toBeVisible();
  }
});

test("landscape leaves space for the map and reachable controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.setViewportSize({ width: 844, height: 390 });
  // The landscape relayout lands a frame after the resize; read the boxes
  // once it has, not the portrait positions still on screen.
  await expect
    .poll(async () => {
      const top = await page.getByText("WORLD RANK", { exact: true }).boundingBox();
      const dock = await page
        .getByRole("button", { name: "Open Economy", exact: true })
        .boundingBox();
      return top && dock ? dock.y - (top.y + top.height) : 0;
    })
    .toBeGreaterThan(200);
  await page
    .getByRole("button", { name: "Map mode: Political", exact: true })
    .click();
  await page.getByRole("button", { name: "Culture map", exact: true }).click();
  await page.getByRole("button", { name: "Open Economy", exact: true }).click();
  await page
    .getByRole("button", { name: "Raise poor tax", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to map", exact: true })
    .click();
  await page.getByRole("button", { name: /^Weather:/ }).click();
  await page.getByRole("button", { name: "Weather rain", exact: true }).click();
  await page
    .getByRole("button", { name: "Return to map", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Weather: rain. Open atmosphere settings",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/native-landscape.png" });
  const config = JSON.parse(readFileSync("apps/mobile/app.json", "utf8"));
  expect(config.expo.orientation).toBe("default");
});

test("engraved native homepage scrolls and launches campaigns in landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/tests/native-graphics/index.html?menus");
  await expect(
    page.getByRole("heading", {
      name: "An age of steam. A world in upheaval.",
    }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/native-home-landscape.png" });
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose nation", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Begin campaign as United Kingdom",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Economy", exact: true }),
  ).toBeVisible({ timeout: 90000 });
});
