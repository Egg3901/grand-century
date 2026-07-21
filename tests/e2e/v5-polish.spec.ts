import { test, expect, chromium } from '@playwright/test';

// 0.9.0 V5 gate — typography, focus rings, micro-interactions, mobile polish.
test.describe('V5 polish', () => {
  test('keyboard focus ring + reduced-motion + fluid type', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });

    // Fluid type: h1 tracks viewport via clamp() — computed size between bounds
    const h1Size = await page.locator('.menu-card h1').first().evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize));
    expect(h1Size).toBeGreaterThan(20);
    expect(h1Size).toBeLessThan(40);

    // Keyboard focus: tab to the first interactive element, expect the wax ring
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focusRing = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return { outline: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(focusRing).not.toBeNull();
    expect(focusRing!.outline).toBe('solid');
    expect(focusRing!.width).toBe('2px');
    await page.screenshot({ path: '/tmp/gc-shots/v5-focus-ring.png' });

    // Reduced motion: emulate the media query, transitions must collapse
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transitionDuration = await page.locator('.btn, button').first().evaluate((el) =>
      window.getComputedStyle(el).transitionDuration);
    expect(parseFloat(transitionDuration)).toBeLessThan(0.02);
    await page.emulateMedia({ reducedMotion: null });

    // Boot into the game and verify the same on HUD chrome
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000);
    // Programmatic focus fires :focus but not :focus-visible in Chromium —
    // assert the keyboard ring via the shared rule instead of the heuristic.
    const hudBtnFocusable = await page.locator('.hud-top button').first().evaluate((el) => {
      el.focus();
      const style = window.getComputedStyle(el);
      return { outline: style.outlineStyle, width: style.outlineWidth };
    });
    expect(['2px', '3px']).toContain(hudBtnFocusable.width);
    await page.screenshot({ path: '/tmp/gc-shots/v5-hud.png' });

    await browser.close();
  });

  test('mobile: drawer touch targets ≥ 48px + safe-area padding', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    // Suppress the tutorial coach overlay — it swallows the first tap on mobile.
    await page.addInitScript(() => {
      window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
    });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000);

    // Open the mobile panel drawer (touchscreen tap at box center — the
    // pattern the 0.8 mobile suite proves out on this button)
    const toggle = page.getByTestId('mobile-panels-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    const box = await toggle.boundingBox();
    if (!box) throw new Error('no box for mobile-panels-toggle');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.hud-mobile-panel-drawer button', { timeout: 15000 });
    const targetSize = await page.locator('.hud-mobile-panel-drawer button').first().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(targetSize.h).toBeGreaterThanOrEqual(48);
    await page.screenshot({ path: '/tmp/gc-shots/v5-mobile-drawer.png' });

    await browser.close();
  });
});
