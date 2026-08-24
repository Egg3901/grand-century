import { expect, test, type Page } from '@playwright/test';
import { WORLD_SEED } from '../../src/data/generated';

async function dismissTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.locator('.tutorial-coach__card')).toBeHidden({ timeout: 5_000 });
  }
}

async function startCampaign(page: Page, nationTag?: string) {
  await page.goto('/');
  await expect(page.locator('.menu-overlay')).toBeVisible({ timeout: 30_000 });
  if (nationTag) await page.getByTestId(`menu-nation-${nationTag}`).click();
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });
  await dismissTutorial(page);
}

async function openPanel(page: Page, id: string) {
  await page.evaluate((panelId) => {
    const store = (window as {
      __grandCenturyStore?: { getState: () => { openPanelId: (id: string) => void } };
    }).__grandCenturyStore;
    store?.getState().openPanelId(panelId);
  }, id);
  await expect(page.locator('.panel-host.atlas-panel')).toBeVisible({ timeout: 10_000 });
}

test.describe('audit: keyboard and dialog semantics', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Escape closes an open panel when no child dialog is present', async ({ page }) => {
    await startCampaign(page);
    await openPanel(page, 'military');
    await expect(page.locator('.panel-host.atlas-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.panel-host.atlas-panel')).toBeHidden({ timeout: 3_000 });
  });

  test('save confirm dialog: Escape dismisses dialog but keeps parent panel open', async ({ page }) => {
    await startCampaign(page);
    await openPanel(page, 'save_load');

    // Type a slot name and click Save to trigger the confirm dialog (overwrite path).
    const slotInput = page.locator('.save-controls input[type="text"]');
    await slotInput.fill('test-slot');

    // First save to create the slot.
    await page.locator('.save-controls .btn--primary').click();
    // Wait for save to complete.
    await page.waitForTimeout(1_000);

    // Save again to trigger overwrite confirm.
    await page.locator('.save-controls .btn--primary').click();

    const dialog = page.locator('.save-confirm[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Verify aria-modal and aria-describedby are set.
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-describedby', 'save-confirm-desc');

    // Verify focus moved into the dialog.
    const focusedInDialog = await page.evaluate(() => {
      const el = document.querySelector('.save-confirm');
      return el?.contains(document.activeElement);
    });
    expect(focusedInDialog).toBe(true);

    // Escape dismisses the dialog.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 3_000 });

    // Parent panel must still be visible.
    await expect(page.locator('.panel-host.atlas-panel')).toBeVisible();
  });

  test('save confirm dialog: Tab and Shift+Tab cycle within the dialog', async ({ page }) => {
    await startCampaign(page);
    await openPanel(page, 'save_load');

    const slotInput = page.locator('.save-controls input[type="text"]');
    await slotInput.fill('trap-test');

    // Save to create the slot.
    await page.locator('.save-controls .btn--primary').click();
    await page.waitForTimeout(1_000);

    // Save again to trigger overwrite confirm.
    await page.locator('.save-controls .btn--primary').click();

    const dialog = page.locator('.save-confirm[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Collect the two focusable buttons inside the dialog.
    const buttons = dialog.locator('button');
    const count = await buttons.count();
    expect(count).toBe(2);

    // Focus should be on the first button (Overwrite).
    await expect(buttons.first()).toBeFocused();

    // Tab moves to the second button (Cancel).
    await page.keyboard.press('Tab');
    await expect(buttons.nth(1)).toBeFocused();

    // Tab again wraps to the first button.
    await page.keyboard.press('Tab');
    await expect(buttons.first()).toBeFocused();

    // Shift+Tab wraps from first to last.
    await page.keyboard.press('Shift+Tab');
    await expect(buttons.nth(1)).toBeFocused();
  });

  test('save confirm dialog: focus restores to the invoker on dismiss', async ({ page }) => {
    await startCampaign(page);
    await openPanel(page, 'save_load');

    const slotInput = page.locator('.save-controls input[type="text"]');
    await slotInput.fill('restore-test');

    // Save to create the slot.
    await page.locator('.save-controls .btn--primary').click();
    await page.waitForTimeout(1_000);

    // Focus the Save button so it becomes the invoker.
    const saveButton = page.locator('.save-controls .btn--primary');
    await saveButton.focus();

    // Trigger overwrite confirm.
    await saveButton.click();

    const dialog = page.locator('.save-confirm[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Focus should move into the dialog (auto-retrying for the setTimeout effect).
    const firstDialogButton = dialog.locator('button').first();
    await expect(firstDialogButton).toBeFocused({ timeout: 2_000 });

    // Dismiss via Cancel button click.
    await dialog.locator('.btn--ghost').click();
    await expect(dialog).toBeHidden({ timeout: 3_000 });

    // Focus should return to the Save button (the invoker).
    await expect(saveButton).toBeFocused();
  });

  test('PanelHost restores focus to the invoker on Done', async ({ page }) => {
    await startCampaign(page);

    // Focus the military panel button in the rail.
    const railButton = page.locator('[data-testid="panel-military"]');
    await railButton.focus();
    await railButton.click();

    await expect(page.locator('.panel-host.atlas-panel')).toBeVisible({ timeout: 3_000 });

    // Click Done to close.
    await page.locator('.panel-host__close').click();
    await expect(page.locator('.panel-host.atlas-panel')).toBeHidden({ timeout: 3_000 });

    // Focus should return to the rail button.
    await expect(railButton).toBeFocused();
  });

  test('mobile panel drawer closes on Escape', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('menu-new-game').click();
    await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });

    // Open the panel drawer.
    await page.getByTestId('mobile-panels-toggle').click();
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 3_000 });

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-panel-drawer')).toBeHidden({ timeout: 3_000 });

    await context.close();
  });

  test('mobile map mode drawer closes on Escape', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('menu-new-game').click();
    await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });

    // Open the map mode drawer.
    await page.getByTestId('mobile-mapmodes-toggle').click();
    await expect(page.getByTestId('mobile-mapmodes-drawer')).toBeVisible({ timeout: 3_000 });

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-mapmodes-drawer')).toBeHidden({ timeout: 3_000 });

    await context.close();
  });

  test('mobile drawers are mutually exclusive: opening one closes the other', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('menu-new-game').click();
    await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 30_000 });

    // Open the panel drawer first.
    await page.getByTestId('mobile-panels-toggle').click();
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 3_000 });

    // Now open the map mode drawer -- panels drawer should close.
    await page.getByTestId('mobile-mapmodes-toggle').click();
    await expect(page.getByTestId('mobile-mapmodes-drawer')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('mobile-panel-drawer')).toBeHidden({ timeout: 3_000 });

    // And vice versa: open panels -- map modes should close.
    await page.getByTestId('mobile-panels-toggle').click();
    await expect(page.getByTestId('mobile-panel-drawer')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('mobile-mapmodes-drawer')).toBeHidden({ timeout: 3_000 });

    await context.close();
  });

  test('disabled Land At button has aria-describedby with visible reason', async ({ page }) => {
    await startCampaign(page, 'ENG');
    const coastalProvince = WORLD_SEED.provinces.find((province) => (
      province.ownerTag === 'ENG' && province.coastal
    ));
    expect(coastalProvince).toBeDefined();

    await page.evaluate((province) => {
      const store = (window as {
        __grandCenturyStore?: {
          getState: () => { sendCommand: (command: unknown) => void };
        };
      }).__grandCenturyStore;
      store?.getState().sendCommand({
        t: 'buildFleet',
        province,
        shipType: 'transport',
        count: 1,
      });
    }, coastalProvince!.id);

    await expect.poll(async () => page.evaluate(() => {
      const snapshot = (window as {
        __grandCenturyStore?: {
          getState: () => { snapshot?: { playerNation: number; fleets: Array<{ owner: number }> } };
        };
      }).__grandCenturyStore?.getState().snapshot;
      return snapshot?.fleets.filter((fleet) => fleet.owner === snapshot.playerNation).length ?? 0;
    }), { timeout: 10_000 }).toBeGreaterThan(0);

    await openPanel(page, 'military');

    // A newly built transport has no embarked army, so Land At must be
    // disabled and expose its visible reason through aria-describedby.
    const first = page.locator('button:has-text("Land At")').first();
    await expect(first).toBeVisible();
    await expect(first).toBeDisabled();

    // aria-describedby should reference a visible reason element.
    const describedBy = await first.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // The referenced element should exist and have non-empty text.
    const reasonEl = page.locator(`#${describedBy}`);
    await expect(reasonEl).toBeAttached();
    const reasonText = await reasonEl.textContent();
    expect(reasonText).toBeTruthy();
    expect(reasonText!.length).toBeGreaterThan(3);
  });
});
