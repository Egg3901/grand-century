import { test, expect, chromium } from '@playwright/test';

// 0.9.0 V4 gate — map engraving pass: richer nation fills, land aquatint
// texture, player border halo on the political plate, settlement dots on
// province labels.
test.describe('V4 map engraving', () => {
  test('aquatint layer + player halo + province settlement dots', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3500); // map + sim boot

    // Aquatint texture layer exists on the map
    const hasAquatint = await page.evaluate(() => {
      const map = (globalThis as { __grandCenturyMap?: { getLayer(id: string): unknown } }).__grandCenturyMap;
      return Boolean(map?.getLayer('land-aquatint'));
    });
    expect(hasAquatint).toBe(true);

    // Player halo: France's provinces glow on the political plate
    const haloOpacity = await page.evaluate(() => {
      const map = (globalThis as {
        __grandCenturyMap?: { getPaintProperty(layer: string, prop: string): unknown };
      }).__grandCenturyMap;
      return map?.getPaintProperty('player-border-halo', 'line-opacity');
    });
    // Expression: ['case', ['in', ...], 0.42, 0] — political mode default
    expect(JSON.stringify(haloOpacity)).toContain('0.42');

    // Switch to terrain mode — halo must vanish (it would lie there)
    await page.evaluate(() => {
      const w = window as unknown as { __gcSetMapMode?: (m: string) => void };
      w.__gcSetMapMode?.('terrain');
    });
    await page.waitForTimeout(700);
    const haloTerrain = await page.evaluate(() => {
      const map = (globalThis as {
        __grandCenturyMap?: { getPaintProperty(layer: string, prop: string): unknown };
      }).__grandCenturyMap;
      return JSON.stringify(map?.getPaintProperty('player-border-halo', 'line-opacity'));
    });
    expect(haloTerrain).toContain(',0,0]');
    await page.evaluate(() => {
      const w = window as unknown as { __gcSetMapMode?: (m: string) => void };
      w.__gcSetMapMode?.('political');
    });
    await page.waitForTimeout(700);

    // Zoom in close so province labels render, then check settlement dots
    await page.evaluate(() => {
      const map = (globalThis as {
        __grandCenturyMap?: { jumpTo(opts: unknown): void };
      }).__grandCenturyMap;
      map?.jumpTo({ center: [2.35, 48.85], zoom: 6.2 }); // Paris basin
    });
    await page.waitForTimeout(1200);
    const dotCount = await page.locator('.grand-map__province-label .grand-map__province-dot').count();
    expect(dotCount).toBeGreaterThan(0);
    await page.screenshot({ path: '/tmp/gc-shots/v4-map-close.png' });

    await browser.close();
  });
});
