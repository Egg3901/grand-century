/**
 * MP-M2/M3 two-client lobby verification.
 * Both clients go through the Lobby UI (create/join, nation pick, ready, start),
 * then share one world and advance together.
 */
import { expect, test, chromium, type Page } from '@playwright/test';

async function waitForSnapshot(page: Page, timeout = 60_000) {
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

async function readPlayerTag(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const s = (globalThis as {
      __grandCenturyStore?: {
        getState: () => {
          snapshot: { playerNation: number; nations: { id: number; tag: string }[] } | null;
        };
      };
    }).__grandCenturyStore?.getState().snapshot;
    if (!s) return null;
    return s.nations.find((n) => n.id === s.playerNation)?.tag ?? null;
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

async function openLobby(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu-multiplayer').waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByTestId('menu-multiplayer').click();
  await page.getByTestId('lobby-overlay').waitFor({ state: 'visible', timeout: 15_000 });
}

test('two clients play one world via the lobby (competitive ENG/FRA)', async () => {
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

  const sessionName = `Lobby E2E ${Date.now().toString(36)}`;

  await openLobby(pageA);
  await pageA.getByTestId('lobby-player-name').fill('Leader');
  await pageA.getByTestId('lobby-create-name').fill(sessionName);
  await pageA.getByTestId('lobby-create-mode').selectOption('competitive');
  await pageA.getByTestId('lobby-create').click();
  await pageA.getByTestId('lobby-player-list').waitFor({ state: 'visible', timeout: 15_000 });

  await openLobby(pageB);
  await pageB.getByTestId('lobby-player-name').fill('Joiner');
  // Poll until the open session appears, then join.
  await expect.poll(async () => {
    await pageB.getByTestId('lobby-refresh').click();
    return pageB.locator('[data-testid="lobby-session-list"] li').filter({ hasText: sessionName }).count();
  }, { timeout: 20_000 }).toBeGreaterThan(0);

  await pageB.locator('[data-testid="lobby-session-list"] li').filter({ hasText: sessionName })
    .getByRole('button', { name: 'Join' }).click();
  await pageB.getByTestId('lobby-player-list').waitFor({ state: 'visible', timeout: 15_000 });

  // Nation picks
  await pageA.getByTestId('lobby-nation-select').selectOption('ENG');
  await pageB.getByTestId('lobby-nation-select').selectOption('FRA');

  await pageA.getByTestId('lobby-ready').click();
  await pageB.getByTestId('lobby-ready').click();

  await expect(pageA.getByTestId('lobby-start')).toBeEnabled({ timeout: 10_000 });
  await pageA.getByTestId('lobby-start').click();

  // Both leave lobby UI and enter the shared world
  await pageA.getByTestId('lobby-overlay').waitFor({ state: 'hidden', timeout: 30_000 });
  await pageB.getByTestId('lobby-overlay').waitFor({ state: 'hidden', timeout: 30_000 });

  await waitForSnapshot(pageA);
  await waitForSnapshot(pageB);

  const tagA = await readPlayerTag(pageA);
  const tagB = await readPlayerTag(pageB);
  expect(tagA).toBe('ENG');
  expect(tagB).toBe('FRA');

  await expect(pageA.getByTestId('presence-hud')).toBeVisible();
  await expect(pageB.getByTestId('presence-hud')).toBeVisible();

  // Save/Load hidden in MP (privacy / no persistence)
  await expect(pageA.getByTestId('panel-save_load')).toHaveCount(0);

  const dayA0 = await readDay(pageA);
  const dayB0 = await readDay(pageB);
  expect(dayA0).toBe(dayB0);

  const meta = await pageA.evaluate(() => {
    const s = globalThis.__grandCenturyStore?.getState();
    return {
      multiplayer: s?.multiplayer,
      mpIsLeader: s?.mpIsLeader,
      hasTransport: Boolean(s?.transport),
      playerNation: s?.snapshot?.playerNation,
    };
  });
  // eslint-disable-next-line no-console
  console.log('lobby meta A', meta);
  expect(meta.multiplayer).toBe(true);
  expect(meta.hasTransport).toBe(true);

  // Leader advances; both clients should move past the start day.
  // (While running, snapshot backlog can make day reads briefly diverge — compare after pause.)
  await sendCommand(pageA, { t: 'setSpeed', speed: 5 });
  await expect.poll(async () => {
    const [a, b] = await Promise.all([readDay(pageA), readDay(pageB)]);
    return a > dayA0 && b > dayB0;
  }, { timeout: 25_000 }).toBe(true);

  await sendCommand(pageA, { t: 'setSpeed', speed: 0 });
  await expect.poll(async () => {
    const speeds = await Promise.all([
      pageA.evaluate(() => {
        const s = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { speed: number; day: number } | null } } }).__grandCenturyStore?.getState().snapshot;
        return s ? { speed: s.speed, day: s.day } : null;
      }),
      pageB.evaluate(() => {
        const s = (globalThis as { __grandCenturyStore?: { getState: () => { snapshot: { speed: number; day: number } | null } } }).__grandCenturyStore?.getState().snapshot;
        return s ? { speed: s.speed, day: s.day } : null;
      }),
    ]);
    return speeds[0]?.speed === 0 && speeds[1]?.speed === 0 && speeds[0]?.day === speeds[1]?.day
      && (speeds[0]?.day ?? 0) > dayA0;
  }, { timeout: 25_000 }).toBe(true);

  const dayShared = await readDay(pageA);
  expect(dayShared).toBeGreaterThan(dayA0);
  expect(await readDay(pageB)).toBe(dayShared);

  // FRA commands FRA only; ENG tax unchanged by FRA's setTax
  const engTaxBefore = await readNationTax(pageA, 'ENG');
  await sendCommand(pageB, { t: 'setTax', bracket: 'poor', rate: 0.41 });
  await expect.poll(async () => readNationTax(pageB, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.41);
  await expect.poll(async () => readNationTax(pageA, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.41);
  expect(await readNationTax(pageA, 'ENG')).toBe(engTaxBefore);

  // Non-leader cannot change speed (client + server)
  await sendCommand(pageB, { t: 'setSpeed', speed: 5 });
  await pageB.waitForTimeout(400);
  const dayAfterNonLeader = await readDay(pageA);
  expect(dayAfterNonLeader).toBe(dayShared);

  // eslint-disable-next-line no-console
  console.log(
    `PASS lobby two-client: name=${sessionName} dayA0=${dayA0} dayShared=${dayShared} tags=${tagA}/${tagB} FRA.tax=0.41`,
  );

  await browser.close();
});

test('single-player still boots from main menu', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('.menu-overlay');
  const newGame = page.getByTestId('menu-new-game');
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  await expect(overlay).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('hud-date')).toBeVisible();
  // eslint-disable-next-line no-console
  console.log('PASS single-player WorkerTransport boot (lobby suite)');
});
