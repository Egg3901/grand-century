import type { Command, FromWorker, GameData, NationId, Regiment, War, WarGoal, World } from '../shared/types';
import { computeReformLegality, partyLabel, reformDemandForPop, updateMilitaryDerivedForNation } from './politics';
import {
  beginCbFabrication,
  collectAllianceBloc,
  consumeValidCb,
  evaluateAllianceAcceptance,
  getInfamyLimit,
  getOrCreateRelation,
  getWarGoalRule,
  hasActiveTruce,
  setRelationKindByCommand,
  spendInfluence,
} from './systems/diplomacy';
import {
  assignGeneralToArmy,
  canEmbarkArmy,
  demobilizeNation,
  disembarkFromFleet,
  mobilizeNation,
  offerPeaceTerms,
  startColonization,
} from './systems/war';
import { formNation } from './formables';
import { resolvePendingEvent, takeDecision } from './systems/events';
import { isRecipeUnlocked, setNationResearch } from './systems/research';
import { crisisLeadBackDown, joinCrisisSide, pressCrisisDemand } from './systems/crisis';
import { setCultureAccepted, setCulturePolicy } from './systems/culture';
import { Rng } from './rng';

type Poster = (msg: FromWorker) => void;
type RegimentType = Regiment['type'];

const REGIMENT_RECRUIT_PROFILE: Record<RegimentType, {
  cost: number;
  manpowerDrain: number;
  baseStrength: number;
  orgBonus: number;
}> = {
  infantry: { cost: 24, manpowerDrain: 70, baseStrength: 1000, orgBonus: 0 },
  cavalry: { cost: 31, manpowerDrain: 82, baseStrength: 930, orgBonus: 3 },
  artillery: { cost: 38, manpowerDrain: 90, baseStrength: 820, orgBonus: -5 },
  guard: { cost: 45, manpowerDrain: 96, baseStrength: 1000, orgBonus: 8 },
};

const REGIMENT_ORDER: RegimentType[] = ['infantry', 'cavalry', 'artillery', 'guard'];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function log(post: Poster, level: 'info' | 'warn' | 'error', msg: string): void {
  post({ t: 'log', level, msg });
}

function createWarGoal(target: NationId, goal: WarGoal['type'], state: number, holder: NationId, scoreValue: number): WarGoal {
  return {
    holder,
    target,
    type: goal,
    stateId: state,
    scoreValue,
  };
}

function atWarAgainst(world: World, a: NationId, b: NationId): boolean {
  return world.wars.some((war) => (
    (war.attackers.includes(a) && war.defenders.includes(b))
    || (war.attackers.includes(b) && war.defenders.includes(a))
  ));
}

function allowsRegimentType(world: World, nationId: NationId, type: RegimentType): boolean {
  const nation = world.nations[nationId];
  if (!nation) return false;
  const conscription = Math.max(0, Math.floor(nation.reforms.conscription_level ?? 0));
  const professionalism = Math.max(0, Math.floor(nation.reforms.army_professionalism ?? 0));
  if (type === 'infantry') return true;
  if (type === 'cavalry') return conscription >= 1;
  if (type === 'artillery') return conscription >= 1 && professionalism >= 1;
  if (type === 'guard') return conscription >= 2 && professionalism >= 2;
  return false;
}

function recruitArmyWithPlan(
  world: World,
  post: Poster,
  nationId: NationId,
  provinceId: number,
  composition?: Partial<Record<RegimentType, number>>,
): void {
  const province = world.provinces[provinceId];
  const nation = world.nations[nationId];
  if (!province || !nation || province.owner !== nationId) return;

  const activeRegiments = world.armies
    .filter((army) => army.owner === nationId && !army.rebel)
    .reduce((sum, army) => sum + army.regiments.length, 0);
  const capRemaining = Math.max(0, nation.standingRegimentCapacity - activeRegiments);
  if (capRemaining <= 0) {
    log(post, 'warn', 'Standing regiment cap reached. Raise conscription or soldier population.');
    return;
  }

  const usedByPop = new Map<number, number>();
  for (const army of world.armies) {
    if (army.owner !== nationId || army.rebel) continue;
    for (const regiment of army.regiments) {
      usedByPop.set(regiment.sourcePop, (usedByPop.get(regiment.sourcePop) ?? 0) + 1);
    }
  }

  const popPool = province.popIds
    .map((id) => world.pops[id])
    .filter((pop) => pop?.type === 'soldier' && pop.size > 200)
    .map((pop) => {
      const popSupportCap = Math.max(0, Math.floor((pop.size / 1000) * nation.regimentsPerSoldierPop));
      const allocated = usedByPop.get(pop.id) ?? 0;
      return {
        pop,
        slots: Math.max(0, popSupportCap - allocated),
      };
    })
    .filter((entry) => entry.slots > 0)
    .sort((a, b) => b.pop.size - a.pop.size || a.pop.id - b.pop.id);
  if (popPool.length === 0) {
    log(post, 'warn', 'No soldier pops available for recruitment.');
    return;
  }

  const requested: RegimentType[] = [];
  if (composition) {
    for (const type of REGIMENT_ORDER) {
      const count = Math.max(0, Math.floor(composition[type] ?? 0));
      for (let i = 0; i < count; i++) requested.push(type);
    }
  }
  if (requested.length === 0) {
    const fallbackCount = Math.min(capRemaining, 12);
    for (let i = 0; i < fallbackCount; i++) requested.push('infantry');
  }

  const allowedRequested = requested.filter((type) => allowsRegimentType(world, nationId, type)).slice(0, capRemaining);
  if (allowedRequested.length === 0) {
    log(post, 'warn', 'Selected composition is blocked by current conscription/professionalism reforms.');
    return;
  }

  const regiments: Regiment[] = [];
  const raisedByType: Record<RegimentType, number> = { infantry: 0, cavalry: 0, artillery: 0, guard: 0 };

  for (const type of allowedRequested) {
    const profile = REGIMENT_RECRUIT_PROFILE[type];
    if (nation.treasury < profile.cost) break;
    const source = popPool.find((entry) => entry.slots > 0 && entry.pop.size > profile.manpowerDrain + 90);
    if (!source) break;
    source.pop.size = Math.max(0, source.pop.size - profile.manpowerDrain);
    source.slots -= 1;
    nation.treasury -= profile.cost;
    regiments.push({
      type,
      strength: profile.baseStrength,
      organization: clamp(Math.round(54 * nation.armyOrganization + profile.orgBonus), 18, 100),
      sourcePop: source.pop.id,
    });
    raisedByType[type] += 1;
  }

  if (regiments.length === 0) {
    log(post, 'warn', 'Unable to recruit requested regiments (capacity, treasury, or soldier support unavailable).');
    return;
  }

  world.armies.push({
    id: world.nextArmyId++,
    owner: province.owner,
    location: province.id,
    moveTarget: -1,
    moveProgress: 0,
    regiments,
    leader: null,
    rebel: false,
    hostileTo: -1,
    rebellionId: undefined,
    rebelDemand: null,
  });

  const detail = REGIMENT_ORDER
    .filter((type) => raisedByType[type] > 0)
    .map((type) => `${type[0].toUpperCase()}${raisedByType[type]}`)
    .join(' ');
  log(post, 'info', `Recruited ${regiments.length} regiments (${detail || 'infantry'}).`);
}

export function applyCommand(world: World, data: GameData, cmd: Command, post: Poster): void {
  switch (cmd.t) {
    case 'setSpeed':
      world.speed = clamp(cmd.speed, 0, 5);
      return;
    case 'setPlayerNation':
      if (!world.nations[cmd.nation]) return;
      world.playerNation = cmd.nation;
      world.nations.forEach((nation) => {
        nation.isPlayer = nation.id === cmd.nation;
      });
      return;
    case 'setTax': {
      const nation = world.nations[world.playerNation];
      if (!nation) return;
      const rate = clamp(cmd.rate, 0, 1);
      if (cmd.bracket === 'poor') nation.taxRatePoor = rate;
      else if (cmd.bracket === 'middle') nation.taxRateMiddle = rate;
      else nation.taxRateRich = rate;
      return;
    }
    case 'setTariff': {
      const nation = world.nations[world.playerNation];
      if (!nation) return;
      nation.tariffRate = clamp(cmd.rate, -1, 1);
      return;
    }
    case 'enactReform': {
      const nation = world.nations[world.playerNation];
      const reformDef = data.reforms.find((reform) => reform.key === cmd.reform);
      if (!nation || !reformDef) return;
      const targetLevel = clamp(cmd.level, 0, reformDef.options.length - 1);
      const legality = computeReformLegality(world, data, nation, reformDef, targetLevel);
      if (!legality.legal) {
        log(post, 'warn', `Cannot enact ${reformDef.name}: ${legality.reason}`);
        return;
      }
      nation.treasury -= legality.costMoney;
      nation.prestige = Math.max(0, nation.prestige - legality.costPrestige);
      nation.reforms[cmd.reform] = targetLevel;

      let appeased = 0;
      for (const province of world.provinces) {
        if (province.owner !== nation.id) continue;
        for (const popId of province.popIds) {
          const pop = world.pops[popId];
          if (!pop || pop.size <= 0) continue;
          const demand = reformDemandForPop(pop, nation, data);
          if (demand === cmd.reform) {
            pop.militancy = clamp(pop.militancy - 0.28, 0, 10);
            pop.consciousness = clamp(pop.consciousness + 0.1, 0, 10);
            appeased += 1;
          } else {
            pop.consciousness = clamp(pop.consciousness + 0.03, 0, 10);
          }
        }
      }
      if (reformDef.category === 'military') updateMilitaryDerivedForNation(world, nation.id);
      log(post, 'info', `${reformDef.name} enacted by ${partyLabel(nation, nation.rulingParty)} (${appeased} groups appeased).`);
      return;
    }
    case 'buildFactory': {
      const state = world.states[cmd.state];
      const recipe = data.recipes.find((candidate) => candidate.key === cmd.recipe && candidate.building === 'factory');
      const nation = world.nations[world.playerNation];
      if (!state || !recipe || !nation) return;
      if (state.owner !== world.playerNation) {
        log(post, 'warn', 'Cannot build outside your own state.');
        return;
      }
      if (nation.constructionBlocked || nation.isBankrupt) {
        log(post, 'warn', 'Construction is blocked during bankruptcy.');
        return;
      }
      // 0.6.0 research gates.
      if (!isRecipeUnlocked(nation, recipe)) {
        log(post, 'warn', `${recipe.name} requires a technology you have not researched.`);
        return;
      }
      if (recipe.requiresCoastal && !state.provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal)) {
        log(post, 'warn', `${recipe.name} can only be built in a coastal state.`);
        return;
      }
      const buildCost = 220 + state.factories.length * 45;
      if (nation.treasury < buildCost) {
        log(post, 'warn', `Insufficient treasury for factory build (need ${buildCost.toFixed(0)}).`);
        return;
      }
      nation.treasury -= buildCost;
      state.factories.push({
        recipe: recipe.key,
        level: 1,
        employed: 500,
        stockpileIn: 0,
        profitTrend: 0,
        weeklyProfit: 0,
        cashReserve: 0,
        workerShare: 0,
        clerkShare: 0,
        lastOutput: 0,
        profitableWeeks: 0,
        lossWeeks: 0,
      });
      return;
    }
    case 'recruitArmy': {
      recruitArmyWithPlan(world, post, world.playerNation, cmd.province);
      return;
    }
    case 'recruitArmyWithComposition': {
      recruitArmyWithPlan(world, post, world.playerNation, cmd.province, cmd.composition);
      return;
    }
    case 'assignGeneral': {
      const result = assignGeneralToArmy(world, world.playerNation, cmd.army);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'mobilize': {
      const result = mobilizeNation(world, world.playerNation);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'demobilize':
      demobilizeNation(world, world.playerNation);
      log(post, 'info', 'Army reserves demobilized.');
      return;
    case 'moveArmy': {
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!army || army.owner !== world.playerNation || army.rebel) return;
      const target = world.provinces[cmd.target];
      const source = world.provinces[army.location];
      if (!target || !source || !source.neighbors.includes(target.id)) return;
      army.moveTarget = cmd.target;
      army.moveProgress = 0;
      return;
    }
    case 'buildFleet': {
      const province = world.provinces[cmd.province];
      const nation = world.nations[world.playerNation];
      if (!province || !nation || province.owner !== world.playerNation || !province.coastal) return;
      const count = clamp(Math.floor(cmd.count ?? 1), 1, 8);
      const shipType = cmd.shipType;
      const shipCost = shipType === 'transport' ? 55 : shipType === 'frigate' ? 70 : shipType === 'manofwar' ? 95 : 120;
      const totalCost = shipCost * count;
      if (nation.treasury < totalCost) {
        log(post, 'warn', `Need £${totalCost.toFixed(0)} to build ships.`);
        return;
      }
      nation.treasury -= totalCost;
      const existingFleet = world.fleets.find((fleet) => fleet.owner === world.playerNation && fleet.location === province.id && fleet.embarkedArmy < 0);
      const ships = Array.from({ length: count }, () => ({
        type: shipType,
        strength: 100,
        organization: 62,
      }));
      if (existingFleet) existingFleet.ships.push(...ships);
      else {
        world.fleets.push({
          id: world.nextFleetId++,
          owner: world.playerNation,
          location: province.id,
          moveTarget: -1,
          moveProgress: 0,
          ships,
          embarkedArmy: -1,
        });
      }
      return;
    }
    case 'moveFleet': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      if (!fleet || fleet.owner !== world.playerNation) return;
      const source = fleet ? world.provinces[fleet.location] : null;
      const target = world.provinces[cmd.target];
      if (!fleet || !source || !target) return;
      if (!source.coastal || !target.coastal) return;
      fleet.moveTarget = cmd.target;
      fleet.moveProgress = 0;
      return;
    }
    case 'embarkArmy': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!fleet || !army || army.owner !== fleet.owner) return;
      const embark = canEmbarkArmy(world, cmd.fleet, cmd.army);
      if (!embark.ok) {
        log(post, 'warn', embark.reason);
        return;
      }
      fleet.embarkedArmy = army.id;
      army.location = fleet.location;
      army.moveTarget = -1;
      army.moveProgress = 0;
      log(post, 'info', `Army ${army.id} embarked.`);
      return;
    }
    case 'disembarkArmy': {
      const result = disembarkFromFleet(world, cmd.fleet, cmd.target);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'proposeAlliance': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      if (hasActiveTruce(world, world.playerNation, cmd.target)) {
        log(post, 'warn', 'Cannot ally while a truce is active.');
        return;
      }
      const relation = getOrCreateRelation(world, world.playerNation, cmd.target);
      const result = evaluateAllianceAcceptance(world, world.playerNation, cmd.target);
      if (!result.accepted) {
        relation.opinion = clamp(relation.opinion - 4, -200, 200);
        log(post, 'warn', `${world.nations[cmd.target].name} rejected the alliance offer (score ${result.score.toFixed(1)}).`);
        return;
      }
      setRelationKindByCommand(world, world.playerNation, cmd.target, 'alliance');
      log(post, 'info', `${world.nations[cmd.target].name} accepted the alliance offer.`);
      return;
    }
    case 'offerGuarantee': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      setRelationKindByCommand(world, world.playerNation, cmd.target, 'guarantee');
      log(post, 'info', `Guaranteeing ${world.nations[cmd.target].name}.`);
      return;
    }
    case 'addRival': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      setRelationKindByCommand(world, world.playerNation, cmd.target, 'rivalry');
      log(post, 'info', `${world.nations[cmd.target].name} is now marked as a rival.`);
      return;
    }
    case 'cancelRelation': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      const relation = getOrCreateRelation(world, world.playerNation, cmd.target);
      if (relation.kind === cmd.kind) {
        relation.kind = 'neutral';
        relation.expiresDay = -1;
      }
      log(post, 'info', `${cmd.kind} relation canceled with ${world.nations[cmd.target].name}.`);
      return;
    }
    case 'influenceNation': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      const result = spendInfluence(world, world.playerNation, cmd.target, cmd.spend ?? 1);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'fabricateCB': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      const state = world.states[cmd.state];
      if (cmd.state >= 0 && (!state || !state.provinceIds.length)) {
        log(post, 'warn', 'Cannot fabricate a state war goal without a valid state target.');
        return;
      }
      const result = beginCbFabrication(world, world.playerNation, cmd.target, cmd.goal, cmd.state);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'declareWar': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      if (atWarAgainst(world, world.playerNation, cmd.target)) {
        log(post, 'warn', 'Already at war with this nation.');
        return;
      }
      if (hasActiveTruce(world, world.playerNation, cmd.target)) {
        log(post, 'warn', 'A truce blocks this declaration.');
        return;
      }
      const rule = getWarGoalRule(cmd.goal);
      const cb = consumeValidCb(world, world.playerNation, cmd.target, cmd.goal, cmd.state);
      const attacker = world.nations[world.playerNation];
      if (!attacker) return;
      if (!cb) {
        attacker.infamy = clamp(attacker.infamy + Math.max(4, rule.infamyUse * 1.75), 0, 100);
        log(post, 'warn', `Declaring without CB. Infamy rises to ${attacker.infamy.toFixed(1)}.`);
      } else {
        attacker.infamy = clamp(attacker.infamy + cb.infamyCost, 0, 100);
      }
      const attackers = collectAllianceBloc(world, world.playerNation, cmd.target);
      const defenders = collectAllianceBloc(world, cmd.target, world.playerNation, { includeGuarantees: true });
      if (!attackers.includes(world.playerNation)) attackers.unshift(world.playerNation);
      if (!defenders.includes(cmd.target)) defenders.unshift(cmd.target);
      const dedupAttackers = Array.from(new Set(attackers.filter((nationId) => !defenders.includes(nationId))));
      const dedupDefenders = Array.from(new Set(defenders.filter((nationId) => !dedupAttackers.includes(nationId))));
      if (dedupDefenders.length === 0) dedupDefenders.push(cmd.target);
      const war: War = {
        id: world.nextWarId++,
        attackers: dedupAttackers,
        defenders: dedupDefenders,
        goals: [createWarGoal(cmd.target, cmd.goal, cmd.state, world.playerNation, rule.score)],
        score: 0,
        attackerExhaustion: 0,
        defenderExhaustion: 0,
        startDay: world.day,
      };
      world.wars.push(war);
      if (attacker.infamy >= getInfamyLimit()) {
        log(post, 'warn', `Infamy above limit (${getInfamyLimit().toFixed(1)}). Coalitions may form.`);
      }
      return;
    }
    case 'offerPeace': {
      const result = offerPeaceTerms(world, cmd.war, world.playerNation, cmd.goalsToEnforce);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'colonize': {
      const result = startColonization(world, world.playerNation, cmd.state);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'formNation': {
      const result = formNation(world, data, world.playerNation, cmd.key);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'resolveEvent': {
      const result = resolvePendingEvent(world, data, world.playerNation, cmd.instanceId, cmd.choiceId);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'takeDecision': {
      const result = takeDecision(world, data, world.playerNation, cmd.decision);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'setResearch': {
      const result = setNationResearch(world, data, world.playerNation, cmd.tech);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'crisisBackSide': {
      const result = joinCrisisSide(world, world.playerNation, cmd.crisis, cmd.side);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'crisisPressDemand': {
      const result = pressCrisisDemand(world, world.playerNation, cmd.crisis);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'crisisBackDown': {
      const rng = new Rng(world.rngState);
      const result = crisisLeadBackDown(world, rng, world.playerNation, cmd.crisis);
      world.rngState = rng.state;
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'setCulturePolicy': {
      setCulturePolicy(world, world.playerNation, cmd.policy);
      log(post, 'info', `Cultural policy set to ${cmd.policy}.`);
      return;
    }
    case 'setCultureAccepted': {
      const result = setCultureAccepted(world, data, world.playerNation, cmd.culture, cmd.accepted);
      log(post, result.ok ? 'info' : 'warn', result.reason);
      return;
    }
    case 'newGame':
      // Handled by the worker entry point to rebuild a brand new world.
      return;
    case 'save':
    case 'load':
    case 'listSaves':
      // Persistence commands are handled by the worker wrapper around sim state.
      return;
    default:
      return;
  }
}
