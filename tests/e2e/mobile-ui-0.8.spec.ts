import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

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

async function tap(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No box for ${testId}`);
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

test.describe('mobile UI 0.8', () => {
  test.use({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    isMobile: true,
    hasTouch: true,
  });

  test('single tap opens a panel on the first try', async ({ page }) => {
    test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
    mkdirSync('docs', { recursive: true });

    await startFreshGame(page);

    // First tap: open panel drawer
    await tap(page, 'mobile-panels-toggle');
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 2_000 });

    // First tap on Budget opens the sheet — no second tap required
    await tap(page, 'mobile-panel-budget');
    await expect(page.locator('.panel-host')).toBeVisible({ timeout: 2_000 });
    await expect(page.locator('.panel-host__chrome-title')).toContainText(/Budget/i);

    await page.screenshot({ path: 'docs/mobile-0.8-tap-panel.png', fullPage: false });

    // Close sheet, then open Technology on the next first-try tap
    const done = page.locator('.panel-host__close');
    if (await done.isVisible()) {
      const doneBox = await done.boundingBox();
      if (doneBox) await page.touchscreen.tap(doneBox.x + doneBox.width / 2, doneBox.y + doneBox.height / 2);
      await expect(page.locator('.panel-host')).toBeHidden({ timeout: 2_000 });
    }

    await tap(page, 'mobile-panels-toggle');
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 2_000 });
    await tap(page, 'mobile-panel-technology');
    await expect(page.locator('.panel-host__chrome-title')).toContainText(/Technology/i, { timeout: 2_000 });
    await page.screenshot({ path: 'docs/mobile-0.8-technology-sheet.png', fullPage: false });

    if (await done.isVisible()) {
      const doneBox = await done.boundingBox();
      if (doneBox) await page.touchscreen.tap(doneBox.x + doneBox.width / 2, doneBox.y + doneBox.height / 2);
      await expect(page.locator('.panel-host')).toBeHidden({ timeout: 2_000 });
    }

    await tap(page, 'mobile-panels-toggle');
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 2_000 });
    await tap(page, 'mobile-panel-great_powers');
    await expect(page.locator('.panel-host__chrome-title')).toContainText(/Great Powers|Concert/i, { timeout: 2_000 });
    await page.screenshot({ path: 'docs/mobile-0.8-crisis-sheet.png', fullPage: false });

    // Touch targets on bottom nav are >= 44px
    const sizes = await page.getByTestId('mobile-panels-toggle').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(sizes.w).toBeGreaterThanOrEqual(44);
    expect(sizes.h).toBeGreaterThanOrEqual(44);
  });

  test('notifications stay batched and calm under election spam', async ({ page }) => {
    test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
    mkdirSync('docs', { recursive: true });

    await startFreshGame(page);

    // Inject a burst of election alerts + one war via the live store.
    await page.evaluate(() => {
      const store = (window as unknown as {
        __GC_STORE__?: {
          setState: (fn: (s: {
            alerts: Array<{
              id: string;
              kind: string;
              day: number;
              message: string;
              panel: string | null;
              suggestion?: string;
              dedupeKey?: string;
            }>;
          }) => unknown) => void;
        };
      }).__GC_STORE__;

      // Fallback: poke Zustand through React fiber if no hook — use dynamic import path.
      void store;
    });

    // Directly mutate via module by evaluating against the Zustand store on window if exposed;
    // otherwise dispatch through the page's useStore by importing from the app bundle.
    const injected = await page.evaluate(async () => {
      type Alert = {
        id: string;
        kind: 'war' | 'election' | 'bankruptcy';
        day: number;
        message: string;
        panel: 'politics' | 'military' | 'budget' | null;
        suggestion?: string;
        dedupeKey?: string;
      };

      // Access the store from any React component subscription via Vite module graph.
      const mod = await import('/src/store.ts');
      const alerts: Alert[] = [];
      for (let i = 0; i < 8; i += 1) {
        alerts.push({
          id: `election-${i}`,
          kind: 'election',
          day: 120 + i,
          message: `Nation${i} elected Party${i}.`,
          panel: 'politics',
          suggestion: 'Routine',
          dedupeKey: `election-n${i}`,
        });
      }
      alerts.push({
        id: 'war-1',
        kind: 'war',
        day: 130,
        message: 'War declared (War 9).',
        panel: 'military',
        suggestion: 'Open Military',
        dedupeKey: 'war-9',
      });
      alerts.push({
        id: 'election-player',
        kind: 'election',
        day: 131,
        message: 'United Kingdom elected Whig.',
        panel: 'politics',
        suggestion: 'Your election',
        dedupeKey: 'election-player',
      });

      mod.useStore.setState({ alerts });
      return mod.useStore.getState().alerts.length;
    });

    expect(injected).toBeGreaterThanOrEqual(10);

    // Wait a beat for React to render toasts
    await page.waitForTimeout(300);

    const toastCount = await page.getByTestId('event-toast').count();
    // Cap: at most 2 prominent toasts (war + player election); foreign elections are quiet.
    expect(toastCount).toBeLessThanOrEqual(2);
    expect(toastCount).toBeGreaterThanOrEqual(1);

    const kinds = await page.getByTestId('event-toast').evaluateAll((nodes) => (
      nodes.map((n) => n.getAttribute('data-kind'))
    ));
    expect(kinds.every((k) => k === 'war' || k === 'election')).toBe(true);
    // Foreign election spam must not each become a toast
    const electionToasts = await page.locator('[data-testid="event-toast"][data-kind="election"]').count();
    expect(electionToasts).toBeLessThanOrEqual(1);

    await page.screenshot({ path: 'docs/mobile-0.8-notifications-calm.png', fullPage: false });
  });
});
