import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { updateMilitaryDerivedForNation } from '../src/sim/politics';
import {
  canEmbarkArmy,
  disembarkFromFleet,
  offerPeaceTerms,
} from '../src/sim/systems/war';
import { advanceDay } from '../src/sim/world';
import type { Army, NationId, ProvinceId, World } from '../src/shared/types';

function noopPost() {
  // intentionally empty in tests
}

function disableAi(world: World) {
  for (const nation of world.nations) nation.isPlayer = true;
}

function firstNationExcept(world: World, excluded: NationId): NationId {
  for (const nation of world.nations) {
    if (nation.id !== excluded) return nation.id;
  }
  return excluded;
}

/**
 * A neighbour of `owner` that actually shares a land border. The old map put
 * nation 0 next to the player by accident; the Vic2 cut does not, and falling
 * back to provinces 0/1 silently fought the battle in the Afghan mountains,
 * where the defender bonus is large enough to invert the result.
 */
function borderingNationExcept(world: World, owner: NationId): NationId {
  for (const province of world.provinces) {
    if (province.owner !== owner) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (neighbor && neighbor.owner >= 0 && neighbor.owner !== owner) return neighbor.owner;
    }
  }
  return firstNationExcept(world, owner);
}

function firstOwnedProvince(world: World, nationId: NationId): ProvinceId {
  return world.provinces.find((province) => province.owner === nationId)?.id ?? 0;
}

function firstSoldierProvince(world: World, nationId: NationId): ProvinceId {
  const province = world.provinces.find((candidate) => (
    candidate.owner === nationId
    && candidate.popIds.some((popId) => world.pops[popId]?.type === 'soldier')
  ));
  return province?.id ?? firstOwnedProvince(world, nationId);
}

function firstCoastalProvince(world: World, nationId: NationId): ProvinceId {
  return world.provinces.find((province) => province.owner === nationId && province.coastal)?.id ?? firstOwnedProvince(world, nationId);
}

function findBorderPair(world: World, owner: NationId, target: NationId): { from: ProvinceId; to: ProvinceId } | null {
  for (const province of world.provinces) {
    if (province.owner !== owner) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || neighbor.owner !== target) continue;
      return { from: province.id, to: neighbor.id };
    }
  }
  return null;
}

function makeArmy(world: World, owner: NationId, provinceId: ProvinceId, regiments: number, strength: number, organization: number): Army {
  const sourcePop = world.provinces[provinceId]?.popIds[0] ?? 0;
  const army: Army = {
    id: world.nextArmyId++,
    owner,
    location: provinceId,
    moveTarget: -1,
    moveProgress: 0,
    regiments: Array.from({ length: regiments }, () => ({
      type: 'infantry',
      strength,
      organization,
      sourcePop,
    })),
    leader: null,
    rebel: false,
    hostileTo: -1,
  };
  world.armies.push(army);
  return army;
}

function runScriptedWar(seed: number): {
  targetState: number;
  targetNation: NationId;
  targetProvince: ProvinceId;
  warsRemaining: number;
  stateOwner: NationId;
  controller: NationId;
} {
  const world = createWorld(GAME_DATA, seed);
  disableAi(world);
  const player = world.playerNation;
  const targetNation = firstNationExcept(world, player);
  let border = findBorderPair(world, player, targetNation);
  if (!border) {
    const fallbackFrom = firstOwnedProvince(world, player);
    const fallbackTo = world.provinces[fallbackFrom]?.neighbors[0] ?? fallbackFrom;
    world.provinces[fallbackTo].owner = targetNation;
    world.provinces[fallbackTo].controller = targetNation;
    border = { from: fallbackFrom, to: fallbackTo };
  }
  const targetState = world.provinces[border.to].stateId;

  applyCommand(world, GAME_DATA, { t: 'declareWar', target: targetNation, goal: 'annex_state', state: targetState }, noopPost);
  const war = world.wars.find((candidate) => candidate.attackers.includes(player) && candidate.defenders.includes(targetNation));
  if (!war) throw new Error('Scripted war declaration failed.');

  const attacker = makeArmy(world, player, border.from, 7, 1000, 85);
  makeArmy(world, targetNation, border.to, 3, 760, 42);

  applyCommand(world, GAME_DATA, { t: 'moveArmy', army: attacker.id, target: border.to }, noopPost);
  for (let day = 0; day < 260; day++) {
    advanceDay(world, GAME_DATA);
    const activeWar = world.wars.find((candidate) => candidate.id === war.id);
    if (!activeWar) break;
    if (world.provinces[border.to].controller === player && activeWar.score >= activeWar.goals[0].scoreValue + 1) {
      applyCommand(world, GAME_DATA, { t: 'offerPeace', war: activeWar.id, goalsToEnforce: [0] }, noopPost);
      break;
    }
  }

  const state = world.states[targetState];
  return {
    targetState,
    targetNation,
    targetProvince: border.to,
    warsRemaining: world.wars.length,
    stateOwner: state?.owner ?? -1,
    controller: world.provinces[border.to].controller,
  };
}

describe('M5 war and expansion', () => {
  it('recruitArmy draws from soldier pops and scales with conscription level', () => {
    const low = createWorld(GAME_DATA, 5501);
    const high = createWorld(GAME_DATA, 5501);
    disableAi(low);
    disableAi(high);
    const lowNation = low.nations[low.playerNation];
    const highNation = high.nations[high.playerNation];
    const lowProvince = firstSoldierProvince(low, low.playerNation);
    const highProvince = firstSoldierProvince(high, high.playerNation);

    for (const popId of low.provinces[lowProvince].popIds) {
      const pop = low.pops[popId];
      if (pop?.type === 'soldier') pop.size = 8000;
    }
    for (const popId of high.provinces[highProvince].popIds) {
      const pop = high.pops[popId];
      if (pop?.type === 'soldier') pop.size = 8000;
    }

    lowNation.reforms.conscription_level = 0;
    highNation.reforms.conscription_level = 3;
    updateMilitaryDerivedForNation(low, low.playerNation);
    updateMilitaryDerivedForNation(high, high.playerNation);

    const lowSoldierBefore = low.provinces[lowProvince].popIds
      .map((popId) => low.pops[popId])
      .filter((pop) => pop?.type === 'soldier')
      .reduce((sum, pop) => sum + (pop?.size ?? 0), 0);
    const highSoldierBefore = high.provinces[highProvince].popIds
      .map((popId) => high.pops[popId])
      .filter((pop) => pop?.type === 'soldier')
      .reduce((sum, pop) => sum + (pop?.size ?? 0), 0);

    applyCommand(low, GAME_DATA, { t: 'recruitArmy', province: lowProvince }, noopPost);
    applyCommand(high, GAME_DATA, { t: 'recruitArmy', province: highProvince }, noopPost);

    const lowRaised = low.armies.reduce((sum, army) => sum + army.regiments.length, 0);
    const highRaised = high.armies.reduce((sum, army) => sum + army.regiments.length, 0);
    const lowSoldierAfter = low.provinces[lowProvince].popIds
      .map((popId) => low.pops[popId])
      .filter((pop) => pop?.type === 'soldier')
      .reduce((sum, pop) => sum + (pop?.size ?? 0), 0);
    const highSoldierAfter = high.provinces[highProvince].popIds
      .map((popId) => high.pops[popId])
      .filter((pop) => pop?.type === 'soldier')
      .reduce((sum, pop) => sum + (pop?.size ?? 0), 0);

    expect(lowRaised).toBeGreaterThan(0);
    expect(highRaised).toBeGreaterThan(lowRaised);
    expect(lowSoldierAfter).toBeLessThan(lowSoldierBefore);
    expect(highSoldierAfter).toBeLessThan(highSoldierBefore);
  });

  it('resolves land combat with organization break then retreat/destruction and no NaN values', () => {
    const world = createWorld(GAME_DATA, 5502);
    disableAi(world);
    const attacker = world.playerNation;
    const defender = borderingNationExcept(world, attacker);
    const pair = findBorderPair(world, attacker, defender);
    expect(pair, 'attacker and defender must share a land border').not.toBeNull();
    const battleProvince = pair!.to;

    world.provinces[battleProvince].owner = defender;
    world.provinces[battleProvince].controller = defender;
    world.wars.push({
      id: world.nextWarId++,
      attackers: [attacker],
      defenders: [defender],
      goals: [],
      score: 0,
      attackerExhaustion: 0,
      defenderExhaustion: 0,
      startDay: world.day,
    });

    makeArmy(world, attacker, battleProvince, 6, 1000, 88);
    const defenderArmy = makeArmy(world, defender, battleProvince, 2, 650, 32);

    for (let day = 0; day < 45; day++) advanceDay(world, GAME_DATA);

    const defenderAfter = world.armies.find((army) => army.id === defenderArmy.id);
    const defeated = !defenderAfter || defenderAfter.location !== battleProvince || defenderAfter.regiments.length === 0;
    expect(defeated).toBe(true);

    for (const army of world.armies) {
      for (const regiment of army.regiments) {
        expect(Number.isFinite(regiment.organization)).toBe(true);
        expect(Number.isFinite(regiment.strength)).toBe(true);
      }
    }
  });

  it('sieges an undefended enemy province until controller flips', () => {
    const world = createWorld(GAME_DATA, 5503);
    disableAi(world);
    const attacker = world.playerNation;
    const defender = firstNationExcept(world, attacker);
    const border = findBorderPair(world, attacker, defender) ?? { from: 0, to: 1 };

    world.wars.push({
      id: world.nextWarId++,
      attackers: [attacker],
      defenders: [defender],
      goals: [],
      score: 0,
      attackerExhaustion: 0,
      defenderExhaustion: 0,
      startDay: world.day,
    });
    world.provinces[border.to].owner = defender;
    world.provinces[border.to].controller = defender;
    world.provinces[border.to].fortLevel = 0;
    makeArmy(world, attacker, border.to, 4, 900, 72);

    for (let day = 0; day < 120; day++) {
      advanceDay(world, GAME_DATA);
      if (world.provinces[border.to].controller === attacker) break;
    }

    expect(world.provinces[border.to].controller).toBe(attacker);
  });

  it('enforcing annex_state transfers all provinces in the target state', () => {
    const world = createWorld(GAME_DATA, 5504);
    disableAi(world);
    const attacker = world.playerNation;
    const defender = firstNationExcept(world, attacker);
    const targetState = world.states.find((state) => state.owner === defender)?.id ?? 0;

    world.wars.push({
      id: world.nextWarId++,
      attackers: [attacker],
      defenders: [defender],
      goals: [{
        holder: attacker,
        target: defender,
        type: 'annex_state',
        stateId: targetState,
        scoreValue: 30,
      }],
      score: 75,
      attackerExhaustion: 5,
      defenderExhaustion: 20,
      startDay: world.day,
    });

    const result = offerPeaceTerms(world, world.wars[0].id, attacker, [0]);
    expect(result.ok).toBe(true);

    const state = world.states[targetState];
    expect(state.owner).toBe(attacker);
    for (const provinceId of state.provinceIds) {
      expect(world.provinces[provinceId].owner).toBe(attacker);
      expect(world.provinces[provinceId].controller).toBe(attacker);
    }
  });

  it('requires transport fleets and naval supremacy for amphibious landing', () => {
    const world = createWorld(GAME_DATA, 5505);
    disableAi(world);
    world.fleets = [];
    const attacker = world.playerNation;
    const home = firstCoastalProvince(world, attacker);
    const overseasTarget = world.provinces.find((province) => (
      province.owner !== attacker
      && province.coastal
      && !province.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === attacker)
    ));
    const defender = overseasTarget?.owner ?? firstNationExcept(world, attacker);
    const target = overseasTarget?.id ?? firstCoastalProvince(world, defender);
    const sourcePop = world.provinces[home].popIds[0] ?? 0;

    const army = makeArmy(world, attacker, home, 2, 900, 65);
    const frigateFleetId = world.nextFleetId++;
    world.fleets.push({
      id: frigateFleetId,
      owner: attacker,
      location: home,
      moveTarget: -1,
      moveProgress: 0,
      ships: [{ type: 'frigate', strength: 100, organization: 70 }],
      embarkedArmy: -1,
    });
    const noTransport = canEmbarkArmy(world, frigateFleetId, army.id);
    expect(noTransport.ok).toBe(false);

    const transportFleetId = world.nextFleetId++;
    world.fleets.push({
      id: transportFleetId,
      owner: attacker,
      location: target,
      moveTarget: -1,
      moveProgress: 0,
      ships: [{ type: 'transport', strength: 100, organization: 70 }],
      embarkedArmy: army.id,
    });
    army.location = target;

    world.fleets.push({
      id: world.nextFleetId++,
      owner: defender,
      location: target,
      moveTarget: -1,
      moveProgress: 0,
      ships: [
        { type: 'manofwar', strength: 100, organization: 80 },
        { type: 'manofwar', strength: 100, organization: 80 },
        { type: 'manofwar', strength: 100, organization: 80 },
      ],
      embarkedArmy: -1,
    });

    const denied = disembarkFromFleet(world, transportFleetId, target);
    expect(denied.ok).toBe(false);

    world.fleets.push({
      id: world.nextFleetId++,
      owner: attacker,
      location: target,
      moveTarget: -1,
      moveProgress: 0,
      ships: [
        { type: 'ironclad', strength: 100, organization: 80 },
        { type: 'ironclad', strength: 100, organization: 80 },
      ],
      embarkedArmy: -1,
    });
    const allowed = disembarkFromFleet(world, transportFleetId, target);
    expect(allowed.ok).toBe(true);
    expect(army.location).toBe(target);
    expect(world.provinces[target].coastal).toBe(true);
    expect(popByIdOrZero(world, sourcePop)).toBeGreaterThanOrEqual(0);
  });

  it('completes a full scripted war from declaration to enforced peace goal', () => {
    const summary = runScriptedWar(5506);
    expect(summary.warsRemaining).toBe(0);
    expect(summary.stateOwner).toBeGreaterThanOrEqual(0);
    expect(summary.stateOwner).not.toBe(summary.targetNation);
    expect(summary.controller).toBe(summary.stateOwner);
  });

  it('keeps scripted war outcomes deterministic for identical seeds', () => {
    const a = runScriptedWar(5507);
    const b = runScriptedWar(5507);
    expect(a).toEqual(b);
  });
});

function popByIdOrZero(world: World, popId: number): number {
  return world.pops[popId]?.size ?? 0;
}
