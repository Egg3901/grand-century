import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { compileHistoricalWorld, validateHistoricalAnchors } from '../content/history/compileHistoricalWorld.mjs';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;
const polities = readJson('../content/history/1820/polities.json');
const ownership = readJson('../content/history/1820/ownership.json');
const anchors = readJson('../content/history/1820/anchors.json');
const ORIGINAL_TAGS = ['AFG', 'ARG', 'AUS', 'BAD', 'BAV', 'BHU', 'BUR', 'CAM', 'CHL', 'CLM', 'DEN', 'EGY', 'ENG', 'ESP', 'ETH', 'FRA', 'HAN', 'HES', 'JPN', 'KOR', 'LAO', 'MEX', 'MOD', 'MOR', 'NEP', 'NLD', 'OTT', 'PAP', 'PAR', 'PER', 'POR', 'PRG', 'PRU', 'QNG', 'RUS', 'SAR', 'SAX', 'SIA', 'SWE', 'SWI', 'TSC', 'TUS', 'UNC', 'USA', 'VEN', 'VIE', 'WUR', 'BRA', 'PEU', 'BOL', 'URU', 'ECU', 'UCA', 'HAI', 'GRE', 'SER', 'TUN', 'TRI', 'SIK', 'HYD', 'AWA', 'ACE', 'SOK', 'ZUL', 'MAD', 'OMA', 'ASH'];
const APPENDED_1820_TAGS = ['RUA', 'HAW', 'FIN', 'POL', 'LVN', 'ALG', 'HEJ', 'SEN', 'DAR', 'KZH', 'BUK', 'KHI', 'KOK'];

describe('checked-in 1820 historical map', () => {
  it('matches every source-backed historical anchor', () => {
    expect(() => validateHistoricalAnchors(WORLD_SEED, anchors)).not.toThrow();
  });

  it('is reproducible and idempotent from the generated seed', () => {
    const compiled = compileHistoricalWorld(WORLD_SEED, polities, ownership, anchors);
    expect(compiled).toEqual(WORLD_SEED);
  });

  it('rejects province-id drift instead of silently assigning the wrong land', () => {
    const drifted = structuredClone(WORLD_SEED);
    drifted.provinces[521].name = 'Wrong Alaska';
    expect(() => compileHistoricalWorld(drifted, polities, ownership, anchors))
      .toThrow(/province 521 renamed/);
  });

  it('breaks up the worst modern imperial blobs', () => {
    const owner = (id: number) => WORLD_SEED.provinces.find((province) => province.id === id)?.ownerTag;
    expect(owner(521)).toBe('RUA');
    expect(owner(530)).toBe('HAW');
    expect(owner(264)).toBe('KZH');
    expect(owner(488)).toBe('OTT');
    expect(owner(480)).toBe('DAR');
    expect(WORLD_SEED.nations).toHaveLength(80);
    expect(WORLD_SEED.provinces.filter((province) => province.ownerTag === 'UNC').length).toBeLessThanOrEqual(105);
  });

  it('appends new polities without renumbering the original nation roster', () => {
    expect(WORLD_SEED.nations.slice(0, 67).map((nation) => nation.tag)).toEqual(ORIGINAL_TAGS);
    expect(WORLD_SEED.nations.slice(67).map((nation) => nation.tag)).toEqual(APPENDED_1820_TAGS);
  });

  it('ships deliberate religion and culture instead of generic fallbacks', () => {
    const nation = (tag: string) => WORLD_SEED.nations.find((entry) => entry.tag === tag);
    expect(nation('HAW')).toMatchObject({ primaryCulture: 'polynesian', religion: 'traditional' });
    expect(nation('RUA')).toMatchObject({ primaryCulture: 'russian', religion: 'orthodox' });
    for (const tag of ['ALG', 'HEJ', 'SEN', 'DAR', 'KZH', 'BUK', 'KHI', 'KOK']) {
      expect(nation(tag)?.religion).toBe('sunni');
    }
  });
});
