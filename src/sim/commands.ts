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
  setTruce,
  spendInfluence,
} from './systems/diplomacy';

type Poster = (msg: FromWorker) => void;

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
      const province = world.provinces[cmd.province];
      const nation = world.nations[world.playerNation];
      if (!province || !nation || province.owner !== world.playerNation) return;

      const activeRegiments = world.armies
        .filter((army) => army.owner === world.playerNation && !army.rebel)
        .reduce((sum, army) => sum + army.regiments.length, 0);
      const capRemaining = Math.max(0, nation.standingRegimentCapacity - activeRegiments);
      if (capRemaining <= 0) {
        log(post, 'warn', 'Standing regiment cap reached. Raise conscription or soldier population.');
        return;
      }

      const usedByPop = new Map<number, number>();
      for (const army of world.armies) {
        if (army.owner !== world.playerNation || army.rebel) continue;
        for (const regiment of army.regiments) {
          usedByPop.set(regiment.sourcePop, (usedByPop.get(regiment.sourcePop) ?? 0) + 1);
        }
      }

      const soldierPops = province.popIds.map((id) => world.pops[id]).filter((pop) => pop?.type === 'soldier' && pop.size > 200);
      if (soldierPops.length === 0) {
        log(post, 'warn', 'No soldier pops available for recruitment.');
        return;
      }

      const regiments: Regiment[] = [];
      for (const pop of soldierPops) {
        if (regiments.length >= capRemaining || regiments.length >= 6) break;
        const popSupportCap = Math.max(0, Math.floor((pop.size / 1000) * nation.regimentsPerSoldierPop));
        const allocated = usedByPop.get(pop.id) ?? 0;
        const available = Math.max(0, popSupportCap - allocated);
        if (available <= 0) continue;
        const toRaise = Math.min(available, capRemaining - regiments.length, 2);
        for (let i = 0; i < toRaise; i++) {
          pop.size = Math.max(0, pop.size - 70);
          regiments.push({
            type: 'infantry',
            strength: 1000,
            organization: clamp(Math.round(55 * nation.armyOrganization), 20, 100),
            sourcePop: pop.id,
          });
        }
      }
      if (regiments.length === 0) {
        log(post, 'warn', 'Soldier pops are fully allocated under current conscription reform.');
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
      });
      return;
    }
    case 'moveArmy': {
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!army) return;
      const target = world.provinces[cmd.target];
      if (!target) return;
      army.moveTarget = cmd.target;
      army.moveProgress = 0;
      return;
    }
    case 'moveFleet': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      if (!fleet || !world.provinces[cmd.target]) return;
      fleet.moveTarget = cmd.target;
      fleet.moveProgress = 0;
      return;
    }
    case 'embarkArmy': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!fleet || !army || army.owner !== fleet.owner) return;
      fleet.embarkedArmy = army.id;
      army.location = fleet.location;
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
      const defenders = collectAllianceBloc(world, cmd.target, world.playerNation);
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
      const warIndex = world.wars.findIndex((war) => war.id === cmd.war);
      if (warIndex < 0) return;
      const [war] = world.wars.splice(warIndex, 1);
      for (const attackerId of war.attackers) {
        for (const defenderId of war.defenders) setTruce(world, attackerId, defenderId);
      }
      const attackerLeader = world.nations[war.attackers[0]];
      const defenderLeader = world.nations[war.defenders[0]];
      if (cmd.goalsToEnforce.length > 0) {
        if (attackerLeader) attackerLeader.prestige += 3 + cmd.goalsToEnforce.length * 0.6;
        if (defenderLeader) defenderLeader.prestige = Math.max(0, defenderLeader.prestige - (2 + cmd.goalsToEnforce.length * 0.6));
      } else {
        if (attackerLeader) attackerLeader.prestige += 0.4;
        if (defenderLeader) defenderLeader.prestige += 0.4;
      }
      return;
    }
    case 'colonize': {
      const state = world.states[cmd.state];
      if (!state) return;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        province.owner = world.playerNation;
        province.controller = world.playerNation;
        province.colonial = false;
      }
      return;
    }
    case 'newGame':
      // Handled by the worker entry point to rebuild a brand new world.
      return;
    case 'save':
      log(post, 'info', `Save requested for slot "${cmd.slot}" (M0 stub).`);
      return;
    case 'load':
      log(post, 'info', `Load requested for slot "${cmd.slot}" (M0 stub).`);
      return;
    default:
      return;
  }
}
