import { expect, test, chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

let browserReady = true;

const WORLD_SEED = JSON.parse(readFileSync(new URL('../../src/data/generated/worldSeed.json', import.meta.url), 'utf8')) as {
  provinceCount: number;
  provinces: Array<{ name: string }>;
};

async function jumpTo(page: Page, center: [number, number], zoom: number) {
  await page.evaluate(({ centerValue, zoomValue }) => {
    const map = (window as { __grandCenturyMap?: { jumpTo: (opts: { center: [number, number]; zoom: number }) => void } }).__grandCenturyMap;
    map?.jumpTo({ center: centerValue, zoom: zoomValue });
  }, { centerValue: center, zoomValue: zoom });
  await page.waitForTimeout(1000);
}

async function hoverMap(page: Page, x: number, y: number) {
  await page.locator('.grand-map').hover({ position: { x, y } });
  await page.waitForTimeout(400);
}

test.beforeAll(async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    browserReady = false;
  }
  mkdirSync('artifacts', { recursive: true });
});

test('consolidated map: real names, not boxy Europe/China', async ({ page }) => {
  test.skip(!browserReady, 'Playwright browsers unavailable in this environment.');

  expect(WORLD_SEED.provinceCount).toBeGreaterThanOrEqual(300);
  expect(WORLD_SEED.provinceCount).toBeLessThanOrEqual(800);
  expect(WORLD_SEED.provinces.every((province) => !/\s\d+$/.test(province.name))).toBe(true);

  const chinaNames = new Set([
    'Gansu', 'Qinghai', 'Guangxi', 'Guizhou', 'Chongqing', 'Beijing', 'Fujian', 'Anhui',
    'Guangdong', 'Tibet', 'Xinjiang', 'Hainan', 'Ningxia', 'Shaanxi', 'Shanxi', 'Hubei',
    'Hunan', 'Sichuan', 'Yunnan', 'Hebei', 'Henan', 'Liaoning', 'Shandong', 'Tianjin',
    'Jiangxi', 'Jiangsu', 'Shanghai', 'Zhejiang', 'Jilin', 'Inner Mongolia', 'Heilongjiang',
  ]);
  const chinaCount = WORLD_SEED.provinces.filter((province) => chinaNames.has(province.name)).length;
  expect(chinaCount).toBe(31);
  expect(WORLD_SEED.provinces.some((province) => province.name === 'Bavaria')).toBe(true);
  expect(WORLD_SEED.provinces.some((province) => province.name === 'Gansu')).toBe(true);
  const frenchRegions = ['Île-de-France', 'Normandy', 'Brittany', 'Aquitaine', 'Occitanie', 'Provence'];
  for (const name of frenchRegions) {
    expect(WORLD_SEED.provinces.some((province) => province.name === name)).toBe(true);
  }
  expect(WORLD_SEED.provinces.some((province) => province.name === 'France')).toBe(false);

  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await expect(page.locator('.menu-overlay')).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(1500);

  await jumpTo(page, [10, 20], 1.4);
  await page.screenshot({ path: 'artifacts/map-world-consolidated.png', fullPage: true });

  await jumpTo(page, [2.3, 46.5], 5.2);
  await page.screenshot({ path: 'artifacts/map-france-organic.png', fullPage: true });
  const franceHovers: string[] = [];
  for (const pos of [
    { x: 640, y: 300 },
    { x: 520, y: 280 },
    { x: 480, y: 360 },
    { x: 600, y: 420 },
    { x: 700, y: 430 },
    { x: 640, y: 360 },
  ]) {
    await hoverMap(page, pos.x, pos.y);
    const tip = (await page.locator('.grand-map__tooltip strong').textContent())?.trim() ?? '';
    if (tip) franceHovers.push(tip);
  }
  const uniqueFrance = [...new Set(franceHovers)];
  console.log(`[verify] France hovers: ${uniqueFrance.join(', ')}`);
  expect(uniqueFrance.some((name) => frenchRegions.includes(name))).toBe(true);
  expect(uniqueFrance.every((name) => !/\s\d+$/.test(name))).toBe(true);
  expect(uniqueFrance.includes('France')).toBe(false);

  await jumpTo(page, [8, 49], 4.6);
  await page.screenshot({ path: 'artifacts/map-western-europe.png', fullPage: true });
  await hoverMap(page, 640, 360);
  const europeTooltip = (await page.locator('.grand-map__tooltip strong').textContent())?.trim() ?? '';
  console.log(`[verify] Western Europe hover: ${europeTooltip}`);
  expect(europeTooltip.length).toBeGreaterThan(0);
  expect(/\s\d+$/.test(europeTooltip)).toBe(false);

  await jumpTo(page, [105, 35], 3.8);
  await page.screenshot({ path: 'artifacts/map-china.png', fullPage: true });
  await hoverMap(page, 640, 360);
  const chinaTooltip = (await page.locator('.grand-map__tooltip strong').textContent())?.trim() ?? '';
  console.log(`[verify] China hover: ${chinaTooltip}`);
  expect(chinaTooltip.length).toBeGreaterThan(0);
  expect(/\s\d+$/.test(chinaTooltip)).toBe(false);
  console.log(`[verify] province count=${WORLD_SEED.provinceCount} china=${chinaCount}`);
});
