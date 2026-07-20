import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { BALANCE } from '../src/sim/balance';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

function maxProvinceShare(world: ReturnType<typeof createWorld>): number {
  const counts = new Map<number, number>();
  for (const province of world.provinces) {
    counts.set(province.owner, (counts.get(province.owner) ?? 0) + 1);
  }
  const total = world.provinces.length;
  let maxShare = 0;
  for (const count of counts.values()) maxShare = Math.max(maxShare, count / Math.max(1, total));
  return maxShare;
}

describe('M6 AI long-run stability', () => {
  it('runs 20 years with active wars and bounded values', () => {
    const world = createWorld(GAME_DATA, 6602);
    const twentyYears = 365 * BALANCE.verification.stabilityYears;
    let shareByYear10 = 0;

    for (let day = 0; day < twentyYears; day++) {
      advanceDay(world, GAME_DATA);
      if (day === 365 * 10) shareByYear10 = maxProvinceShare(world);
    }

    expect(world.nextWarId).toBeGreaterThan(2);
    expect(shareByYear10).toBeLessThanOrEqual(BALANCE.verification.hegemonProvinceShareLimitYear10);

    for (const nation of world.nations) {
      expect(Number.isFinite(nation.treasury)).toBe(true);
      expect(nation.treasury).toBeGreaterThanOrEqual(BALANCE.economy.treasuryFloor);
      expect(nation.treasury).toBeLessThanOrEqual(BALANCE.economy.treasurySoftCap);
    }
    for (const good of world.market) {
      expect(Number.isFinite(good.price)).toBe(true);
      expect(good.price).toBeGreaterThanOrEqual(BALANCE.economy.minPrice);
      expect(good.price).toBeLessThanOrEqual(BALANCE.economy.maxPrice);
    }

    const bankruptNations = world.nations.filter((nation) => nation.isBankrupt).length;
    expect(bankruptNations).toBeLessThan(Math.ceil(world.nations.length * 0.5));
  }, 80_000);
});

