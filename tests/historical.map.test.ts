import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { compileHistoricalWorld, validateHistoricalAnchors } from '../content/history/compileHistoricalWorld.mjs';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;
const polities = readJson('../content/history/1830/polities.json');
const ownership = readJson('../content/history/1830/ownership.json');
const anchors = readJson('../content/history/1830/anchors.json');

/**
 * The map is cut to Victoria II's state regions and its ownership comes from
 * Vic2's own province history, rolled back to 1830 by
 * content/vic2/vic2-1830-deltas.json. These tests guard the seam between that
 * generated map and the hand-written polity overlay on top of it.
 */
describe('checked-in 1830 historical map', () => {
  it('matches every source-backed historical anchor', () => {
    expect(() => validateHistoricalAnchors(WORLD_SEED, anchors)).not.toThrow();
  });

  it('is reproducible and idempotent from the generated seed', () => {
    const compiled = compileHistoricalWorld(WORLD_SEED, polities, ownership, anchors);
    expect(compiled).toEqual(WORLD_SEED);
  });

  it('rejects province-id drift instead of silently assigning the wrong land', () => {
    const drifted = structuredClone(WORLD_SEED);
    const anchorList = anchors.anchors as { kind: string; provinceId: number; provinceName: string }[];
    const target = anchorList.find((entry) => entry.kind === 'province')!;
    const province = drifted.provinces.find((p) => p.id === target.provinceId)!;
    province.name = 'Wrong Province';
    expect(() => validateHistoricalAnchors(drifted, anchors)).toThrow();
  });

  it('starts on the 1830 political map, not Vic2\'s 1836 one', () => {
    const owner = (name: string) => WORLD_SEED.provinces.find((province) => province.name === name)?.ownerTag;
    expect(owner('Algiers')).toBe('ALG');       // French invasion is June 1830
    expect(owner('Vlaanderen')).toBe('NLD');    // Belgian revolt is August 1830
    expect(owner('Texas')).toBe('MEX');         // Republic of Texas is 1836
    expect(owner('Ecuador')).toBe('CLM');       // Gran Colombia breaks up in 1831
    expect(owner('Syria')).toBe('OTT');         // Egypt takes Syria in 1831-33
    expect(owner('Mazowieckie')).toBe('POL');   // Congress Poland until 1831
    expect(owner('Peloponnese')).toBe('GRE');   // independent since the 1830 protocol
  });

  it('carries the relationships the map alone cannot express', () => {
    const nation = (tag: string) => WORLD_SEED.nations.find((entry) => entry.tag === tag);
    expect(nation('POL')).toMatchObject({ polityStatus: 'constituent', overlordTag: 'RUS' });
    expect(nation('EGY')).toMatchObject({ polityStatus: 'vassal', overlordTag: 'OTT' });
    expect(nation('SER')).toMatchObject({ polityStatus: 'vassal', overlordTag: 'OTT' });
    expect(nation('TIB')).toMatchObject({ polityStatus: 'tributary', overlordTag: 'QNG' });
    expect(nation('GRE')).toMatchObject({ polityStatus: 'sovereign' });
  });

  it('gives every great power land and every nation somewhere to stand', () => {
    const owners = new Set(WORLD_SEED.provinces.map((province) => province.ownerTag));
    for (const tag of ['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'QNG', 'OTT']) {
      expect(owners.has(tag), tag).toBe(true);
    }
    // The historical compiler rejects landless polities outright, so this also
    // guards against a nation surviving in the roster with no provinces.
    for (const nation of WORLD_SEED.nations) {
      expect(owners.has(nation.tag), nation.tag).toBe(true);
    }
  });

  it('keeps the province and state cut inside its intended shape', () => {
    // 549 Vic2 regions, less a handful of islands with no land at Natural
    // Earth 50m. Wide bounds: this is a smoke test, not a pinned snapshot.
    expect(WORLD_SEED.provinces.length).toBeGreaterThanOrEqual(520);
    expect(WORLD_SEED.provinces.length).toBeLessThanOrEqual(549);
    expect(WORLD_SEED.states.length).toBeGreaterThan(120);

    const byId = new Map(WORLD_SEED.provinces.map((province) => [province.id, province]));
    for (const state of WORLD_SEED.states) {
      expect(state.provinceIds.length).toBeGreaterThan(0);
      const owners = new Set(state.provinceIds.map((id) => byId.get(id)!.ownerTag));
      expect(owners.size, `state ${state.name} crosses owners`).toBe(1);
      // Internal cluster keys must never surface as a player-visible name.
      expect(state.name).not.toContain('|');
    }
  });

  it('ships a local flag for every playable polity', () => {
    for (const nation of WORLD_SEED.nations) {
      expect(existsSync(new URL(`../public/flags/${nation.tag}.svg`, import.meta.url)), nation.tag).toBe(true);
    }
  });
});
