import { expect, test } from '@playwright/test';

test('changing campaign options does not replace the active world before confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden();
  const initialSeed = await page.evaluate(() => (
    (globalThis as typeof globalThis & {
      __grandCenturyStore?: { getState(): { snapshot: { seed: number } | null } };
    }).__grandCenturyStore?.getState().snapshot?.seed
  ));
  expect(initialSeed).toBeTruthy();

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByTestId('menu-advanced-toggle').click();
  await page.getByTestId('menu-seed-input').fill('987654');
  await page.getByTestId('menu-map-mode-select').selectOption('procedural_real');

  await expect.poll(async () => page.evaluate(() => (
    (globalThis as typeof globalThis & {
      __grandCenturyStore?: { getState(): { snapshot: { seed: number } | null } };
    }).__grandCenturyStore?.getState().snapshot?.seed
  ))).toBe(initialSeed);
});
