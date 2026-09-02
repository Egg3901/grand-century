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
import { snapshot } from '../src/sim/world';

describe('scenario catalog', () => {
  it('registers the current 1830 world as the compatibility baseline', () => {
    expect(DEFAULT_SCENARIO_ID).toBe('1830-01-01');
    expect(listScenarios()).toEqual([DEFAULT_SCENARIO.manifest]);
    expect(DEFAULT_SCENARIO.manifest.startDate).toEqual({ year: 1830, month: 1, day: 1 });
    expect(DEFAULT_SCENARIO.worldSeed).toBe(WORLD_SEED);
  });

  it('fails fast for an unknown scenario', () => {
    expect(() => loadScenario('1700-01-01')).toThrow('Unknown scenario: 1700-01-01');
  });

  it('records scenario identity and epoch in every new world', () => {
    const world = createWorld(GAME_DATA, 1820);
    expect(world.scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(world.startDate).toEqual(DEFAULT_SCENARIO.manifest.startDate);
  });

  it('drives the runtime clock from the selected scenario epoch', () => {
    const data1700 = {
      ...GAME_DATA,
      scenarioId: '1700-01-01',
      startDate: { year: 1700, month: 1, day: 1 },
    };
    const world = createWorld(data1700, 1820);
    world.day = 365;

    expect(snapshot(world, data1700).date).toEqual({ year: 1701, month: 1, day: 1 });
    expect(world.nations.find((nation) => nation.nextElectionYear < Number.MAX_SAFE_INTEGER)?.nextElectionYear)
      .toBeGreaterThanOrEqual(1700);
  });

  it('supports exact non-January scenario dates', () => {
    const startDate = { year: 1914, month: 7, day: 28 };
    expect(dateAtDay(0, startDate)).toEqual(startDate);
    expect(dateAtDay(157, startDate)).toEqual({ year: 1915, month: 1, day: 1 });
  });
});
