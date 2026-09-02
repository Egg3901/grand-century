import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import {
  aiRegimentPlan,
  aiShipType,
  availableRegimentTypes,
  availableShipTypes,
  regimentSpec,
  shipSpec,
} from '../src/sim/militaryCatalog';
import type { FromWorker } from '../src/shared/types';

describe('multi-era military capabilities', () => {
  it('keeps early formations available and gates industrial formations by reform and research', () => {
    const world = createWorld(GAME_DATA, 1936);
    const nation = world.nations[world.playerNation];
    nation.reforms.conscription_level = 0;
    nation.reforms.army_professionalism = 0;
    nation.techs = [];

    expect(availableRegimentTypes(nation)).toEqual(['infantry']);

    nation.reforms.conscription_level = 2;
    nation.reforms.army_professionalism = 2;
    expect(availableRegimentTypes(nation)).toEqual(['infantry', 'cavalry', 'artillery', 'guard']);

    nation.techs.push('army_military_aviation', 'army_mechanized_operations');
    expect(availableRegimentTypes(nation)).toEqual([
      'infantry', 'cavalry', 'artillery', 'guard', 'armor', 'aircraft',
    ]);
    expect(regimentSpec('armor').combat.offense).toBeGreaterThan(regimentSpec('infantry').combat.offense);
  });

  it('gates industrial fleets and gives a researched great power a modern AI mix', () => {
    const world = createWorld(GAME_DATA, 1936);
    const nation = world.nations[world.playerNation];
    nation.reforms.conscription_level = 2;
    nation.reforms.army_professionalism = 2;
    nation.techs = [];

    expect(availableShipTypes(nation)).toEqual(['transport', 'frigate', 'manofwar']);
    expect(aiShipType(nation, true)).toBe('manofwar');

    nation.techs.push(
      'army_military_aviation',
      'army_mechanized_operations',
      'navy_ironclad_warships',
      'navy_torpedo_boats',
      'navy_oil_firing',
      'navy_carrier_aviation',
    );
    expect(aiRegimentPlan(nation, 8)).toContain('armor');
    expect(aiRegimentPlan(nation, 8)).toContain('aircraft');
    expect(aiShipType(nation, true)).toBe('carrier');
    expect(shipSpec('carrier').combatPower).toBeGreaterThan(shipSpec('ironclad').combatPower);
  });

  it('enforces ship technology in the command path', () => {
    const world = createWorld(GAME_DATA, 1936);
    const nation = world.nations[world.playerNation];
    const province = world.provinces.find((candidate) => candidate.owner === nation.id && candidate.coastal);
    expect(province).toBeDefined();
    nation.treasury = 10_000;
    nation.techs = nation.techs.filter((tech) => tech !== 'navy_carrier_aviation');
    const messages: FromWorker[] = [];
    const carrierCount = () => world.fleets
      .flatMap((fleet) => fleet.ships)
      .filter((ship) => ship.type === 'carrier').length;

    applyCommand(
      world,
      GAME_DATA,
      { t: 'buildFleet', province: province!.id, shipType: 'carrier', count: 1 },
      (message) => messages.push(message),
    );
    expect(carrierCount()).toBe(0);
    expect(messages.some((message) => message.t === 'log' && message.level === 'warn')).toBe(true);

    nation.techs.push('navy_carrier_aviation');
    applyCommand(
      world,
      GAME_DATA,
      { t: 'buildFleet', province: province!.id, shipType: 'carrier', count: 1 },
      (message) => messages.push(message),
    );
    expect(carrierCount()).toBe(1);
  });
});
