import { test, expect } from "@playwright/test";
async function start(
  page: import("@playwright/test").Page,
  scenario = "1830 · The Concert of Europe",
) {
  await page.goto("/tests/native-graphics/index.html?menus");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  if (scenario.startsWith("1936"))
    await page.getByRole("button", { name: scenario, exact: true }).click();
  await page
    .getByRole("button", { name: "Choose nation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search nations" })
    .fill("United Kingdom");
  await page
    .getByRole("button", { name: "Select United Kingdom", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Begin campaign as United Kingdom",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Economy", exact: true }),
  ).toBeVisible();
}
async function panel(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: "All menus", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
test("all native gameplay ledgers are reachable and budget, stockpile and industry orders change the real world", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.getByRole("button", { name: "Open Economy", exact: true }).click();
  await page.getByRole("button", { name: "Explain Weekly net", exact: true }).click();
  await expect(
    page.getByText("Hide calculation", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Raise poor tax", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as any).nativeSnapshot;
        return s.nations[s.playerNation].taxRatePoor;
      }),
    )
    .toBeCloseTo(0.5);
  await panel(page, "World market");
  await page.getByRole("button", { name: "Buy Grain", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as any).nativeSnapshot;
        return Object.values(s.playerStockpileOrders).find(
          (o: any) => o.mode === "buy",
        );
      }),
    )
    .toMatchObject({ mode: "buy", dailyAmount: 10 });
  await panel(page, "Industry");
  await page
    .getByRole("button", { name: /^Select / })
    .first()
    .click();
  const before = await page.evaluate(() => {
    const s = (window as any).nativeSnapshot;
    return {
      factories: s.playerStates.reduce(
        (sum: number, p: any) => sum + p.factoryCount,
        0,
      ),
      treasury: s.nations[s.playerNation].treasury,
    };
  });
  await page
    .getByRole("button", { name: /^Build .* in / })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).nativeSnapshot.playerStates.reduce(
          (sum: number, p: any) => sum + p.factoryCount,
          0,
        ),
      ),
    )
    .toBe(before.factories + 1);
  expect(
    await page.evaluate(() => {
      const s = (window as any).nativeSnapshot;
      return s.nations[s.playerNation].treasury;
    }),
  ).toBeLessThan(before.treasury);
  for (const label of [
    "Population",
    "Cultures",
    "Politics and reforms",
    "Great powers",
    "Colonization",
    "National ambitions",
    "Decisions",
    "Events",
    "Concert of Europe",
    "Campaign chronicle",
    "Province ledger",
  ]) {
    await panel(page, label);
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
    if (label === "Politics and reforms")
      await expect(
        page.getByRole("heading", { name: "Reforms", exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: `artifacts/native-parity-${label.replaceAll(" ", "-")}.png`,
    });
  }
  await panel(page, "Diplomacy");
  await page
    .getByRole("textbox", { name: "Search diplomatic nations", exact: true })
    .fill("France");
  await page
    .getByRole("button", { name: "Select France", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Fabricate humiliate pretext against France",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).nativeSnapshot.playerPendingCbs.length,
      ),
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Declare war on France", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).nativeSnapshot.wars.length),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Confirm war on France", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeSnapshot.wars.length))
    .toBe(1);
  await expect(
    page.getByRole("heading", { name: "Peace conference", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to map", exact: true })
    .click();
  await page.getByRole("button", { name: /^Latest report:/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reports and alerts", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Dismiss report:/ })
    .first()
    .click();
  expect(errors).toEqual([]);
});
test("1936 preview starts and restores the correct scenario and late-era technology", async ({
  page,
}) => {
  await start(page, "1936 · The Gathering Storm");
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeSnapshot.date.year))
    .toBe(1936);
  await page
    .getByRole("button", { name: "Open Research", exact: true })
    .click();
  await expect(
    page.getByText("Researched", { exact: true }).first(),
  ).toBeVisible();
  await panel(page, "Save and load campaigns");
  await page
    .getByRole("textbox", { name: "Save name" })
    .fill("1936 checkpoint");
  await page.getByRole("button", { name: "Create save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load 1936 checkpoint", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Load and manage saves" }).click();
  await page
    .getByRole("button", { name: "Load 1936 checkpoint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Economy", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeSnapshot.scenarioId))
    .toBe("1936-01-01");
});

test("native worker command log matches the shared engine and both scenarios roundtrip through checkpoints", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/tests/native-graphics/index.html?menus");
  const result = await page.evaluate(async () => {
    const { verifyNativeCampaignStorage } =
      await import("/apps/mobile/game/campaignSmoke.ts");
    return verifyNativeCampaignStorage();
  });
  expect(result.ok).toBe(true);
  expect(result.scenarioParity).toEqual([
    expect.objectContaining({
      scenarioId: "1830-01-01",
      equalSnapshot: true,
      roundtrip: true,
    }),
    expect.objectContaining({
      scenarioId: "1936-01-01",
      equalSnapshot: true,
      roundtrip: true,
    }),
  ]);
});
