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

test('permalink hash starts the chosen nation', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/#/new?seed=1848&nation=FRA');
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });
  await expect.poll(async () => {
    return page.locator('.hud-top__nation .atlas-heading').textContent();
  }, { timeout: 20_000 }).toMatch(/France/i);

  expect(consoleErrors).toEqual([]);
});

test('manifest + service worker register without console errors', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.getByTestId('menu-new-game').waitFor({ state: 'visible', timeout: 30_000 });

  const pwa = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const manifestHref = manifestLink?.href ?? null;
    let manifestName: string | null = null;
    if (manifestHref) {
      const response = await fetch(manifestHref);
      if (response.ok) {
        const json = await response.json() as { name?: string };
        manifestName = json.name ?? null;
      }
    }
    let swReady = false;
    if ('serviceWorker' in navigator) {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 15_000); }),
      ]);
      swReady = Boolean(registration);
    }
    return { manifestName, swReady, manifestHref };
  });

  expect(pwa.manifestName).toBe('Grand Century');
  expect(pwa.manifestHref).toBeTruthy();
  expect(pwa.swReady).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('boot still plays from the main menu', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  await page.goto('/');
  const overlay = page.locator('.menu-overlay');
  const newGame = page.getByTestId('menu-new-game');
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.getByTestId('menu-copy-share')).toBeVisible();
  await newGame.click();
  await expect(overlay).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('hud-copy-share')).toBeVisible();
  await page.dispatchEvent('[data-testid="speed-5"]', 'click');
  await expect.poll(async () => {
    const text = await page.getByTestId('hud-date').textContent();
    const year = Number(text?.split('-')[0] ?? 0);
    return year;
  }, { timeout: 20_000 }).toBeGreaterThanOrEqual(1837);
});
