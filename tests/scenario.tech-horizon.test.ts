import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld, initialTechKeysForSeed } from '../src/sim/bootstrap';

const CATEGORIES = ['army', 'navy', 'commerce', 'industry', 'culture'] as const;

describe('multi-era technology horizon', () => {
  it('provides research foundations by 1700 and progression through 1945 in every column', () => {
    for (const category of CATEGORIES) {
      const years = GAME_DATA.techs
        .filter((tech) => tech.category === category)
        .map((tech) => tech.year ?? 0);
      expect(Math.min(...years), `${category} starts too late`).toBeLessThanOrEqual(1700);
      expect(Math.max(...years), `${category} ends too early`).toBeGreaterThanOrEqual(1945);
    }
  });

  it('keeps every prerequisite in the same chronological technology column', () => {
    const byKey = new Map(GAME_DATA.techs.map((tech) => [tech.key, tech]));
    for (const tech of GAME_DATA.techs) {
      if (!tech.prereq) continue;
      const prereq = byKey.get(tech.prereq);
      expect(prereq, `${tech.key} has unknown prerequisite ${tech.prereq}`).toBeDefined();
      expect(prereq?.category).toBe(tech.category);
      expect(prereq?.year ?? 0).toBeLessThanOrEqual(tech.year ?? 0);
    }
  });

  it('preserves the 1830 compatibility start while satisfying new root prerequisites', () => {
    const world = createWorld(GAME_DATA, 1820);
    const civilized = world.nations.find((nation) => nation.isCivilized);
    expect(civilized?.techs).toEqual(expect.arrayContaining([
      'flintlock_drill',
      'sailing_design',
      'chartered_trade',
      'manufacture_system',
      'enlightenment',
      'market_structure',
    ]));
  });

  it('derives dated starting technologies through the requested year', () => {
    expect(initialTechKeysForSeed({ initialTechYear: 1700 }, [
      { key: 'early', year: 1690 },
      { key: 'current', year: 1700 },
      { key: 'future', year: 1701 },
      { key: 'undated' },
    ])).toEqual(['early', 'current']);
  });

  it('lets an explicit technology list override the derived horizon', () => {
    expect(initialTechKeysForSeed({ initialTechs: ['future'], initialTechYear: 1700 }, [])).toEqual(['future']);
  });

  it('preserves compatibility behavior when no horizon is supplied', () => {
    expect(initialTechKeysForSeed({}, [])).toBeNull();
  });
});
