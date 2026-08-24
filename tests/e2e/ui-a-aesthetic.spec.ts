import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function dismissTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.locator('.tutorial-coach__card')).toBeHidden({ timeout: 5_000 });
  }
}

test('UI-A premium shell + labels screenshots', async () => {
  test.setTimeout(120_000);
  mkdirSync('artifacts/ui-a', { recursive: true });
  const browser = await chromium.launch();
  const externalFonts: string[] = [];
  const consoleErrors: string[] = [];

  const track = (page: Page) => {
    page.on('request', (request) => {
      const url = request.url();
      if (/fonts\.googleapis|fonts\.gstatic|fonts\.adobe|\.pbf(?:$|\?)|\/glyphs\//i.test(url)) {
        externalFonts.push(url);
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  };

  // Desktop 1440x900
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(desktop);
  await desktop.goto('/');
  await expect(desktop.locator('.menu-overlay')).toBeVisible({ timeout: 15_000 });
  await desktop.screenshot({ path: 'artifacts/ui-a/desktop-main-menu.png', fullPage: true });
  await desktop.getByTestId('menu-new-game').click();
  await expect(desktop.locator('.menu-overlay')).toBeHidden({ timeout: 10_000 });
  await dismissTutorial(desktop);
  await expect(desktop.locator('.grand-map__country-label').first()).toBeVisible({ timeout: 15_000 });
  await desktop.evaluate(() => {
    (window as { __grandCenturyMap?: { jumpTo: (o: { center: [number, number]; zoom: number }) => void } })
      .__grandCenturyMap?.jumpTo({ center: [0, 22], zoom: 1.25 });
  });
  await desktop.waitForTimeout(900);
  const majors = await desktop.locator('.grand-map__country-label').allTextContents();
  expect(majors.some((name) => /United Kingdom/i.test(name))).toBe(true);
  expect(majors.some((name) => /Russian Empire/i.test(name))).toBe(true);
  expect(majors.some((name) => /Qing Empire/i.test(name))).toBe(true);
  await desktop.screenshot({ path: 'artifacts/ui-a/desktop-world-labels.png', fullPage: true });

  await desktop.getByTestId('panel-budget').click();
  await expect(desktop.locator('.panel-host')).toBeVisible();
  await expect(desktop.locator('.panel-host__close')).toBeVisible();
  await desktop.screenshot({ path: 'artifacts/ui-a/desktop-panel-budget.png', fullPage: true });
  await desktop.locator('.panel-host__close').click();
  await expect(desktop.locator('.panel-host')).toHaveCount(0);

  await desktop.evaluate(() => {
    (window as { __grandCenturyMap?: { jumpTo: (o: { center: [number, number]; zoom: number }) => void } })
      .__grandCenturyMap?.jumpTo({ center: [11, 49], zoom: 5.6 });
  });
  await desktop.waitForTimeout(900);
  const provinceCount = await desktop.locator('.grand-map__province-label').count();
  expect(provinceCount).toBeGreaterThan(0);
  await desktop.screenshot({ path: 'artifacts/ui-a/desktop-province-labels.png', fullPage: true });
  await desktop.close();

  // Mobile 390x844
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  track(mobile);
  await mobile.goto('/');
  await mobile.getByTestId('menu-new-game').click();
  await expect(mobile.locator('.menu-overlay')).toBeHidden({ timeout: 10_000 });
  await dismissTutorial(mobile);
  await expect(mobile.locator('.hud-mobile-top')).toBeVisible();
  await expect(mobile.locator('.hud-mobile-bottom')).toBeVisible();
  await mobile.getByRole('button', { name: 'Panels' }).click();
  await expect(mobile.locator('.hud-mobile-panel-drawer')).toBeVisible();
  await mobile.locator('.hud-mobile-panel-drawer').getByTestId('mobile-panel-budget').click();
  await expect(mobile.locator('.panel-host')).toBeVisible();
  await expect(mobile.locator('.panel-host__close')).toBeVisible();
  await mobile.screenshot({ path: 'artifacts/ui-a/mobile-panel.png', fullPage: true });
  await mobile.locator('.panel-host__close').click();
  await expect(mobile.locator('.panel-host')).toHaveCount(0);
  await mobile.screenshot({ path: 'artifacts/ui-a/mobile-layout.png', fullPage: true });
  await mobile.close();

  await browser.close();
  expect(externalFonts).toEqual([]);
  const noise = consoleErrors.filter((msg) => !/Download the React DevTools|GPU stall|GL Driver Message/i.test(msg));
  expect(noise).toEqual([]);
});
