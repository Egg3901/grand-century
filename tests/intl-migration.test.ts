import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { Rng } from '../src/sim/rng';
import { runPopsMonthly } from '../src/sim/systems/pops';
import type { World } from '../src/shared/types';

function disableAi(world: World) {
  for (const nation of world.nations) nation.isPlayer = true;
}

/** Find a pair of adjacent provinces owned by different nations. */
function findBorderPair(world: World): { origin: number; destination: number; originNation: number; destNation: number } | null {
  for (const province of world.provinces) {
    if (province.owner <= 0) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || neighbor.owner <= 0) continue;
      if (neighbor.owner !== province.owner) {
        return {
          origin: province.id,
          destination: neighborId,
          originNation: province.owner,
          destNation: neighbor.owner,
        };
      }
    }
  }
  return null;
}

/** Total pop size across all pops. */
function totalPop(world: World): number {
  let sum = 0;
  for (const pop of world.pops) sum += Math.max(0, pop.size);
  return sum;
}

/** Total pop size in a specific province. */
function provincePop(world: World, provinceId: number): number {
  const province = world.provinces[provinceId];
  if (!province) return 0;
  let sum = 0;
  for (const popId of province.popIds) {
    const pop = world.pops[popId];
    if (pop) sum += Math.max(0, pop.size);
  }
  return sum;
}

/**
 * Set all pops in a province to a single type/size/needsMet so the province
 * score is predictable and dominated by our test values.
 */
function setupProvincePops(world: World, provinceId: number, opts: { type: string; size: number; needsMet: number }) {
  for (const popId of world.provinces[provinceId].popIds) {
    const pop = world.pops[popId];
    if (!pop) continue;
    pop.type = opts.type as typeof pop.type;
    pop.size = opts.size;
    pop.needsMet = opts.needsMet;
    pop.militancy = 0;
  }
}

describe('International migration', () => {
  it('transfers pop across a border when both nations allow it', () => {
    const world = createWorld(GAME_DATA, 1836);
    disableAi(world);

    const pair = findBorderPair(world);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const { origin, destination, originNation, destNation } = pair;

    // Both nations allow free movement.
    world.nations[originNation].reforms.migration_policy = 3;
    world.nations[destNation].reforms.migration_policy = 3;

    // Origin: large desperate pop. Destination: well-off pop.
    setupProvincePops(world, origin, { type: 'laborer', size: 8000, needsMet: 0.05 });
    setupProvincePops(world, destination, { type: 'laborer', size: 4000, needsMet: 0.95 });

    const originBefore = provincePop(world, origin);
    const destBefore = provincePop(world, destination);

    runPopsMonthly(world, GAME_DATA, new Rng(world.rngState));

    const originAfter = provincePop(world, origin);
    const destAfter = provincePop(world, destination);

    // Origin must have lost pop (emigration).
    expect(originAfter).toBeLessThan(originBefore);
    // Destination must have gained pop (immigration).
    expect(destAfter).toBeGreaterThan(destBefore);
    // The transfer should be meaningful -- at least 10 people, not rounding noise.
    const emigrated = originBefore - originAfter;
    expect(emigrated).toBeGreaterThan(10);
  });

  it('blocks emigration when origin has closed borders', () => {
    const world = createWorld(GAME_DATA, 1836);
    disableAi(world);

    const pair = findBorderPair(world);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const { origin, destination, originNation, destNation } = pair;

    // Origin closed, destination open.
    world.nations[originNation].reforms.migration_policy = 0;
    world.nations[destNation].reforms.migration_policy = 3;

    setupProvincePops(world, origin, { type: 'laborer', size: 8000, needsMet: 0.05 });
    setupProvincePops(world, destination, { type: 'laborer', size: 4000, needsMet: 0.95 });

    const destBefore = provincePop(world, destination);

    runPopsMonthly(world, GAME_DATA, new Rng(world.rngState));

    const destAfter = provincePop(world, destination);

    // Destination should not gain pop from international migration.
    // Small tolerance for natural growth of destination's own pops.
    const destGrowth = destAfter - destBefore;
    expect(destGrowth).toBeLessThan(destBefore * 0.003);
  });

  it('blocks immigration when destination has closed borders', () => {
    const world = createWorld(GAME_DATA, 1836);
    disableAi(world);

    const pair = findBorderPair(world);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const { origin, destination, originNation, destNation } = pair;

    // Origin open, destination closed.
    world.nations[originNation].reforms.migration_policy = 3;
    world.nations[destNation].reforms.migration_policy = 0;

    setupProvincePops(world, origin, { type: 'laborer', size: 8000, needsMet: 0.05 });
    setupProvincePops(world, destination, { type: 'laborer', size: 4000, needsMet: 0.95 });

    const destBefore = provincePop(world, destination);

    runPopsMonthly(world, GAME_DATA, new Rng(world.rngState));

    const destAfter = provincePop(world, destination);

    // Destination should not gain pop from international migration.
    // Small tolerance for natural growth of destination's own pops.
    const destGrowth = destAfter - destBefore;
    expect(destGrowth).toBeLessThan(destBefore * 0.003);
  });

  it('conserves total population across international migration', () => {
    const world = createWorld(GAME_DATA, 1836);
    disableAi(world);

    const pair = findBorderPair(world);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const { origin, destination, originNation, destNation } = pair;

    world.nations[originNation].reforms.migration_policy = 3;
    world.nations[destNation].reforms.migration_policy = 3;

    setupProvincePops(world, origin, { type: 'laborer', size: 10000, needsMet: 0.05 });
    setupProvincePops(world, destination, { type: 'laborer', size: 5000, needsMet: 0.95 });

    const before = totalPop(world);

    // One tick: growth + migration. Conservation should hold within floor rounding.
    runPopsMonthly(world, GAME_DATA, new Rng(world.rngState));

    const after = totalPop(world);
    // Each pop's growth is floored, so the maximum rounding loss is one per pop.
    // With ~620 provinces and a few pops each, allow ~2000 people rounding drift.
    const drift = Math.abs(after - before);
    expect(drift).toBeLessThan(2000);
  });
});
