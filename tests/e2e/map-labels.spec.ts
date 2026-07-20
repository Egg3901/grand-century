import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

let browserReady = true;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type LabelSnapshot = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

async function jumpTo(page: Page, center: [number, number], zoom: number) {
  await page.evaluate(({ centerValue, zoomValue }) => {
    const map = (window as { __grandCenturyMap?: { jumpTo: (opts: { center: [number, number]; zoom: number }) => void } }).__grandCenturyMap;
    map?.jumpTo({ center: centerValue, zoom: zoomValue });
  }, { centerValue: center, zoomValue: zoom });
  await page.waitForTimeout(850);
}

async function visibleLabelTexts(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((inputSelector) => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>(inputSelector));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    return labels
      .filter((label) => {
        const style = window.getComputedStyle(label);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const opacity = Number.parseFloat(style.opacity || '1');
        if (!Number.isFinite(opacity) || opacity < 0.05) return false;
        const rect = label.getBoundingClientRect();
        return rect.width > 2
          && rect.height > 2
          && rect.right > 0
          && rect.bottom > 0
          && rect.left < viewportWidth
          && rect.top < viewportHeight;
      })
      .map((label) => label.textContent?.trim() ?? '')
      .filter((label) => label.length > 0);
  }, selector);
}

async function readLabelBoxes(page: Page): Promise<LabelSnapshot[]> {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.grand-map__country-label, .grand-map__province-label'));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    return labels
      .map((label) => {
        const style = window.getComputedStyle(label);
        const opacity = Number.parseFloat(style.opacity || '1');
        const rect = label.getBoundingClientRect();
        return {
          text: label.textContent?.trim() ?? '',
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          opacity,
          hidden: style.display === 'none' || style.visibility === 'hidden',
        };
      })
      .filter((label) => (
        !label.hidden
        && label.opacity >= 0.05
        && label.width > 2
        && label.height > 2
        && label.right > 0
        && label.bottom > 0
        && label.left < viewportWidth
        && label.top < viewportHeight
      ))
      .map(({ text, left, top, right, bottom }) => ({ text, left, top, right, bottom }));
  });
}

function findOverlaps(labels: LabelSnapshot[]): string[] {
  const overlaps: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < labels.length; otherIndex += 1) {
      const a = labels[index];
      const b = labels[otherIndex];
      const intersects = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      if (!intersects) continue;
      overlaps.push(`${a.text} <> ${b.text}`);
    }
  }
  return overlaps;
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
    'Spain',
    'Brazil',
  ];
  mkdirSync('artifacts', { recursive: true });
  await jumpTo(page, [0, 22], 1.25);

  const worldCountries = await visibleLabelTexts(page, '.grand-map__country-label');
  const worldCountrySet = new Set(worldCountries);
  for (const major of majors) {
    expect(worldCountrySet.has(major)).toBe(true);
    await expect(page.locator('.grand-map__country-label', { hasText: new RegExp(`^${escapeRegExp(major)}$`, 'i') }).first()).toBeVisible();
  }
  const worldOverlaps = findOverlaps(await readLabelBoxes(page));
  expect(worldOverlaps).toEqual([]);
  await page.screenshot({ path: 'artifacts/map-labels-world.png', fullPage: true });
  console.log(`[labels world] countries=${worldCountries.join(', ')}`);
  console.log('[labels world] provinces=(none expected)');

  await jumpTo(page, [13, 49], 3.35);
  const midCountries = await visibleLabelTexts(page, '.grand-map__country-label');
  const midOverlaps = findOverlaps(await readLabelBoxes(page));
  expect(midOverlaps).toEqual([]);
  const mediumStateNames = ['Prussia', 'Netherlands', 'Sweden', 'Mexico', 'Persia', 'Portugal'];
  expect(midCountries.some((country) => mediumStateNames.includes(country))).toBe(true);
  await page.screenshot({ path: 'artifacts/map-labels-mid-continent.png', fullPage: true });
  console.log(`[labels mid] countries=${midCountries.join(', ')}`);

  await jumpTo(page, [11, 49], 5.45);
  const europeCountries = await visibleLabelTexts(page, '.grand-map__country-label');
  const europeProvinces = await visibleLabelTexts(page, '.grand-map__province-label');
  const europeOverlaps = findOverlaps(await readLabelBoxes(page));
  expect(europeOverlaps).toEqual([]);
  expect(europeProvinces.length).toBeGreaterThan(0);
  const smallStateNames = ['Belgium', 'Switzerland', 'Denmark', 'Kingdom of Greece', 'Saxony', 'Bavaria', 'Wurttemberg', 'Hanover', 'Two Sicilies', 'Papal States'];
  expect(europeCountries.some((country) => smallStateNames.includes(country))).toBe(true);
  await page.screenshot({ path: 'artifacts/map-labels-europe-zoomed.png', fullPage: true });
  console.log(`[labels europe] countries=${europeCountries.join(', ')}`);
  console.log(`[labels europe] provinces=${europeProvinces.slice(0, 80).join(', ')}`);

  expect(externalFontRequests).toEqual([]);
});
