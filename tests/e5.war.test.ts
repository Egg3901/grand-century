import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { offerPeaceTerms } from '../src/sim/systems/war';
import { advanceDay } from '../src/sim/world';
import type { Army, NationId, ProvinceId, World } from '../src/shared/types';

function noopPost() {
  // command sink for deterministic tests
}

function disableAi(world: World) {
  for (const nation of world.nations) nation.isPlayer = true;
}

function firstNationExcept(world: World, excluded: NationId): NationId {
  return world.nations.find((nation) => nation.id !== excluded)?.id ?? excluded;
}

function firstOwnedProvince(world: World, nationId: NationId): ProvinceId {
  return world.provinces.find((province) => province.owner === nationId)?.id ?? 0;
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

function makeArmy(world: World, owner: NationId, provinceId: ProvinceId, regiments: Army['regiments']): Army {
  const army: Army = {
    id: world.nextArmyId++,
    owner,
    location: provinceId,
    moveTarget: -1,
    moveProgress: 0,
    regiments,
    leader: null,
    rebel: false,
    hostileTo: -1,
  };
  world.armies.push(army);
  return army;
}

function runSiegeDays(regimentType: Army['regiments'][number]['type']): number {
  const world = createWorld(GAME_DATA, 7302);
  disableAi(world);
  const attacker = world.playerNation;
  const defender = firstNationExcept(world, attacker);
  const pair = findBorderPair(world, attacker, defender) ?? { from: 0, to: 1 };
  world.provinces[pair.to].owner = defender;
  world.provinces[pair.to].controller = defender;
  world.provinces[pair.to].fortLevel = 1;
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
  const sourcePop = world.provinces[pair.from]?.popIds[0] ?? 0;
  makeArmy(world, attacker, pair.to, [{
    type: regimentType,
    strength: 960,
    organization: 70,
    sourcePop,
  }]);
  for (let day = 0; day < 220; day++) {
    advanceDay(world, GAME_DATA);
    if (world.provinces[pair.to].controller === attacker) return day + 1;
  }
  return 999;
}

function runScriptedWar(seed: number): {
  warsRemaining: number;
  stateOwner: NationId;
  provinceController: NationId;
  rngState: number;
} {
  const world = createWorld(GAME_DATA, seed);
  disableAi(world);
  const attacker = world.playerNation;
  const defender = firstNationExcept(world, attacker);
  let border = findBorderPair(world, attacker, defender);
  if (!border) {
    const fallbackFrom = firstOwnedProvince(world, attacker);
    const fallbackTo = world.provinces[fallbackFrom]?.neighbors[0] ?? fallbackFrom;
    world.provinces[fallbackTo].owner = defender;
    world.provinces[fallbackTo].controller = defender;
    border = { from: fallbackFrom, to: fallbackTo };
  }
  const targetState = world.provinces[border.to].stateId;
  applyCommand(world, GAME_DATA, { t: 'declareWar', target: defender, goal: 'annex_state', state: targetState }, noopPost);
  const war = world.wars.find((candidate) => candidate.attackers.includes(attacker) && candidate.defenders.includes(defender));
  if (!war) throw new Error('War declaration failed in scripted determinism scenario.');
  const sourcePop = world.provinces[border.from]?.popIds[0] ?? 0;
  const playerArmy = makeArmy(world, attacker, border.from, [
    { type: 'infantry', strength: 1000, organization: 82, sourcePop },
    { type: 'infantry', strength: 1000, organization: 82, sourcePop },
    { type: 'cavalry', strength: 920, organization: 78, sourcePop },
    { type: 'artillery', strength: 850, organization: 74, sourcePop },
  ]);
  makeArmy(world, defender, border.to, [
    { type: 'infantry', strength: 760, organization: 52, sourcePop },
    { type: 'infantry', strength: 760, organization: 52, sourcePop },
  ]);
  applyCommand(world, GAME_DATA, { t: 'moveArmy', army: playerArmy.id, target: border.to }, noopPost);
  for (let day = 0; day < 300; day++) {
    advanceDay(world, GAME_DATA);
    const activeWar = world.wars.find((candidate) => candidate.id === war.id);
    if (!activeWar) break;
    if (world.provinces[border.to].controller === attacker && activeWar.score >= activeWar.goals[0].scoreValue + 1) {
      applyCommand(world, GAME_DATA, { t: 'offerPeace', war: activeWar.id, goalsToEnforce: [0] }, noopPost);
      break;
    }
  }
  return {
    warsRemaining: world.wars.length,
    stateOwner: world.states[targetState]?.owner ?? -1,
    provinceController: world.provinces[border.to]?.controller ?? -1,
    rngState: world.rngState,
  };
}

describe('E5 war depth and rebellion systems', () => {
  it('enforces an exact multi-goal peace bundle within warscore budget', () => {
    const world = createWorld(GAME_DATA, 7301);
    disableAi(world);
    const attacker = world.playerNation;
    const defender = firstNationExcept(world, attacker);
    const stateToAnnex = world.states.find((state) => state.owner === defender)?.id ?? 0;
    world.wars.push({
      id: world.nextWarId++,
      attackers: [attacker],
      defenders: [defender],
      goals: [
        { holder: attacker, target: defender, type: 'annex_state', stateId: stateToAnnex, scoreValue: 30 },
        { holder: attacker, target: defender, type: 'humiliate', stateId: -1, scoreValue: 10 },
        { holder: attacker, target: defender, type: 'add_to_sphere', stateId: -1, scoreValue: 20 },
      ],
      score: 45,
      attackerExhaustion: 20,
      defenderExhaustion: 72,
      startDay: world.day,
    });
    const result = offerPeaceTerms(world, world.wars[0].id, attacker, [0, 1]);
    expect(result.ok).toBe(true);
    expect(world.wars).toHaveLength(0);
    expect(world.states[stateToAnnex].owner).toBe(attacker);
    expect(world.nations[defender].spheredBy).toBe(-1);
  });

  it('gives artillery faster siege progress and cavalry faster movement', () => {
    const infantrySiegeDays = runSiegeDays('infantry');
    const artillerySiegeDays = runSiegeDays('artillery');
    expect(artillerySiegeDays).toBeLessThan(infantrySiegeDays);

    const world = createWorld(GAME_DATA, 7303);
    disableAi(world);
    const nation = world.playerNation;
    const start = firstOwnedProvince(world, nation);
    const target = world.provinces[start]?.neighbors[0] ?? start;
    const sourcePop = world.provinces[start]?.popIds[0] ?? 0;
    const infantryArmy = makeArmy(world, nation, start, [{ type: 'infantry', strength: 1000, organization: 70, sourcePop }]);
    const cavalryArmy = makeArmy(world, nation, start, [{ type: 'cavalry', strength: 900, organization: 70, sourcePop }]);
    applyCommand(world, GAME_DATA, { t: 'moveArmy', army: infantryArmy.id, target }, noopPost);
    applyCommand(world, GAME_DATA, { t: 'moveArmy', army: cavalryArmy.id, target }, noopPost);
    advanceDay(world, GAME_DATA);
    const movedInfantry = world.armies.find((army) => army.id === infantryArmy.id)?.moveProgress ?? 0;
    const movedCavalry = world.armies.find((army) => army.id === cavalryArmy.id)?.moveProgress ?? 0;
    expect(movedCavalry).toBeGreaterThan(movedInfantry);
  });

  it('lets victorious rebels force their demand', () => {
    const world = createWorld(GAME_DATA, 7304);
    disableAi(world);
    const targetNation = world.playerNation;
    const state = world.states.find((candidate) => candidate.owner === targetNation);
    expect(state).toBeTruthy();
    if (!state) return;
    const culture = world.pops[world.provinces[state.provinceIds[0]]?.popIds[0] ?? 0]?.culture ?? world.nations[targetNation].primaryCulture;
    world.day = 29;
    world.rebellions.push({
      id: world.nextRebellionId++,
      targetNation,
      originState: state.id,
      startDay: world.day - 80,
      progress: 84,
      holdDays: 170,
      status: 'active',
      demand: {
        type: 'independence',
        description: 'Regional independence',
        culture,
        stateIds: [state.id],
      },
    });
    const sourcePop = world.provinces[state.provinceIds[0]]?.popIds[0] ?? 0;
    for (const provinceId of state.provinceIds) world.provinces[provinceId].controller = -1;
    makeArmy(world, -1, state.provinceIds[0], [{
      type: 'infantry',
      strength: 900,
      organization: 55,
      sourcePop,
    }]).rebel = true;
    const rebelArmy = world.armies[world.armies.length - 1];
    rebelArmy.hostileTo = targetNation;
    rebelArmy.rebellionId = world.rebellions[0].id;
    rebelArmy.rebelDemand = world.rebellions[0].demand;

    advanceDay(world, GAME_DATA);
    expect(world.states[state.id].owner).not.toBe(targetNation);
    expect(world.rebellions[0].status).toBe('enforced');
  });

  it('stays deterministic for a scripted war sequence', () => {
    const a = runScriptedWar(7305);
    const b = runScriptedWar(7305);
    expect(a).toEqual(b);
  });
});
