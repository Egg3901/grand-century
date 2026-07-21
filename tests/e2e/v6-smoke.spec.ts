import { test, chromium } from '@playwright/test';

test('v6 smoke: map renders with water + borders', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
  });
  await page.goto('http://localhost:5173/');
  await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
  await page.click('[data-testid="menu-nation-PRU"]');
  await page.click('[data-testid="menu-new-game"]');
  await page.waitForTimeout(6000);
  // Europe zoom for border/river detail
  const map = await page.evaluate(() => (globalThis as any).__grandCenturyMap);
  if (map) {
    await page.evaluate(() => {
      const m = (globalThis as any).__grandCenturyMap;
      m.jumpTo({ center: [10.5, 49.5], zoom: 5.2 });
    });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: '/tmp/gc-shots/v6-germany.png' });
  await page.evaluate(() => {
    const m = (globalThis as any).__grandCenturyMap;
    m.jumpTo({ center: [12.5, 42.5], zoom: 5.0 });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/gc-shots/v6-italy.png' });
  // layer presence check
  const layers = await page.evaluate(() => {
    const m = (globalThis as any).__grandCenturyMap;
    return ['ne-rivers-ink', 'ne-lakes-fill', 'ne-lakes-shore'].map((id) => ({ id, exists: !!m.getLayer(id) }));
  });
  console.log('layers:', JSON.stringify(layers));
  await browser.close();
});
