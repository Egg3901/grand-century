import { expect, test, chromium } from '@playwright/test';

let browserReady = true;

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
});

test('boot, play one year, open panels, declare war', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  const overlay = page.locator('.menu-overlay');
  const newGame = page.getByTestId('menu-new-game');
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  await expect(overlay).toBeHidden({ timeout: 10_000 });

  await page.dispatchEvent('[data-testid="speed-5"]', 'click');
  await expect.poll(async () => {
    const text = await page.getByTestId('hud-date').textContent();
    const year = Number(text?.split('-')[0] ?? 0);
    return year;
  }, { timeout: 20_000 }).toBeGreaterThanOrEqual(1821);

  const panelIds = [
    'budget',
    'production',
    'population',
    'market',
    'politics',
    'diplomacy',
    'great_powers',
    'military',
    'colonization',
    'save_load',
  ];
  for (const id of panelIds) {
    await page.dispatchEvent(`[data-testid="panel-${id}"]`, 'click');
  }

  await page.dispatchEvent('[data-testid="panel-diplomacy"]', 'click');
  const declareWar = page.getByTestId('diplo-declare-war');
  if (await declareWar.isEnabled()) await declareWar.click({ force: true });

  expect(consoleErrors).toEqual([]);
});

