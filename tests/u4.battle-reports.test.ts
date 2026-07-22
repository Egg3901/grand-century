import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import { buildSnapshot } from '../src/sim/snapshot';

describe('1.0-U4 — battle reports', () => {
  it('battles produce reports with factor attribution; snapshot filters to player', () => {
    const world = createWorld(GAME_DATA, 1815);
    // run until any war produces battles (AI wars happen within a few years)
    let guard = 365 * 6;
    while (guard-- > 0 && (world.recentBattles?.length ?? 0) === 0) {
      advanceDay(world, GAME_DATA);
    }
    expect(world.recentBattles?.length ?? 0).toBeGreaterThan(0);
    const report = world.recentBattles![0];
    expect(report.provinceName.length).toBeGreaterThan(0);
    expect(['attacker_victory', 'defender_victory', 'clash']).toContain(report.outcome);
    for (const key of ['roll', 'organization', 'leadership', 'technology', 'terrain', 'fort'] as const) {
      expect(Number.isFinite(report.factors[key])).toBe(true);
    }
    // ring cap holds
    expect(world.recentBattles!.length).toBeLessThanOrEqual(24);

    // snapshot only carries player-involved battles
    const snapshot = buildSnapshot(world, GAME_DATA);
    for (const battle of snapshot.recentBattles ?? []) {
      expect(
        battle.attackerNation === world.playerNation || battle.defenderNation === world.playerNation,
      ).toBe(true);
    }
  }, 120_000);
});
