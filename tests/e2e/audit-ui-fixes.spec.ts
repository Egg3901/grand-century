import { expect, test } from '@playwright/test';

test('nation list exposes a working roving keyboard focus', async ({ page }) => {
  await page.goto('/');
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible({ timeout: 30_000 });

  const tabbable = page.locator('[role="option"][tabindex="0"]');
  await expect(tabbable).toHaveCount(1);
  await tabbable.focus();
  await page.keyboard.press('ArrowDown');

  const focusedAfterArrow = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focusedAfterArrow).toMatch(/^nation-option-/);

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
});

test('phone layout exposes market orders, outliner, and legend', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });

  const outlinerToggle = page.getByTestId('outliner-mobile-toggle');
  const legendToggle = page.getByTestId('legend-mobile-toggle');
  await expect(outlinerToggle).toBeVisible();
  await expect(legendToggle).toBeVisible();
  await outlinerToggle.click();
  await expect(page.locator('.outliner.is-mobile-visible')).toBeVisible();
  await outlinerToggle.click();
  await legendToggle.click();
  await expect(page.locator('.map-legend.is-mobile-visible')).toBeVisible();
  await legendToggle.click();

  await page.getByTestId('mobile-panels-toggle').click();
  await page.getByTestId('mobile-panel-market').click();
  const market = page.locator('.market-table');
  await expect(market).toBeVisible({ timeout: 10_000 });
  await expect(market.locator('tbody tr').first()).toBeVisible();
  await expect(market.locator('td[data-label="Order"] .btn').first()).toBeVisible();

  const overflow = await page.locator('.market-table-wrap').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await context.close();
});
