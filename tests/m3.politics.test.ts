import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { applyCommand } from '../src/sim/commands';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

function noopPost() {
  // Intentionally empty for command tests.
}

describe('M3 politics and unrest', () => {
  it('rejects illegal reforms and applies legal reforms', () => {
    const world = createWorld(GAME_DATA, 1901);
    const nation = world.nations[world.playerNation];
    nation.treasury = 25_000;
    nation.prestige = 200;
    nation.upperHouse = {
      reactionary: 0,
      conservative: 1,
      liberal: 0,
      socialist: 0,
      communist: 0,
      fascist: 0,
    };

    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: 'voting_franchise', level: 3 }, noopPost);
    expect(nation.reforms.voting_franchise).toBe(0);

    const treasuryBefore = nation.treasury;
    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: 'conscription_level', level: 1 }, noopPost);
    expect(nation.reforms.conscription_level).toBe(1);
    expect(nation.treasury).toBeLessThan(treasuryBefore);
  });

  it('sustained unmet needs pushes a state into rebellion', () => {
    const world = createWorld(GAME_DATA, 1902);
    const nation = world.nations[world.playerNation];
    nation.treasury = 30_000;
    nation.prestige = 200;
    const state = world.states.find((candidate) => candidate.owner === world.playerNation);
    expect(state).toBeTruthy();
    if (!state) return;

    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop) continue;
        pop.needsMet = 0.02;
        pop.militancy = 6.1;
        pop.consciousness = 6;
      }
    }

    for (let day = 0; day < 365; day++) advanceDay(world, GAME_DATA);

    const hasRebelArmy = world.armies.some((army) => (
      army.rebel
      && army.hostileTo === world.playerNation
      && state.provinceIds.includes(army.location)
    ));
    expect(hasRebelArmy || state.unrestRisk > 0.65).toBe(true);
  });

  it('higher conscription reform increases mobilization capacity', () => {
    const world = createWorld(GAME_DATA, 1903);
    const nation = world.nations[world.playerNation];
    nation.treasury = 40_000;
    nation.prestige = 200;
    nation.upperHouse = {
      reactionary: 0,
      conservative: 1,
      liberal: 0,
      socialist: 0,
      communist: 0,
      fascist: 0,
    };

    const base = nation.mobilizationCapacity;
    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: 'conscription_level', level: 1 }, noopPost);
    const mid = nation.mobilizationCapacity;
    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: 'conscription_level', level: 2 }, noopPost);
    const high = nation.mobilizationCapacity;

    expect(mid).toBeGreaterThan(base);
    expect(high).toBeGreaterThan(mid);
  });

  it('keeps elections deterministic for the same seed', () => {
    const a = createWorld(GAME_DATA, 1904);
    const b = createWorld(GAME_DATA, 1904);
    const nationA = a.nations[a.playerNation];
    const nationB = b.nations[b.playerNation];
    nationA.government = 'democracy';
    nationB.government = 'democracy';
    nationA.nextElectionYear = 1837;
    nationB.nextElectionYear = 1837;
    nationA.electionIntervalYears = 4;
    nationB.electionIntervalYears = 4;

    for (let day = 0; day < 380; day++) {
      advanceDay(a, GAME_DATA);
      advanceDay(b, GAME_DATA);
    }

    expect(a.nations[a.playerNation].rulingParty).toBe(b.nations[b.playerNation].rulingParty);
    expect(a.nations[a.playerNation].electionLastResult).toBe(b.nations[b.playerNation].electionLastResult);
  });
});
