import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { buildSnapshot } from '../src/sim/snapshot';

describe('snapshot contract', () => {
  it('returns one province summary per world province', () => {
    const world = createWorld(GAME_DATA, 1836);
    const snap = buildSnapshot(world, GAME_DATA);
    expect(snap.provinces).toHaveLength(world.provinces.length);
  });
});
