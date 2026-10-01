import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { compileHistoricalWorld, validateHistoricalAnchors } from '../content/history/compileHistoricalWorld.mjs';
import { makeProvinceLocator } from '../content/history/locateProvince.mjs';
import provincesGeo from '../src/data/generated/provinces.geo.json';

const locate = makeProvinceLocator(provincesGeo as never);

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
    expect(() => validateHistoricalAnchors(WORLD_SEED, anchors, locate)).not.toThrow();
  });

  it('is reproducible and idempotent from the generated seed', () => {
    const compiled = compileHistoricalWorld(WORLD_SEED, polities, ownership, anchors, locate);
    expect(compiled).toEqual(WORLD_SEED);
  });

  it('rejects an anchored province going missing instead of shipping the wrong land', () => {
    // Anchors key on location, not id or name: both change on every re-cut.
    // An anchor whose point falls on no province must fail loudly.
    const missing = { ...anchors, anchors: [{ id: 'nowhere', kind: 'province', place: 'Mid-Atlantic', lon: -40, lat: 30, ownerTag: 'ENG' }] };
    expect(() => validateHistoricalAnchors(WORLD_SEED, missing, locate)).toThrow();
  });

  it('rejects an anchored province changing hands', () => {
    const drifted = structuredClone(WORLD_SEED);
    const anchorList = anchors.anchors as { kind: string; lon: number; lat: number; ownerTag: string }[];
    const target = anchorList.find((entry) => entry.kind === 'province')!;
    const province = drifted.provinces[locate(target.lon, target.lat)!];
    province.ownerTag = province.ownerTag === 'FRA' ? 'ENG' : 'FRA';
    expect(() => validateHistoricalAnchors(drifted, anchors, locate)).toThrow();
  });

  it('starts on the 1830 political map, not Vic2\'s 1836 one', () => {
    const owner = (lon: number, lat: number) => WORLD_SEED.provinces[locate(lon, lat)!]?.ownerTag;
    expect(owner(3.04, 36.70)).toBe('ALG');     // Algiers: French invasion is June 1830
    expect(owner(3.72, 51.05)).toBe('NLD');     // Ghent: Belgian revolt is August 1830
    expect(owner(-98.49, 29.42)).toBe('MEX');   // San Antonio: Republic of Texas is 1836
    expect(owner(-78.47, -0.18)).toBe('CLM');   // Quito: Gran Colombia breaks up in 1831
    expect(owner(36.29, 33.51)).toBe('OTT');    // Damascus: Egypt takes Syria in 1831-33
    expect(owner(21.01, 52.23)).toBe('POL');    // Warsaw: Congress Poland until 1831
    expect(owner(22.37, 37.51)).toBe('GRE');    // Tripolitsa: independent since the 1830 protocol
    // The cities the legacy cut put in the wrong polity (issue #78).
    expect(owner(-0.13, 51.51)).toBe('ENG');    // London
    expect(owner(13.40, 52.52)).toBe('PRU');    // Berlin
    expect(owner(2.35, 48.86)).toBe('FRA');     // Paris
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
    // World v8 provinces are administrative units grouped to the reviewed
    // density table in content/world-v8/group.py; the count is a deliberate
    // target. Wide bounds: this is a smoke test, not a pinned snapshot.
    expect(WORLD_SEED.provinces.length).toBeGreaterThanOrEqual(1500);
    expect(WORLD_SEED.provinces.length).toBeLessThanOrEqual(3000);
    expect(WORLD_SEED.states.length).toBeGreaterThan(400);

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
