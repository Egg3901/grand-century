import { test, expect, chromium } from '@playwright/test';

// 0.9.0 V3 gate — panel chrome: title shields, engraved rules, event kind borders,
// wax-seal close button, alternating list rows.
test.describe('V3 panel chrome', () => {
  test('panel title shield + engraved h2 + event kind borders + alternating rows', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-FRA"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000); // map + sim boot

    // Open budget panel — nation-scoped, should show shield in chrome
    await page.click('[data-testid="panel-budget"]');
    await page.waitForTimeout(400);
    const chromeShield = await page.locator('.panel-host__chrome-title-row :is(.nation-shield svg, img.nation-flag)').count();
    expect(chromeShield).toBe(1);
    await page.screenshot({ path: '/tmp/gc-shots/v3-panel-chrome.png' });

    // Verify engraved h2 rule (pseudo-element present via computed style)
    const h2Border = await page.locator('.panel-card h2').evaluate((el) => {
      const after = window.getComputedStyle(el, '::after');
      return after.getPropertyValue('background');
    });
    expect(h2Border).toContain('rgb');

    // Verify ledger-grid has engraved top/bottom rules
    const ledgerRules = await page.locator('.ledger-grid').evaluate((el) => {
      const before = window.getComputedStyle(el, '::before');
      const after = window.getComputedStyle(el, '::after');
      return {
        before: before.getPropertyValue('background'),
        after: after.getPropertyValue('background'),
      };
    });
    expect(ledgerRules.before).toContain('rgb');
    expect(ledgerRules.after).toContain('rgb');

    // Open diplomacy panel — verify shield rows + alternating rows.
    // Wait on the row shields, not on a 400ms sleep: the panel body is a lazy
    // chunk and the sleep raced the import on a loaded machine, leaving the
    // count to run against the "Loading panel" placeholder. Assertion unchanged.
    await page.click('[data-testid="panel-diplomacy"]');
    const firstDiploShield = page.locator('.diplo-row__nation :is(.nation-shield svg, img.nation-flag)').first();
    await expect(firstDiploShield).toBeVisible({ timeout: 20000 });
    const diploShields = await page.locator('.diplo-row__nation :is(.nation-shield svg, img.nation-flag)').count();
    expect(diploShields).toBeGreaterThan(0);
    const evenRowBg = await page.locator('.diplo-list li:nth-child(even)').first().evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(evenRowBg).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: '/tmp/gc-shots/v3-diplomacy.png' });

    // Trigger an event toast by advancing time — war declaration generates events
    // Use the smoke test pattern: select army, declare war
    await page.click('[data-testid="panel-military"]');
    await page.waitForTimeout(300);
    // Find an army and select it
    const armyButton = page.locator('.mil-list li button').first();
    if (await armyButton.count() > 0) {
      await armyButton.click();
      await page.waitForTimeout(300);
    }

    // Close panel and check for event toasts with kind borders
    await page.click('.panel-host__close');
    await page.waitForTimeout(500);

    // Check if any event cards exist (may not always fire in 1 turn).
    // Two corrections here. (1) The old check read whichever card was first;
    // most alert kinds carried no accent rule at all, so it asserted 3px
    // against cards that never had one. Every kind now has an accent, so the
    // plain `.event-card` selector is correct again. (2) `evaluate` +
    // getComputedStyle is a one-shot on a node the alert feed may have just
    // expired, which returns "" for a detached element; `toHaveCSS` retries.
    const eventCards = await page.locator('.event-card').count();
    if (eventCards > 0) {
      await expect(page.locator('.event-card').first()).toHaveCSS('border-left-width', '3px');
      await page.screenshot({ path: '/tmp/gc-shots/v3-event-toast.png' });
    }

    await browser.close();
  });

  test('mobile panel chrome', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-new-game"]', { timeout: 30000 });
    await page.click('[data-testid="menu-nation-ENG"]');
    await page.click('[data-testid="menu-new-game"]');
    await page.waitForTimeout(3000);

    // Dismiss coach marks if present (they block panel interaction)
    const skipButton = page.locator('button:has-text("Skip")');
    if (await skipButton.count() > 0) {
      await skipButton.click();
      await page.waitForTimeout(300);
    }

    // Open panel drawer
    await page.click('[data-testid="mobile-panels-toggle"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="mobile-panel-budget"]');
    await page.waitForTimeout(400);

    // Chrome shield on mobile
    const chromeShield = await page.locator('.panel-host__chrome-title-row :is(.nation-shield svg, img.nation-flag)').count();
    expect(chromeShield).toBe(1);
    await page.screenshot({ path: '/tmp/gc-shots/v3-mobile-panel.png' });

    await browser.close();
  });
});
