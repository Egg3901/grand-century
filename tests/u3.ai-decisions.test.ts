import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

describe('U3 — AI decision uptake', () => {
  it('AI nations take decisions over time; player is untouched; determinism holds', () => {
    const run = (seed: number) => {
      const world = createWorld(GAME_DATA, seed);
      for (let day = 0; day < 365 * 8; day++) advanceDay(world, GAME_DATA);
      return world;
    };
    const world = run(2024);
    const taken = Object.keys(world.decisionLastTaken ?? {});
    const aiTaken = taken.filter((key) => Number(key.split(':')[1]) !== world.playerNation);
    expect(aiTaken.length).toBeGreaterThan(3);

    // player decisions remain player-initiated only
    const playerTaken = taken.filter((key) => Number(key.split(':')[1]) === world.playerNation);
    expect(playerTaken.length).toBe(0);

    // AI never dips below its floor via decisions alone is hard to isolate;
    // instead assert no nation was bankrupted into the abyss by decision spam
    const worstTreasury = Math.min(...world.nations.map((nation) => nation.treasury));
    expect(worstTreasury).toBeGreaterThan(-30_000);

    // determinism: same seed → same decisions taken
    const world2 = run(2024);
    expect(Object.keys(world2.decisionLastTaken ?? {}).sort()).toEqual(taken.sort());
  }, 240_000);
});
