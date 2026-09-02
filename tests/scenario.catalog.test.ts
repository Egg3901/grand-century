import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  DEFAULT_SCENARIO_ID,
  listScenarios,
  loadScenario,
  WORLD_SEED,
} from '../src/data/generated';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { dateAtDay } from '../src/sim/calendar';

describe('scenario catalog', () => {
  it('registers the current 1830 world as the compatibility baseline', () => {
    expect(DEFAULT_SCENARIO_ID).toBe('1830-01-01');
    expect(listScenarios().map((scenario) => [scenario.id, scenario.status])).toEqual([
      ['1700-01-01', 'development'],
      ['1776-07-04', 'development'],
      ['1815-06-18', 'development'],
      ['1830-01-01', 'playable'],
      ['1914-07-28', 'development'],
      ['1936-01-01', 'preview'],
      ['1945-09-02', 'development'],
    ]);
    expect(listScenarios().every((scenario) => scenario.visualPolicy.naziImagery === 'prohibited')).toBe(true);
    expect(DEFAULT_SCENARIO.manifest.startDate).toEqual({ year: 1830, month: 1, day: 1 });
    expect(DEFAULT_SCENARIO.worldSeed).toBe(WORLD_SEED);
  });

  it('registers compiled development scenarios without advertising them as playable', () => {
    expect(loadScenario('1700-01-01').worldSeed.provinceCount).toBe(WORLD_SEED.provinceCount);
    expect(loadScenario('1936-01-01').manifest.status).toBe('preview');
    expect(() => loadScenario('1789-07-14')).toThrow('Unknown scenario: 1789-07-14');
  });

  it('records scenario identity and epoch in every new world', () => {
    const world = createWorld(GAME_DATA, 1820);
    expect(world.scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(world.startDate).toEqual(DEFAULT_SCENARIO.manifest.startDate);
  });

  it('boots a registered historical epoch with its matching seed', () => {
    const data1700 = {
      ...GAME_DATA,
      scenarioId: '1700-01-01',
      startDate: { year: 1700, month: 1, day: 1 },
    };
    const world = createWorld(data1700, 1820);
    expect(world.scenarioId).toBe('1700-01-01');
    expect(world.startDate).toEqual({ year: 1700, month: 1, day: 1 });
    expect(world.provinces).toHaveLength(loadScenario('1700-01-01').worldSeed.provinceCount);
  });

  it('supports exact non-January scenario dates', () => {
    const startDate = { year: 1914, month: 7, day: 28 };
    expect(dateAtDay(0, startDate)).toEqual(startDate);
    expect(dateAtDay(157, startDate)).toEqual({ year: 1915, month: 1, day: 1 });
  });

  it('boots the 1945 development seed with an exact clock and shifted technology horizon', () => {
    const scenario = loadScenario('1945-09-02');
    const source = loadScenario('1936-01-01');
    expect(scenario.manifest.seedProvenance).toMatchObject({
      kind: 'inherited_development', sourceScenarioId: '1936-01-01',
    });
    expect(scenario.worldSeed.nations[0].initialTechYear)
      .toBe((source.worldSeed.nations[0].initialTechYear ?? 1936) + 9);
    const world = createWorld({
      ...GAME_DATA,
      scenarioId: '1945-09-02',
      startDate: { year: 1945, month: 9, day: 2 },
    }, 1820);
    expect(world.startDate).toEqual({ year: 1945, month: 9, day: 2 });
  });
});
