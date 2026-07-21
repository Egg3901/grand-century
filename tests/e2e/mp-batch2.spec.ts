/**
 * MP-M4/M5 verification: cadence, diffs, bandwidth, reconnect, chat, SP boot.
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

async function fetchStats(): Promise<{
  sessions: Array<{
    id: string;
    sharedFullBytes: number;
    sharedDiffBytes: number;
    playerViewBytes: number;
    wireBytes: number;
    broadcasts: number;
    bytesPerSec: number;
    wireBytesPerSec: number;
    clients: number;
  }>;
}> {
  const res = await fetch('http://127.0.0.1:3412/stats');
  return res.json() as Promise<{
    sessions: Array<{
      id: string;
      sharedFullBytes: number;
      sharedDiffBytes: number;
      playerViewBytes: number;
      wireBytes: number;
      broadcasts: number;
      bytesPerSec: number;
      wireBytesPerSec: number;
      clients: number;
    }>;
  }>;
}

test('MP batch2: diffs + bandwidth + reconnect + chat + cadence', async () => {
  const browser = await chromium.launch();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const session = `e2e-m45-${Date.now().toString(36)}`;
  const urlA = `/#/mp?session=${session}&nation=ENG&seed=1836`;
  const urlB = `/#/mp?session=${session}&nation=FRA&seed=1836`;

  await pageA.goto(urlA);
  await pageB.goto(urlB);
  await waitForSnapshot(pageA);
  await waitForSnapshot(pageB);

  await expect(pageA.getByTestId('presence-hud')).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByTestId('chat-hud')).toBeVisible();

  // Reset stats window
  await fetchStats();

  // Run at speed 3 for ~3 seconds to measure bandwidth
  await sendCommand(pageA, { t: 'setSpeed', speed: 3 });
  await pageA.waitForTimeout(3000);
  await sendCommand(pageA, { t: 'setSpeed', speed: 0 });

  const stats = await fetchStats();
  const row = stats.sessions.find((s) => s.id === session) ?? stats.sessions[0];
  expect(row).toBeTruthy();
  const perClientWire = (row!.wireBytesPerSec) / Math.max(1, row!.clients);
  const perClientJson = (row!.bytesPerSec) / Math.max(1, row!.clients);
  // eslint-disable-next-line no-console
  console.log(
    `BANDWIDTH after diffs+compression: session=${session} `
    + `wireBytes/s=${row!.wireBytesPerSec.toFixed(0)} `
    + `perClientWireBytes/s=${perClientWire.toFixed(0)} `
    + `perClientJsonBytes/s=${perClientJson.toFixed(0)} `
    + `full=${row!.sharedFullBytes} diff=${row!.sharedDiffBytes} view=${row!.playerViewBytes} `
    + `broadcasts=${row!.broadcasts} clients=${row!.clients}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    'BANDWIDTH before (audit baseline): ~4_700_000 bytes/s per client at speed 3; '
    + '8 clients ~94_000_000 bytes/s',
  );
  // Target: 8 clients well under ~1 MB/s total ⇒ <125 KB/s per client on the wire.
  expect(perClientWire).toBeLessThan(125_000);

  // Diff-based update reflects on both
  await sendCommand(pageB, { t: 'setTax', bracket: 'poor', rate: 0.37 });
  await expect.poll(async () => readNationTax(pageB, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.37);
  await expect.poll(async () => readNationTax(pageA, 'FRA'), { timeout: 10_000 }).toBeCloseTo(0.37);

  // Chat
  await pageA.getByTestId('chat-input').fill('hello from ENG');
  await pageA.getByTestId('chat-send').click();
  await expect(pageB.getByTestId('chat-lines')).toContainText('hello from ENG', { timeout: 5_000 });

  // Paused cadence: day stable
  const dayPaused = await readDay(pageA);
  await pageA.waitForTimeout(1500);
  expect(await readDay(pageA)).toBe(dayPaused);
  expect(await readDay(pageB)).toBe(dayPaused);

  // Reconnect: force-close B's socket; auto-reconnect should resync
  const dayBeforeRe = dayPaused;
  await sendCommand(pageA, { t: 'setSpeed', speed: 4 });
  await expect.poll(async () => readDay(pageA), { timeout: 10_000 }).toBeGreaterThan(dayBeforeRe);

  await pageB.evaluate(() => {
    const store = (globalThis as {
      __grandCenturyStore?: { getState: () => { transport: { forceClose?: () => void } | null } };
    }).__grandCenturyStore;
    store?.getState().transport?.forceClose?.();
  });

  // Presence should briefly show FRA away, then reconnect brings B back in sync
  await expect.poll(async () => readDay(pageB), { timeout: 15_000 }).toBeGreaterThan(dayBeforeRe);
  await sendCommand(pageA, { t: 'setSpeed', speed: 0 });
  await expect.poll(async () => {
    const [a, b] = await Promise.all([readDay(pageA), readDay(pageB)]);
    return a === b;
  }, { timeout: 10_000 }).toBe(true);

  // eslint-disable-next-line no-console
  console.log(
    `PASS MP-M4/M5: dayA=${await readDay(pageA)} perClientWireBps=${perClientWire.toFixed(0)} `
    + 'tax sync + chat + reconnect resync',
  );

  await browser.close();
});

test('single-player WorkerTransport still boots after cadence fix', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('.menu-overlay');
  const newGame = page.getByTestId('menu-new-game');
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  await expect(overlay).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('hud-date')).toBeVisible();
  // eslint-disable-next-line no-console
  console.log('PASS single-player WorkerTransport boot + cadence');
});
