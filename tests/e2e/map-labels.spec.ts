import { expect, test, chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

let browserReady = true;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
});

test('map shows reliable labels and clear borders', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');

  const externalFontRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('demotiles.maplibre.org') || /\.pbf(?:$|\?)/i.test(url)) {
      externalFontRequests.push(url);
    }
  });

  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.grand-map__country-label').first()).toBeVisible({ timeout: 15_000 });

  const majors = [
    'United Kingdom',
    'United States',
    'Russian Empire',
    'Qing Empire',
    'Ottoman Empire',
    'France',
    'Austrian Empire',
    'Prussia',
    'Spain',
  ];
  for (const major of majors) {
    await expect(page.locator('.grand-map__country-label', { hasText: new RegExp(`^${escapeRegExp(major)}$`, 'i') }).first()).toBeVisible();
  }

  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/map-world-low-zoom.png', fullPage: true });

  await page.evaluate(() => {
    const map = (window as { __grandCenturyMap?: { jumpTo: (opts: { center: [number, number]; zoom: number }) => void } }).__grandCenturyMap;
    map?.jumpTo({ center: [10, 50], zoom: 6.4 });
  });
  await page.waitForTimeout(700);
  const provinceLabelCount = await page.locator('.grand-map__province-label').count();
  expect(provinceLabelCount).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/map-world-zoomed-in.png', fullPage: true });

  expect(externalFontRequests).toEqual([]);
});
