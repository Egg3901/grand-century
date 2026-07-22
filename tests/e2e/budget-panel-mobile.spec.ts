import { expect, test, chromium, type Page } from '@playwright/test';

let browserReady = true;

const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };

async function startFreshGame(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '1');
  }, 'grand-century.tutorial.v0_2_0.seen');
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('mobile-panels-toggle')).toBeVisible({ timeout: 10_000 });
}

async function tap(page: Page, locator: ReturnType<Page['getByTestId']>) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error('No bounding box for tap target');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
});

test.describe('budget panel mobile', () => {
  test.use({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    isMobile: true,
    hasTouch: true,
  });

  test('tariff income trace tooltip stays fully on-screen after tap', async ({ page }) => {
    test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');

    await startFreshGame(page);

    await tap(page, page.getByTestId('mobile-panels-toggle'));
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 2_000 });
    await tap(page, page.getByTestId('mobile-panel-budget'));
    await expect(page.locator('.panel-host__chrome-title')).toContainText(/Budget/i, { timeout: 2_000 });

    await expect(page.getByTestId('budget-breakdown-chart')).toBeVisible({ timeout: 5_000 });

    const tariffRow = page.getByTestId('budget-row-tariff-income');
    await expect(tariffRow).toBeVisible({ timeout: 5_000 });

    const trigger = tariffRow.getByTestId('trace-tooltip-trigger');
    await tap(page, trigger);

    const tip = tariffRow.getByTestId('trace-tooltip');
    const wrap = tariffRow.locator('.trace-value-wrap');
    await expect(wrap).toHaveClass(/is-open/, { timeout: 2_000 });
    await expect(tip).toBeVisible({ timeout: 2_000 });

    const tipBox = await tip.boundingBox();
    expect(tipBox).toBeTruthy();
    if (!tipBox) return;

    expect(tipBox.x).toBeGreaterThanOrEqual(0);
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(MOBILE.width + 0.5);
    expect(tipBox.y).toBeGreaterThanOrEqual(0);
    expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(MOBILE.height + 0.5);

    // Dismiss by tapping the trigger again
    await tap(page, trigger);
    await expect(wrap).not.toHaveClass(/is-open/, { timeout: 2_000 });

    // Re-open, then dismiss by tapping elsewhere
    await tap(page, trigger);
    await expect(wrap).toHaveClass(/is-open/, { timeout: 2_000 });
    await page.touchscreen.tap(24, 80);
    await expect(wrap).not.toHaveClass(/is-open/, { timeout: 2_000 });
  });
});
