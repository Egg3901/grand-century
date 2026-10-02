import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BORROWED_1936_SCENARIOS,
  isScenarioLoaded,
  loadScenario,
  preloadScenarios,
  withScenarios,
} from '../src/data/generated';
import { gameDataForScenario } from '../src/data/gameData';
import { deserializeWorld, serializeWorld } from '../src/sim/persistence';
import { advanceDay } from '../src/sim/world';

/**
 * Saves written by the first world v8 release (fixtures generated from
 * dfe76de). Content corrections since then keep the same province mesh, so
 * these must keep loading, and 1914/1945 campaigns must stay on the borrowed
 * 1936 world they were started in.
 */
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('world v8.0 saves', () => {
  beforeAll(() => preloadScenarios());

  it('loads an 1830 campaign from the first v8 release and keeps playing', async () => {
    const { world } = await withScenarios(() => deserializeWorld(fixture('v8.0-1830.save.gz')));
    expect(world.scenarioId).toBe('1830-01-01');
    expect(world.provinces).toHaveLength(loadScenario('1830-01-01').worldSeed.provinceCount);
    const data = gameDataForScenario('1830-01-01');
    for (let day = 0; day < 10; day++) advanceDay(world, data);
    expect(Number.isFinite(world.day)).toBe(true);
  });

  it('keeps a 1914 campaign from the first v8 release on the borrowed 1936 world', async () => {
    const { world } = await withScenarios(() => deserializeWorld(fixture('v8.0-1914.save.gz')));
    expect(world.scenarioId).toBe(BORROWED_1936_SCENARIOS['1914-07-28']);
    expect(world.startDate).toEqual({ year: 1914, month: 7, day: 28 });
    const borrowed = loadScenario(world.scenarioId!);
    expect(borrowed.worldSeed.nations.length).toBe(world.nations.length);
    const data = gameDataForScenario(world.scenarioId!);
    for (let day = 0; day < 10; day++) advanceDay(world, data);
    // A re-save of the migrated campaign loads again under its hidden id.
    const again = await withScenarios(() => deserializeWorld(serializeWorld(world)));
    expect(again.world.scenarioId).toBe(world.scenarioId);
  });
});

describe('era seeds', () => {
  beforeAll(() => preloadScenarios());

  it('plays 1914 and 1945 on their own compiled worlds, not the 1936 one', () => {
    const base = loadScenario('1936-01-01').worldSeed;
    for (const id of ['1914-07-28', '1945-09-02', '1776-07-04', '1815-06-18']) {
      const seed = loadScenario(id).worldSeed;
      expect(seed.source, id).not.toMatch(/inherited/);
      expect(seed.provinceCount).toBe(base.provinceCount);
    }
    const owners = (id: string) => loadScenario(id).worldSeed.provinces.map((p) => p.ownerTag).join();
    expect(owners('1914-07-28')).not.toBe(owners('1936-01-01'));
    expect(owners('1945-09-02')).not.toBe(owners('1936-01-01'));
  });

  it('registers hidden compatibility worlds without listing them', () => {
    for (const hidden of Object.values(BORROWED_1936_SCENARIOS)) expect(isScenarioLoaded(hidden)).toBe(true);
  });
});
