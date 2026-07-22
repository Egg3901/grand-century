import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { applyCommand } from '../src/sim/commands';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import {
  computeReformLegality,
  REFORM_FATIGUE_DECAY_PER_MONTH,
  REFORM_FATIGUE_MAX_COST_MULTIPLIER_EXTRA,
  REFORM_FATIGUE_MAX_SUPPORT_PENALTY,
  reformFatigueGain,
} from '../src/sim/politics';

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

    for (let day = 0; day < 365 * 2; day++) {
      if (day % 30 === 0) {
        for (const provinceId of state.provinceIds) {
          const province = world.provinces[provinceId];
          if (!province) continue;
          for (const popId of province.popIds) {
            const pop = world.pops[popId];
            if (!pop) continue;
            pop.needsMet = 0.02;
            pop.militancy = 7.4;
            pop.consciousness = 6;
            pop.money = 0;
          }
        }
      }
      advanceDay(world, GAME_DATA);
    }

    const hasRebelArmy = world.armies.some((army) => (
      army.rebel
      && army.hostileTo === world.playerNation
      && state.provinceIds.includes(army.location)
    ));
    expect(hasRebelArmy || state.unrestRisk > 0.8).toBe(true);
  }, 20_000);

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

describe('reform political fatigue', () => {
  function prepareReformNation(seed: number) {
    const world = createWorld(GAME_DATA, seed);
    const nation = world.nations[world.playerNation];
    nation.treasury = 50_000;
    nation.prestige = 200;
    nation.reformFatigue = undefined;
    nation.upperHouse = {
      reactionary: 0,
      conservative: 1,
      liberal: 0,
      socialist: 0,
      communist: 0,
      fascist: 0,
    };
    // Keep levels at defaults so level-1 military/social reforms are sequential next steps.
    nation.reforms.conscription_level = 0;
    nation.reforms.army_professionalism = 0;
    nation.reforms.healthcare = 0;
    return { world, nation };
  }

  it('baseline enactment with no fatigue matches unpenalized legality', () => {
    const { world, nation } = prepareReformNation(1910);
    const reform = GAME_DATA.reforms.find((entry) => entry.key === 'conscription_level');
    expect(reform).toBeTruthy();
    if (!reform) return;

    const legality = computeReformLegality(world, GAME_DATA, nation, reform, 1);
    expect(nation.reformFatigue ?? 0).toBe(0);
    expect(legality.legal).toBe(true);
    // Military level 1: £390+165, prestige 0.9+0.35 — no fatigue multiplier.
    expect(legality.costMoney).toBe(555);
    expect(legality.costPrestige).toBe(1.25);
    expect(legality.support).toBe(1);
  });

  it('enacting one reform raises the bar for a second reform shortly after', () => {
    const { world, nation } = prepareReformNation(1911);
    const first = GAME_DATA.reforms.find((entry) => entry.key === 'conscription_level');
    const second = GAME_DATA.reforms.find((entry) => entry.key === 'army_professionalism');
    expect(first && second).toBeTruthy();
    if (!first || !second) return;

    const before = computeReformLegality(world, GAME_DATA, nation, second, 1);
    expect(before.legal).toBe(true);

    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: first.key, level: 1 }, noopPost);
    expect(nation.reforms.conscription_level).toBe(1);
    const expectedFatigue = reformFatigueGain(first.category, 1);
    expect(nation.reformFatigue).toBeCloseTo(expectedFatigue, 5);
    expect(expectedFatigue).toBeGreaterThan(0.3);

    const after = computeReformLegality(world, GAME_DATA, nation, second, 1);
    expect(after.support).toBeLessThan(before.support);
    expect(after.support).toBeCloseTo(
      before.support - expectedFatigue * REFORM_FATIGUE_MAX_SUPPORT_PENALTY,
      5,
    );
    expect(after.costMoney).toBeGreaterThan(before.costMoney);
    expect(after.costPrestige).toBeGreaterThan(before.costPrestige);
    const expectedMult = 1 + expectedFatigue * REFORM_FATIGUE_MAX_COST_MULTIPLIER_EXTRA;
    expect(after.costMoney).toBe(Math.round(before.costMoney * expectedMult));
  });

  it('fatigue penalty decays back toward baseline over months', () => {
    const { world, nation } = prepareReformNation(1912);
    const first = GAME_DATA.reforms.find((entry) => entry.key === 'conscription_level');
    const second = GAME_DATA.reforms.find((entry) => entry.key === 'healthcare');
    expect(first && second).toBeTruthy();
    if (!first || !second) return;

    const baseline = computeReformLegality(world, GAME_DATA, nation, second, 1);
    applyCommand(world, GAME_DATA, { t: 'enactReform', reform: first.key, level: 1 }, noopPost);
    const fatigued = computeReformLegality(world, GAME_DATA, nation, second, 1);
    expect(fatigued.costMoney).toBeGreaterThan(baseline.costMoney);
    expect(fatigued.support).toBeLessThan(baseline.support);

    const peakFatigue = nation.reformFatigue ?? 0;
    const monthsNeeded = Math.ceil(peakFatigue / REFORM_FATIGUE_DECAY_PER_MONTH);
    expect(monthsNeeded).toBeLessThanOrEqual(5);

    // Drive enough 1sts-of-month for the politics monthly decay hook to clear the peak.
    for (let day = 0; day < monthsNeeded * 31 + 5; day++) advanceDay(world, GAME_DATA);

    expect(nation.reformFatigue ?? 0).toBeLessThan(0.08);
    expect(nation.reformFatigue ?? 0).toBeLessThan(peakFatigue * 0.15);

    const recovered = computeReformLegality(world, GAME_DATA, nation, second, 1);
    expect(recovered.support).toBeGreaterThan(fatigued.support);
    expect(recovered.costMoney).toBeLessThan(fatigued.costMoney);
    expect(recovered.support).toBeCloseTo(baseline.support, 2);
    expect(recovered.costMoney).toBe(baseline.costMoney);
  });
});
