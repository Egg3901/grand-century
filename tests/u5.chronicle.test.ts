import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import { buildSnapshot } from '../src/sim/snapshot';

describe('1.0-U5 — campaign chronicle', () => {
  it('records one line per year with the player story; flags campaign end', () => {
    const world = createWorld(GAME_DATA, 1900);
    for (let day = 0; day < 365 * 3 + 5; day++) advanceDay(world, GAME_DATA);
    expect(world.chronicle?.length).toBe(3);
    const entry = world.chronicle![0];
    expect(entry.year).toBe(1831);
    expect(entry.provinces).toBeGreaterThan(0);
    expect(entry.population).toBeGreaterThan(0);
    expect(entry.tag.length).toBeGreaterThanOrEqual(2);

    let snap = buildSnapshot(world, GAME_DATA);
    expect(snap.campaignOver).toBeNull();
    expect(snap.chronicle?.length).toBe(3);

    // century end flips the flag
    world.day = 100 * 365 + 1;
    snap = buildSnapshot(world, GAME_DATA);
    expect(snap.campaignOver).toBe('century');

    // elimination flips it too
    world.day = 50 * 365;
    for (const province of world.provinces) {
      if (province.owner === world.playerNation) province.owner = (world.playerNation + 1) % world.nations.length;
    }
    snap = buildSnapshot(world, GAME_DATA);
    expect(snap.campaignOver).toBe('eliminated');
  }, 240_000);
});
