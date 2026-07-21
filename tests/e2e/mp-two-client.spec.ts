/**
 * MP-M1 two-client shared-world verification.
 * Starts against the Vite dev server; expects the session server on PORT 3412
 * (playwright webServer launches it).
 */
import { expect, test, chromium, type Page } from '@playwright/test';

async function waitForSnapshot(page: Page, timeout = 45_000) {
  await page.waitForFunction(() => {
    const store = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { day: number } | null } } }).__grandCenturyStore;
    return Boolean(store?.getState().snapshot);
  }, { timeout });
}

async function readDay(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { day: number } | null } } }).__grandCenturyStore;
    return store?.getState().snapshot?.day ?? -1;
  });
}

async function readNationTax(page: Page, tag: string): Promise<number | null> {
  return page.evaluate((nationTag) => {
    const store = (globalThis as {
      __grandCenturyStore?: {
        getState: () => {
          snapshot: { nations: { tag: string; taxRatePoor: number }[] } | null;
        };
      };
    }).__grandCenturyStore;
    const nation = store?.getState().snapshot?.nations.find((n) => n.tag === nationTag);
    return nation?.taxRatePoor ?? null;
  }, tag);
}

async function sendCommand(page: Page, cmd: unknown) {
  await page.evaluate((command) => {
    const store = (globalThis as {
      __grandCenturyStore?: { getState: () => { sendCommand: (c: unknown) => void } };
    }).__grandCenturyStore;
    store?.getState().sendCommand(command);
  }, cmd);
}

test('two clients share one multiplayer world', async () => {
  const browser = await chromium.launch();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const logsA: string[] = [];
  const logsB: string[] = [];
  pageA.on('console', (m) => logsA.push(`${m.type()}: ${m.text()}`));
  pageB.on('console', (m) => logsB.push(`${m.type()}: ${m.text()}`));
  pageA.on('pageerror', (e) => logsA.push(`pageerror: ${e.message}`));
  pageB.on('pageerror', (e) => logsB.push(`pageerror: ${e.message}`));

  const session = `e2e-${Date.now().toString(36)}`;
  const urlA = `/#/mp?session=${session}&nation=ENG&seed=1836`;
  const urlB = `/#/mp?session=${session}&nation=FRA&seed=1836`;

  await pageA.goto(urlA);
  await pageB.goto(urlB);

  const hashA = await pageA.evaluate(() => location.hash);
  const hashB = await pageB.evaluate(() => location.hash);
  expect(hashA).toContain('mp');
  expect(hashB).toContain('mp');
  expect(hashA).toContain(session);
  expect(hashB).toContain(session);

  await waitForSnapshot(pageA);
  await waitForSnapshot(pageB);

  const metaA = await pageA.evaluate(() => {
    const s = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { day: number; playerNation: number; speed: number; nations: { id: number; tag: string }[] } | null } } }).__grandCenturyStore?.getState().snapshot;
    return s ? { day: s.day, playerNation: s.playerNation, speed: s.speed, tag: s.nations.find((n) => n.id === s.playerNation)?.tag } : null;
  });
  const metaB = await pageB.evaluate(() => {
    const s = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { day: number; playerNation: number; speed: number; nations: { id: number; tag: string }[] } | null } } }).__grandCenturyStore?.getState().snapshot;
    return s ? { day: s.day, playerNation: s.playerNation, speed: s.speed, tag: s.nations.find((n) => n.id === s.playerNation)?.tag } : null;
  });
  // eslint-disable-next-line no-console
  console.log('metaA', metaA, 'metaB', metaB);

  const dayA0 = await readDay(pageA);
  const dayB0 = await readDay(pageB);
  expect(dayA0).toBe(dayB0);
  expect(dayA0).toBeGreaterThanOrEqual(0);
  expect(metaA?.tag).toBe('ENG');
  expect(metaB?.tag).toBe('FRA');

  // Leader (first joiner = ENG / pageA) advances time, then pauses for a stable compare.
  await sendCommand(pageA, { t: 'setSpeed', speed: 5 });
  await expect.poll(async () => {
    const [a, b] = await Promise.all([readDay(pageA), readDay(pageB)]);
    return a > dayA0 && b > dayB0 && a === b;
  }, { timeout: 20_000 }).toBe(true);

  await sendCommand(pageA, { t: 'setSpeed', speed: 0 });
  await expect.poll(async () => {
    const [a, b] = await Promise.all([readDay(pageA), readDay(pageB)]);
    return a === b;
  }, { timeout: 10_000 }).toBe(true);

  const dayShared = await readDay(pageA);
  expect(dayShared).toBeGreaterThan(dayA0);
  expect(await readDay(pageB)).toBe(dayShared);

  // FRA client changes tax; ENG client must see the same nation line.
  await sendCommand(pageB, { t: 'setTax', bracket: 'poor', rate: 0.37 });
  await expect.poll(async () => readNationTax(pageB, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.37);
  await expect.poll(async () => readNationTax(pageA, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.37);

  // eslint-disable-next-line no-console
  console.log(
    `PASS two-client MP: session=${session} dayA0=${dayA0} dayShared=${dayShared} FRA.taxPoor=0.37 on both`,
    '\nlogsA', logsA.filter((l) => l.includes('error') || l.includes('sim')).slice(0, 10),
    '\nlogsB', logsB.filter((l) => l.includes('error') || l.includes('sim')).slice(0, 10),
  );

  await browser.close();
});

test('single-player WorkerTransport still boots', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('.menu-overlay');
  const newGame = page.getByTestId('menu-new-game');
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  await expect(overlay).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('hud-date')).toBeVisible();
  // eslint-disable-next-line no-console
  console.log('PASS single-player WorkerTransport boot');
});
