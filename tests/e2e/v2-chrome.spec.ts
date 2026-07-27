import { test, expect, chromium } from '@playwright/test';

// 0.9.0 V2 gate — nation chrome in HUD, diplomacy, GP rankings, event feed, map labels.
test.describe('V2 nation chrome', () => {
  test('HUD shield + diplomacy rows + GP rows + map label shields', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000); // map + sim boot
    await page.screenshot({ path: '/tmp/gc-shots/v2-hud.png' });

    // HUD shield present
    const hudShield = await page.locator('.hud-top__nation :is(.nation-shield svg, img.nation-flag)').count();
    expect(hudShield).toBe(1);

    // open diplomacy panel, verify shield rows
    await page.click('[data-testid="panel-diplomacy"]');
    await page.waitForTimeout(400);
    const diploShields = await page.locator('.diplo-row__nation :is(.nation-shield svg, img.nation-flag)').count();
    expect(diploShields).toBeGreaterThan(0);
    await page.screenshot({ path: '/tmp/gc-shots/v2-diplomacy.png' });

    // open great powers panel, verify shield rows
    await page.click('[data-testid="panel-great_powers"]');
    await page.waitForTimeout(400);
    const gpShields = await page.locator('.gp-row__nation :is(.nation-shield svg, img.nation-flag)').count();
    expect(gpShields).toBeGreaterThan(0);
    await page.screenshot({ path: '/tmp/gc-shots/v2-gp.png' });

    // map country labels carry shields at far zoom
    await page.evaluate(() => {
      const map = (window as { __grandCenturyMap?: { jumpTo: (opts: { center: [number, number]; zoom: number }) => void } }).__grandCenturyMap;
      map?.jumpTo({ center: [0, 22], zoom: 1.25 });
    });
    await page.waitForTimeout(900);
    const labelShields = await page.locator('.grand-map__country-label :is(.nation-shield svg, img.nation-flag)').count();
    expect(labelShields).toBeGreaterThan(0);
    await page.screenshot({ path: '/tmp/gc-shots/v2-map-labels.png' });

    await browser.close();
  });

  test('mobile HUD shield', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-ENG"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000);
    const mobileShield = await page.locator('.hud-mobile-top__nation :is(.nation-shield svg, img.nation-flag)').count();
    expect(mobileShield).toBe(1);
    await page.screenshot({ path: '/tmp/gc-shots/v2-mobile-hud.png' });
    await browser.close();
  });
});
