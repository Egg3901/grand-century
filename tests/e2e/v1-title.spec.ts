import { test, expect, chromium } from '@playwright/test';

// 0.9.0 V1 gate — title-screen screenshots + interaction smoke.
test.describe('V1 title screen', () => {
  test('renders hero, nation browser, advanced disclosure', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.waitForTimeout(1200); // fonts + hero
    await page.screenshot({ path: '/tmp/gc-shots/v1-menu-desktop.png' });

    // nation grid populated with shields
    const cards = await page.locator('.nation-card').count();
    expect(cards).toBeGreaterThanOrEqual(20);
    const emblemCount = await page.locator('.nation-card__shield img.nation-flag, .nation-card__shield svg').count();
    expect(emblemCount).toBeGreaterThanOrEqual(20);

    // search filter
    await page.fill('[data-testid="menu-nation-search"]', 'united k');
    await page.waitForTimeout(200);
    const filtered = await page.locator('.nation-card').count();
    expect(filtered).toBe(1);
    await page.screenshot({ path: '/tmp/gc-shots/v1-menu-search.png' });
    await page.fill('[data-testid="menu-nation-search"]', '');

    // advanced disclosure hides seed by default, reveals on toggle
    await expect(page.locator('[data-testid="menu-seed-input"]')).toHaveCount(0);
    await page.click('[data-testid="menu-advanced-toggle"]');
    await expect(page.locator('[data-testid="menu-seed-input"]')).toBeVisible();
    await page.screenshot({ path: '/tmp/gc-shots/v1-menu-advanced.png' });

    // select a nation via card and start
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/gc-shots/v1-after-start.png' });
    await browser.close();
  });

  test('mobile viewport', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/gc-shots/v1-menu-mobile.png' });
    await browser.close();
  });
});
