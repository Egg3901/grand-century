/**
 * End-to-end lobby verification against a built client + dedicated server port.
 * Usage (server + preview already running):
 *   VERIFY_BASE=http://127.0.0.1:4175 VERIFY_WS=ws://127.0.0.1:3421 node scripts/verify-mp-lobby.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.VERIFY_BASE ?? 'http://127.0.0.1:4175';

async function readDay(page) {
  return page.evaluate(() => {
    const store = globalThis.__grandCenturyStore;
    return store?.getState().snapshot?.day ?? -1;
  });
}

async function readTag(page) {
  return page.evaluate(() => {
    const s = globalThis.__grandCenturyStore?.getState().snapshot;
    if (!s) return null;
    return s.nations.find((n) => n.id === s.playerNation)?.tag ?? null;
  });
}

async function readTax(page, tag) {
  return page.evaluate((nationTag) => {
    const s = globalThis.__grandCenturyStore?.getState().snapshot;
    return s?.nations.find((n) => n.tag === nationTag)?.taxRatePoor ?? null;
  }, tag);
}

async function sendCommand(page, cmd) {
  await page.evaluate((command) => {
    globalThis.__grandCenturyStore?.getState().sendCommand(command);
  }, cmd);
}

async function openLobby(page) {
  await page.goto(BASE + '/');
  await page.getByTestId('menu-multiplayer').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('menu-multiplayer').click();
  await page.getByTestId('lobby-overlay').waitFor({ state: 'visible', timeout: 15_000 });
}

async function main() {
  const browser = await chromium.launch();
  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  const sessionName = `Verify ${Date.now().toString(36)}`;

  await openLobby(pageA);
  await pageA.getByTestId('lobby-player-name').fill('Leader');
  await pageA.getByTestId('lobby-create-name').fill(sessionName);
  await pageA.getByTestId('lobby-create-mode').selectOption('competitive');
  await pageA.getByTestId('lobby-create').click();
  await pageA.getByTestId('lobby-player-list').waitFor({ state: 'visible', timeout: 20_000 });

  await openLobby(pageB);
  await pageB.getByTestId('lobby-player-name').fill('Joiner');
  for (let i = 0; i < 20; i++) {
    await pageB.getByTestId('lobby-refresh').click();
    const n = await pageB.locator('[data-testid="lobby-session-list"] li').filter({ hasText: sessionName }).count();
    if (n > 0) break;
    await pageB.waitForTimeout(500);
  }
  await pageB.locator('[data-testid="lobby-session-list"] li').filter({ hasText: sessionName })
    .getByRole('button', { name: 'Join' }).click();
  await pageB.getByTestId('lobby-player-list').waitFor({ state: 'visible', timeout: 15_000 });

  await pageA.getByTestId('lobby-nation-select').selectOption('ENG');
  await pageB.getByTestId('lobby-nation-select').selectOption('FRA');
  await pageA.getByTestId('lobby-ready').click();
  await pageB.getByTestId('lobby-ready').click();
  await pageA.getByTestId('lobby-start').click();

  await pageA.getByTestId('lobby-overlay').waitFor({ state: 'hidden', timeout: 45_000 });
  await pageB.getByTestId('lobby-overlay').waitFor({ state: 'hidden', timeout: 45_000 });

  await pageA.waitForFunction(() => Boolean(globalThis.__grandCenturyStore?.getState().snapshot), null, { timeout: 60_000 });
  await pageB.waitForFunction(() => Boolean(globalThis.__grandCenturyStore?.getState().snapshot), null, { timeout: 60_000 });

  const tagA = await readTag(pageA);
  const tagB = await readTag(pageB);
  if (tagA !== 'ENG' || tagB !== 'FRA') throw new Error(`bad tags ${tagA}/${tagB}`);

  const day0 = await readDay(pageA);
  await sendCommand(pageA, { t: 'setSpeed', speed: 5 });
  for (let i = 0; i < 40; i++) {
    const a = await readDay(pageA);
    const b = await readDay(pageB);
    if (a > day0 && b > day0 && a === b) break;
    await pageA.waitForTimeout(250);
  }
  await sendCommand(pageA, { t: 'setSpeed', speed: 0 });
  let dayShared = -1;
  for (let i = 0; i < 40; i++) {
    const sa = await pageA.evaluate(() => {
      const s = globalThis.__grandCenturyStore?.getState().snapshot;
      return s ? { speed: s.speed, day: s.day } : null;
    });
    const sb = await pageB.evaluate(() => {
      const s = globalThis.__grandCenturyStore?.getState().snapshot;
      return s ? { speed: s.speed, day: s.day } : null;
    });
    if (sa?.speed === 0 && sb?.speed === 0 && sa.day === sb.day) {
      dayShared = sa.day;
      break;
    }
    await pageA.waitForTimeout(250);
  }
  if (dayShared <= day0) throw new Error(`world did not advance together day0=${day0} shared=${dayShared}`);

  const engBefore = await readTax(pageA, 'ENG');
  await sendCommand(pageB, { t: 'setTax', bracket: 'poor', rate: 0.41 });
  for (let i = 0; i < 30; i++) {
    if ((await readTax(pageA, 'FRA')) === 0.41 && (await readTax(pageB, 'FRA')) === 0.41) break;
    await pageA.waitForTimeout(200);
  }
  if ((await readTax(pageA, 'ENG')) !== engBefore) throw new Error('FRA tax leaked onto ENG');
  if ((await readTax(pageA, 'FRA')) !== 0.41) throw new Error('FRA tax not visible on both');

  // Single-player still boots
  const pageC = await (await browser.newContext()).newPage();
  await pageC.goto(BASE + '/');
  await pageC.getByTestId('menu-new-game').waitFor({ state: 'visible', timeout: 45_000 });
  await pageC.getByTestId('menu-new-game').click();
  await pageC.locator('.menu-overlay').waitFor({ state: 'hidden', timeout: 15_000 });
  await pageC.getByTestId('hud-date').waitFor({ state: 'visible' });

  console.log(
    `PASS lobby verify (built client): base=${BASE} day0=${day0} dayShared=${dayShared} tags=${tagA}/${tagB} FRA.tax=0.41 SP=ok`,
  );
  await browser.close();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
