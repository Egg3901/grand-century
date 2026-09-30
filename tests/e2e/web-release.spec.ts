import { test, expect } from '@playwright/test';

test('production High terrain loads split assets below the public game path and resumes offline', async ({ page, context }) => {
  const errors: string[] = [];
  const fields = new Set<string>();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => {
    const match = response.url().match(/\/terrain\/terrain-atlas-high-(height|surface|normals|province)-/);
    if (match && response.ok()) fields.add(match[1]);
  });
  await page.addInitScript(() => {
    localStorage.setItem('grand-century.tutorial.v0_2_0.seen', '1');
    localStorage.setItem('grand-century-graphics-v1', 'high');
  });
  await page.goto('./');
  await expect(page.getByTestId('menu-new-game')).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.gc-terrain-labels')).toBeVisible();
  await expect(page.locator('.gc-terrain-loading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D · High', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect([...fields].sort()).toEqual(['height', 'normals', 'province', 'surface']);
  await page.screenshot({ path: 'artifacts/web-release-high.png' });
  // The default campaign centers Britain at this fixed phone viewport. Tap
  // southern England below the nation label; cities appear only at closer zoom.
  await page.locator('.gc-terrain-view canvas').click({ position: { x: 200, y: 505 } });
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // Wait for the runtime cache writes before testing an actual offline reload.
  await page.waitForFunction(async () => {
    const cache = await caches.open('gc-high-terrain-fields');
    return (await cache.keys()).length === 4;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.gc-terrain-labels')).toBeVisible();
  await expect(page.getByRole('button', { name: '3D · High', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
