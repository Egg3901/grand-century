import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

let browserReady = true;

type LabelBox = {
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
  await page.waitForTimeout(900);
}

async function visibleLabelBoxes(page: Page, selector: string): Promise<LabelBox[]> {
  return page.evaluate((inputSelector) => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(inputSelector));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    return nodes
      .map((node) => {
        const style = window.getComputedStyle(node);
        const opacity = Number.parseFloat(style.opacity || '1');
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() ?? '',
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          hidden: style.display === 'none' || style.visibility === 'hidden',
          opacity,
        };
      })
      .filter((entry) => (
        !entry.hidden
        && entry.opacity >= 0.05
        && entry.width > 2
        && entry.height > 2
        && entry.right > 0
        && entry.bottom > 0
        && entry.left < viewportWidth
        && entry.top < viewportHeight
      ))
      .map(({ text, left, top, right, bottom }) => ({ text, left, top, right, bottom }));
  }, selector);
}

function findOverlaps(labels: LabelBox[]): string[] {
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

async function startFreshGame(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
  }, 'grand-century.tutorial.v0_2_0.seen');
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

test('legibility onboarding screenshots and map checks', async ({ browser, page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  mkdirSync('artifacts', { recursive: true });

  const externalFontOrGlyphRequests: string[] = [];
  const trackExternalRequests = (candidatePage: Page) => {
    candidatePage.on('request', (request) => {
      const url = request.url();
      if (/fonts\.googleapis|fonts\.gstatic|\.pbf(?:$|\?)|\/glyphs\//i.test(url)) {
        externalFontOrGlyphRequests.push(url);
      }
    });
  };

  trackExternalRequests(page);
  await startFreshGame(page);

  await expect(page.locator('.tutorial-coach__card')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'artifacts/tutorial-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.tutorial-coach__card')).toBeHidden({ timeout: 10_000 });

  await page.getByTestId('panel-market').click();
  const firstTraceValue = page.locator('.market-table .trace-value-display').first();
  await firstTraceValue.hover();
  await expect(page.locator('.trace-tooltip').first()).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: 'artifacts/trace-tooltip-open.png', fullPage: true });

  await jumpTo(page, [11, 49], 6.5);
  let provinceLabels = await visibleLabelBoxes(page, '.grand-map__province-label');
  if (provinceLabels.length === 0) {
    await jumpTo(page, [11, 49], 7.1);
    provinceLabels = await visibleLabelBoxes(page, '.grand-map__province-label');
  }
  expect(provinceLabels.length).toBeGreaterThan(0);
  const highZoomOverlaps = findOverlaps(await visibleLabelBoxes(page, '.grand-map__country-label, .grand-map__province-label'));
  expect(highZoomOverlaps).toEqual([]);
  await page.screenshot({ path: 'artifacts/high-zoom-province-labels.png', fullPage: true });

  await jumpTo(page, [0, 22], 1.25);
  const worldOverlaps = findOverlaps(await visibleLabelBoxes(page, '.grand-map__country-label'));
  expect(worldOverlaps).toEqual([]);
  await page.screenshot({ path: 'artifacts/world-zoom-no-crowding.png', fullPage: true });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  trackExternalRequests(mobilePage);
  await startFreshGame(mobilePage);
  await expect(mobilePage.locator('.tutorial-coach__card')).toBeVisible({ timeout: 10_000 });
  await mobilePage.screenshot({ path: 'artifacts/tutorial-mobile.png', fullPage: true });
  await mobileContext.close();

  expect(externalFontOrGlyphRequests).toEqual([]);
});
