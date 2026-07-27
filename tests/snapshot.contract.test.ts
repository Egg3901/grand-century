import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { extractPlayerView, extractShared } from '../src/net/snapshotCodec';
import { createWorld } from '../src/sim/bootstrap';
import { buildPlayerView, buildSharedSnapshot, buildSnapshot } from '../src/sim/snapshot';
import { advanceDay } from '../src/sim/world';

describe('snapshot contract', () => {
  it('returns one province summary per world province', () => {
    const world = createWorld(GAME_DATA, 1836);
    const snap = buildSnapshot(world, GAME_DATA);
    expect(snap.provinces).toHaveLength(world.provinces.length);
  });

  it('composed shared + player view deep-equals buildSnapshot wire fields over 200 days', () => {
    const world = createWorld(GAME_DATA, 1836);
    const days = 200;
    for (let i = 0; i < days; i++) {
      advanceDay(world, GAME_DATA);
      // Sample every 25 days + final day — full every-day would dominate wall time.
      if (i % 25 !== 24 && i !== days - 1) continue;

      const full = buildSnapshot(world, GAME_DATA);
      const shared = buildSharedSnapshot(world, GAME_DATA);
      const view = buildPlayerView(world, GAME_DATA, world.playerNation);

      // Player wire fields: exact compose identity.
      expect(extractPlayerView(full)).toEqual(view);

      // Shared wire fields: identical except cultureHeartland, which the former
      // single-pass (and buildSnapshot) stamps from world.playerNation onto
      // provinces after the shared build.
      const heartlandStates = new Set<number>();
      for (const movement of world.movements ?? []) {
        if (movement.nation !== world.playerNation) continue;
        for (const stateId of movement.heartlandStateIds) heartlandStates.add(stateId);
      }
      const sharedWithHeartland = {
        ...shared,
        provinces: shared.provinces.map((province) => ({
          ...province,
          cultureHeartland: heartlandStates.has(province.stateId) ? true : false,
        })),
      };
      expect(extractShared(full)).toEqual(sharedWithHeartland);
    }
  });
});
