import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { generateProceduralWorld, resolveWorldSeed } from '../src/sim/proceduralWorld';
import { parseCampaignMapMode, isCampaignMapMode } from '../src/shared/campaignMap';

describe('campaign map modes', () => {
  it('parses known map modes and rejects unknown ones', () => {
    expect(isCampaignMapMode('historical')).toBe(true);
    expect(isCampaignMapMode('procedural_real')).toBe(true);
    expect(isCampaignMapMode('procedural_random')).toBe(true);
    expect(isCampaignMapMode('sandbox')).toBe(false);
    expect(parseCampaignMapMode('procedural_real')).toBe('procedural_real');
    expect(parseCampaignMapMode('nope')).toBe('historical');
  });

  it('keeps the historical seed unchanged', () => {
    const resolved = resolveWorldSeed(WORLD_SEED, 1836, 'historical');
    expect(resolved).toBe(WORLD_SEED);
  });

  it('generates contiguous real-country ownership deterministically', () => {
    const a = generateProceduralWorld(WORLD_SEED, 42, 'procedural_real');
    const b = generateProceduralWorld(WORLD_SEED, 42, 'procedural_real');
    expect(a.provinces.map((p) => p.ownerTag)).toEqual(b.provinces.map((p) => p.ownerTag));
    expect(a.nations.map((n) => n.tag).sort()).toEqual(b.nations.map((n) => n.tag).sort());

    const playable = a.nations.filter((n) => !['COL', 'UNC', 'UNA'].includes(n.tag));
    expect(playable.length).toBeGreaterThanOrEqual(12);
    expect(playable.every((n) => WORLD_SEED.nations.some((h) => h.tag === n.tag))).toBe(true);

    // Every non-placeholder province has an owner present in the nation list.
    const tags = new Set(a.nations.map((n) => n.tag));
    for (const province of a.provinces) {
      expect(tags.has(province.ownerTag)).toBe(true);
    }

    // Neighboring same-owner check: most owned land should touch same-owner land.
    let sameOwnerEdges = 0;
    let ownedEdges = 0;
    const byId = new Map(a.provinces.map((p) => [p.id, p]));
    for (const province of a.provinces) {
      if (['COL', 'UNC', 'UNA'].includes(province.ownerTag)) continue;
      for (const neighborId of province.neighbors) {
        const neighbor = byId.get(neighborId);
        if (!neighbor || ['COL', 'UNC', 'UNA'].includes(neighbor.ownerTag)) continue;
        ownedEdges += 1;
        if (neighbor.ownerTag === province.ownerTag) sameOwnerEdges += 1;
      }
    }
    expect(ownedEdges).toBeGreaterThan(0);
    expect(sameOwnerEdges / ownedEdges).toBeGreaterThan(0.55);
  });

  it('generates invented nations for random-country mode', () => {
    const generated = generateProceduralWorld(WORLD_SEED, 99, 'procedural_random');
    const playable = generated.nations.filter((n) => !['COL', 'UNC', 'UNA'].includes(n.tag));
    expect(playable.length).toBeGreaterThanOrEqual(12);
    const historicalTags = new Set(WORLD_SEED.nations.map((n) => n.tag));
    const invented = playable.filter((n) => !historicalTags.has(n.tag));
    expect(invented.length).toBe(playable.length);
    expect(new Set(playable.map((n) => n.tag)).size).toBe(playable.length);
  });

  it('boots a playable world for each map mode', () => {
    for (const mode of ['historical', 'procedural_real', 'procedural_random'] as const) {
      const world = createWorld(GAME_DATA, 1836, mode);
      expect(world.mapMode).toBe(mode);
      expect(world.provinces.length).toBe(WORLD_SEED.provinceCount);
      expect(world.nations.length).toBeGreaterThan(5);
      expect(world.provinces.every((p) => world.nations[p.owner])).toBe(true);
    }
  });
});
