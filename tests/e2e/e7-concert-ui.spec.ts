/**
 * 0.7.0 Concert of Europe — UI smoke: the Concert section renders inside the
 * Great Powers panel with a live tension meter and congress ledger.
 */
import { expect, test, chromium, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync } from 'node:fs';

let browserReady = true;

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
});

async function dismissTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.locator('.tutorial-coach__card')).toBeHidden({ timeout: 5_000 });
  }
}

/** Prevent MapLibre from creating a WebGL context that hangs Chromium screenshots. */
async function stubWebGL(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, attrs?: unknown) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return null;
      }
      return original.call(this, type, attrs as never);
    };
  });
}

test('great powers panel shows the Concert of Europe section', async ({ browser }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');
  const context = await browser.newContext();
  await stubWebGL(context);
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(page.locator('.menu-overlay')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });
  await dismissTutorial(page);

  await page.evaluate(() => {
    const store = (window as {
      __grandCenturyStore?: { getState: () => { openPanelId: (id: string) => void } };
    }).__grandCenturyStore;
    store?.getState().openPanelId('great_powers');
  });
  await expect(page.locator('.panel-host.atlas-panel')).toHaveCount(1, { timeout: 10_000 });

  await expect(page.getByRole('heading', { name: 'The Concert of Europe' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.crisis-meter')).toBeVisible();
  await expect(page.locator('.crisis-meter__fill')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Congress Ledger' })).toBeVisible();
  // Tension is a live number 0-100 pulled from the snapshot.
  const tensionText = await page.locator('.crisis-tension-row').innerText();
  expect(tensionText).toMatch(/Tension[\s\S]*?\d+(\.\d+)?[\s\S]*\/ 100/);
  // The classic Great Powers rankings still render below the Concert section.
  await expect(page.getByRole('heading', { name: 'Rankings' })).toBeVisible();

  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/e7-concert-panel.png', fullPage: false });
  await context.close();
});
