import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
  });
});

test('new campaign opens with a useful national brief', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-nation-PRU').click();
  await page.getByTestId('menu-new-game').click();

  const cabinet = page.getByTestId('cabinet-panel');
  await expect(cabinet).toBeVisible();
  await expect(cabinet.getByText('National direction')).toBeVisible();
  await expect(cabinet.getByText('The campaign arc')).toBeVisible();
  await expect(cabinet.locator('.cabinet-priorities li').first()).toBeVisible();

  await page.getByTestId('panel-budget').click();
  await expect(page.locator('.panel-host__chrome-title')).toContainText('Budget');
  await page.getByTestId('panel-tab-production').click();
  await expect(page.locator('.panel-host__chrome-title')).toContainText('Production');

  await page.locator('.panel-host__close').click();
  await expect(cabinet).toBeHidden();
});

test('cabinet remains readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();

  const cabinet = page.getByTestId('cabinet-panel');
  await expect(cabinet).toBeVisible();
  const firstMeasure = await cabinet.locator('.cabinet-measures button').nth(0).boundingBox();
  const secondMeasure = await cabinet.locator('.cabinet-measures button').nth(1).boundingBox();
  expect(firstMeasure).not.toBeNull();
  expect(secondMeasure).not.toBeNull();
  expect(Math.abs(firstMeasure!.x - secondMeasure!.x)).toBeLessThan(2);
  expect(secondMeasure!.y).toBeGreaterThan(firstMeasure!.y);
  await expect(cabinet.locator('.cabinet-priorities button').first()).toHaveCSS('min-height', '44px');

  await page.locator('.panel-host__close').click();
  await page.getByTestId('mobile-panels-toggle').click();
  await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible();
  await expect(page.locator('.hud-mobile-panel-group')).toHaveCount(6);
});
