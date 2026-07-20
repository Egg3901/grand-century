import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

describe('world long-run stability', () => {
  it('advances 20 years without NaN prices or negative pops', () => {
    const world = createWorld(GAME_DATA, 1836);
    const days = 365 * 20;

    for (let i = 0; i < days; i++) {
      expect(() => advanceDay(world, GAME_DATA)).not.toThrow();
    }

    for (const marketGood of world.market) {
      expect(Number.isFinite(marketGood.price)).toBe(true);
      expect(marketGood.price).toBeGreaterThan(0);
    }

    for (const pop of world.pops) {
      expect(Number.isFinite(pop.size)).toBe(true);
      expect(pop.size).toBeGreaterThanOrEqual(0);
    }
  }, 90_000);
});
