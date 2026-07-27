import { expect, test, chromium, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

async function dismissTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.locator('.tutorial-coach__card')).toBeHidden({ timeout: 5_000 });
  }
}

async function startCampaign(page: Page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(page.locator('.menu-overlay')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });
  await dismissTutorial(page);
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

async function openDesktopPanel(page: Page, id: string) {
  await page.evaluate((panelId) => {
    const store = (window as {
      __grandCenturyStore?: { getState: () => { openPanelId: (id: string) => void } };
    }).__grandCenturyStore;
    store?.getState().openPanelId(panelId);
  }, id);
  await expect(page.locator('.panel-host.atlas-panel')).toHaveCount(1, { timeout: 10_000 });
}

async function closeDesktopPanel(page: Page) {
  await page.evaluate(() => {
    const store = (window as {
      __grandCenturyStore?: { getState: () => { openPanelId: (id: null) => void } };
    }).__grandCenturyStore;
    store?.getState().openPanelId(null);
  });
  await expect(page.locator('.panel-host')).toHaveCount(0, { timeout: 5_000 });
}

async function cdpScreenshot(page: Page, path: string, clip?: { x: number; y: number; width: number; height: number }) {
  const client = await page.context().newCDPSession(page);
  try {
    const params: {
      format: 'png';
      clip?: { x: number; y: number; width: number; height: number; scale: number };
    } = { format: 'png' };
    if (clip) {
      params.clip = {
        x: Math.max(0, clip.x),
        y: Math.max(0, clip.y),
        width: Math.max(1, clip.width),
        height: Math.max(1, clip.height),
        scale: 1,
      };
    }
    const result = await Promise.race([
      client.send('Page.captureScreenshot', params),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`CDP screenshot timed out for ${path}`)), 20_000);
      }),
    ]);
    writeFileSync(path, Buffer.from(result.data, 'base64'));
  } finally {
    await client.detach().catch(() => undefined);
  }
}

async function shotSelector(page: Page, selector: string, path: string) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThan(40);
  expect(box!.height).toBeGreaterThan(40);
  await cdpScreenshot(page, path, box!);
}

test('UI-B panel content polish screenshots', async () => {
  test.setTimeout(180_000);
  mkdirSync('artifacts/ui-b', { recursive: true });
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
    page.on('pageerror', (err) => consoleErrors.push(`pageerror:${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console:${msg.text()}`);
    });
  };

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:4173',
  });
  await stubWebGL(desktopContext);
  const desktop = await desktopContext.newPage();
  track(desktop);

  await desktop.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(desktop.locator('.menu-overlay')).toBeVisible({ timeout: 30_000 });
  await expect(desktop.locator('.menu-card.atlas-panel')).toBeVisible();
  await expect(desktop.getByTestId('menu-new-game')).toHaveClass(/btn--primary/);
  await cdpScreenshot(desktop, 'artifacts/ui-b/desktop-main-menu.png');
  // eslint-disable-next-line no-console
  console.log('UI-B: menu captured');

  await desktop.getByTestId('menu-new-game').click();
  await expect(desktop.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });
  await dismissTutorial(desktop);
  await expect(desktop.getByTestId('panel-production')).toBeVisible({ timeout: 30_000 });
  // eslint-disable-next-line no-console
  console.log('UI-B: campaign started, webgl=', await desktop.evaluate(() => {
    const c = document.createElement('canvas');
    return c.getContext('webgl') !== null;
  }));

  for (const id of ['production', 'politics', 'diplomacy', 'military', 'great_powers'] as const) {
    // eslint-disable-next-line no-console
    console.log(`UI-B: opening ${id}`);
    await desktop.evaluate((panelId) => {
      (window as { __grandCenturyStore?: { getState: () => { openPanelId: (id: string) => void } } })
        .__grandCenturyStore?.getState().openPanelId(panelId);
    }, id);
    await desktop.waitForTimeout(400);
    const meta = await desktop.evaluate(() => {
      const host = document.querySelector('.panel-host');
      const heading = document.querySelector('.panel-card .atlas-heading');
      const close = document.querySelector('.panel-host__close');
      if (!host || !heading || !close) return null;
      const r = host.getBoundingClientRect();
      return {
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
        closeBg: getComputedStyle(close).backgroundImage,
        font: getComputedStyle(heading).fontFamily,
        title: heading.textContent,
      };
    });
    expect(meta).toBeTruthy();
    expect(meta!.closeBg).toContain('linear-gradient');
    expect(/EB Garamond|Garamond|Palatino|Georgia/i.test(meta!.font)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`UI-B: shooting ${id}`, meta!.title);
    await cdpScreenshot(desktop, `artifacts/ui-b/desktop-panel-${id}.png`, meta!.box);
    // eslint-disable-next-line no-console
    console.log(`UI-B: captured ${id}`);
    await desktop.evaluate(() => {
      (window as { __grandCenturyStore?: { getState: () => { openPanelId: (id: null) => void } } })
        .__grandCenturyStore?.getState().openPanelId(null);
    });
    await desktop.waitForTimeout(100);
  }

  await desktop.evaluate(() => {
    const store = (window as {
      __grandCenturyStore?: {
        getState: () => {
          snapshot: Record<string, unknown> | null;
          onSnapshot: (s: Record<string, unknown>) => void;
        };
        setState: (partial: Record<string, unknown>) => void;
      };
    }).__grandCenturyStore;
    const snapshot = store?.getState().snapshot;
    if (!store || !snapshot) throw new Error('store/snapshot missing');
    const injected = {
      instanceId: 9001,
      eventKey: 'ui_b_verify',
      nationId: snapshot.playerNation,
      firedDay: snapshot.day ?? 0,
      title: 'Cabinet Dispatch',
      description: 'A sealed letter arrives from the Foreign Office regarding continental affairs.',
      choices: [
        {
          id: 'ack',
          label: 'Acknowledge and archive',
          description: 'File the dispatch with the colonial office.',
          effectsSummary: ['Prestige +0.1'],
          available: true,
        },
        {
          id: 'debate',
          label: 'Open a debate',
          description: 'Raise the matter before the cabinet.',
          effectsSummary: ['Consciousness +0.05'],
          available: true,
        },
      ],
    };
    // Worker snapshots overwrite UI state; pin our injected event until the shot is done.
    const previousOnSnapshot = store.getState().onSnapshot;
    store.setState({
      onSnapshot: (s: Record<string, unknown>) => {
        previousOnSnapshot({ ...s, pendingPlayerEvents: [injected] });
      },
      snapshot: { ...snapshot, pendingPlayerEvents: [injected] },
    });
    (window as { __gcRestoreOnSnapshot?: () => void }).__gcRestoreOnSnapshot = () => {
      store.setState({ onSnapshot: previousOnSnapshot });
    };
  });
  await expect(desktop.getByTestId('event-popup')).toHaveCount(1, { timeout: 5_000 });
  await expect(desktop.locator('.event-popup__choice.btn--primary')).toHaveCount(1);
  const eventBox = await desktop.evaluate(() => {
    const el = document.querySelector('[data-testid="event-popup"]') ?? document.querySelector('.event-popup');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  // eslint-disable-next-line no-console
  console.log('UI-B: event box', eventBox);
  expect(eventBox).toBeTruthy();
  await cdpScreenshot(desktop, 'artifacts/ui-b/desktop-event-popup.png', eventBox!);
  // eslint-disable-next-line no-console
  console.log('UI-B: event captured');
  await desktop.evaluate(() => {
    (window as { __gcRestoreOnSnapshot?: () => void }).__gcRestoreOnSnapshot?.();
    const store = (window as {
      __grandCenturyStore?: {
        getState: () => { snapshot: Record<string, unknown> | null };
        setState: (partial: Record<string, unknown>) => void;
      };
    }).__grandCenturyStore;
    const snapshot = store?.getState().snapshot;
    if (store && snapshot) store.setState({ snapshot: { ...snapshot, pendingPlayerEvents: [] } });
  });

  // Mobile sheets: resize the same session (fresh mobile contexts hang CDP here).
  await desktop.setViewportSize({ width: 390, height: 844 });
  await desktop.waitForTimeout(400);
  await expect(desktop.locator('.hud-mobile-bottom')).toBeVisible({ timeout: 10_000 });
  await desktop.evaluate(() => {
    try {
      (window as { __grandCenturyMap?: { stop?: () => void } }).__grandCenturyMap?.stop?.();
    } catch {
      /* ignore */
    }
    document.querySelectorAll('canvas').forEach((el) => el.remove());
  });

  await desktop.getByRole('button', { name: 'Panels' }).click();
  await desktop.locator('.hud-mobile-panel-drawer').getByTestId('mobile-panel-production').click();
  await expect(desktop.locator('.panel-host')).toHaveCount(1, { timeout: 10_000 });
  const closeHeight = await desktop.evaluate(() => {
    const el = document.querySelector('.panel-host__close');
    return el ? el.getBoundingClientRect().height : 0;
  });
  expect(closeHeight).toBeGreaterThanOrEqual(44);
  await shotSelector(desktop, '.panel-host', 'artifacts/ui-b/mobile-panel-production.png');
  // eslint-disable-next-line no-console
  console.log('UI-B: mobile production captured');
  await desktop.evaluate(() => {
    const store = (window as {
      __grandCenturyStore?: { getState: () => { openPanelId: (id: null) => void } };
    }).__grandCenturyStore;
    store?.getState().openPanelId(null);
  });
  await expect(desktop.locator('.panel-host')).toHaveCount(0);

  await desktop.getByRole('button', { name: 'Panels' }).click();
  await desktop.locator('.hud-mobile-panel-drawer').getByTestId('mobile-panel-diplomacy').click();
  await expect(desktop.locator('.panel-host')).toHaveCount(1, { timeout: 10_000 });
  await shotSelector(desktop, '.panel-host', 'artifacts/ui-b/mobile-panel-diplomacy.png');
  // eslint-disable-next-line no-console
  console.log('UI-B: mobile done');
  await desktopContext.close();

  await browser.close();
  expect(externalFonts).toEqual([]);
  const noise = consoleErrors.filter((msg) => !/Download the React DevTools|GPU stall|GL Driver Message|WebGL|webglcontextcreationerror|Failed to initialize WebGL|BindToCurrentSequence|Could not create a WebGL context/i.test(msg));
  expect(noise).toEqual([]);
});
