import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { WORLD_SEED } from '../../src/data/generated';

let browserReady = true;

type StoreSnapshot = {
  playerNation: number;
  provinces: Array<{ id: number; owner: number; controller: number; stateId: number }>;
  armies: Array<{ id: number; owner: number; location: number; moveTarget: number }>;
  wars: Array<{ id: number; attackers: number[]; defenders: number[] }>;
};

async function readSnapshot(page: Page): Promise<StoreSnapshot | null> {
  return page.evaluate(() => {
    const store = (window as { __grandCenturyStore?: { getState: () => { snapshot: unknown } } }).__grandCenturyStore;
    const snapshot = store?.getState().snapshot as StoreSnapshot | null | undefined;
    if (!snapshot) return null;
    return {
      playerNation: snapshot.playerNation,
      provinces: snapshot.provinces.map((province) => ({
        id: province.id,
        owner: province.owner,
        controller: province.controller,
        stateId: province.stateId,
      })),
      armies: snapshot.armies.map((army) => ({
        id: army.id,
        owner: army.owner,
        location: army.location,
        moveTarget: army.moveTarget,
      })),
      wars: snapshot.wars.map((war) => ({
        id: war.id,
        attackers: war.attackers.slice(),
        defenders: war.defenders.slice(),
      })),
    };
  });
}

async function sendCommand(page: Page, command: object) {
  await page.evaluate((cmd) => {
    const store = (window as { __grandCenturyStore?: { getState: () => { sendCommand: (command: unknown) => void } } }).__grandCenturyStore;
    store?.getState().sendCommand(cmd);
  }, command);
}

function findBorderPair(snapshot: StoreSnapshot): { from: number; to: number; targetNation: number; targetState: number } | null {
  const ownerByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.owner]));
  const stateByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.stateId]));
  for (const province of WORLD_SEED.provinces) {
    if (ownerByProvince.get(province.id) !== snapshot.playerNation) continue;
    for (const neighborId of province.neighbors) {
      const neighborOwner = ownerByProvince.get(neighborId);
      if (neighborOwner === undefined || neighborOwner === snapshot.playerNation) continue;
      return {
        from: province.id,
        to: neighborId,
        targetNation: neighborOwner,
        targetState: stateByProvince.get(neighborId) ?? -1,
      };
    }
  }
  return null;
}

async function startGame(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 10_000 });
}

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
});

test('captures war overlay and peace conference on desktop/mobile', async ({ browser, page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  mkdirSync('artifacts', { recursive: true });
  await startGame(page);
  await expect.poll(async () => !!(await readSnapshot(page))).toBe(true);

  const initial = await readSnapshot(page);
  if (!initial) throw new Error('Snapshot unavailable after game start.');
  const border = findBorderPair(initial);
  if (!border) throw new Error('Could not find player border pair for war setup.');

  await sendCommand(page, { t: 'declareWar', target: border.targetNation, goal: 'annex_state', state: border.targetState });
  await sendCommand(page, {
    t: 'recruitArmyWithComposition',
    province: border.from,
    composition: { infantry: 3, cavalry: 1, artillery: 1, guard: 0 },
  });
  await page.dispatchEvent('[data-testid="speed-5"]', 'click');

  await expect.poll(async () => {
    const snap = await readSnapshot(page);
    if (!snap) return 0;
    return snap.armies.filter((army) => army.owner === snap.playerNation && army.location === border.from).length;
  }, { timeout: 25_000 }).toBeGreaterThan(0);

  let movingArmyId = -1;
  await expect.poll(async () => {
    const snap = await readSnapshot(page);
    const candidate = snap?.armies.find((army) => army.owner === snap.playerNation && army.location === border.from);
    movingArmyId = candidate?.id ?? -1;
    return movingArmyId;
  }, { timeout: 25_000 }).toBeGreaterThanOrEqual(0);
  await sendCommand(page, { t: 'moveArmy', army: movingArmyId, target: border.to });

  await expect.poll(async () => {
    const snap = await readSnapshot(page);
    if (!snap) return false;
    const targetProvince = snap.provinces.find((province) => province.id === border.to);
    const warLive = snap.wars.some((war) => war.attackers.includes(snap.playerNation) || war.defenders.includes(snap.playerNation));
    const hasMoving = snap.armies.some((army) => army.owner === snap.playerNation && army.moveTarget >= 0);
    return warLive && (hasMoving || (targetProvince && targetProvince.controller !== targetProvince.owner));
  }, { timeout: 80_000 }).toBe(true);

  await page.dispatchEvent('[data-testid="panel-military"]', 'click');
  await expect(page.locator('.peace-conference')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'artifacts/e5-war-desktop.png', fullPage: true });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await startGame(mobilePage);
  await mobilePage.dispatchEvent('[data-coach-id="panels-mobile-toggle"]', 'click');
  await mobilePage.dispatchEvent('[data-testid="panel-military"]', 'click');
  await expect(mobilePage.locator('.panel-host .panel-card')).toBeVisible({ timeout: 10_000 });
  await mobilePage.screenshot({ path: 'artifacts/e5-war-mobile.png', fullPage: true });
  await mobileContext.close();
});
