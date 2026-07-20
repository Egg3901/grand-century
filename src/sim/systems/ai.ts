import type { GameData, NationId, ProvinceId, Ship, StateId, War, WarGoalType, World } from '../../shared/types';
import { BALANCE } from '../balance';
import type { Rng } from '../rng';
import { computeReformLegality, partyByKey } from '../politics';
import {
  beginCbFabrication,
  collectAllianceBloc,
  getCbsForNation,
  getInfamyLimit,
  getOrCreateRelation,
  getWarGoalRule,
  hasActiveTruce,
  spendInfluence,
} from './diplomacy';
import {
  assignGeneralToArmy,
  mobilizeNation,
  offerPeaceTerms,
  startColonization,
} from './war';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pickRandom<T>(rng: Rng, items: T[]): T | null {
  if (items.length === 0) return null;
  return items[rng.int(0, items.length)] ?? null;
}

function armyStrengthForNation(world: World, nationId: NationId): number {
  let total = 0;
  for (const army of world.armies) {
    if (army.owner !== nationId || army.rebel) continue;
    for (const regiment of army.regiments) total += regiment.strength / 1000;
  }
  return total;
}

function navyStrengthForNation(world: World, nationId: NationId): number {
  let total = 0;
  for (const fleet of world.fleets) {
    if (fleet.owner !== nationId) continue;
    total += fleet.ships.length;
  }
  return total;
}

function provincePopulation(world: World, provinceId: ProvinceId): number {
  const province = world.provinces[provinceId];
  if (!province) return 0;
  let total = 0;
  for (const popId of province.popIds) total += Math.max(0, world.pops[popId]?.size ?? 0);
  return total;
}

function nationPopulation(world: World, nationId: NationId): number {
  let total = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    total += provincePopulation(world, province.id);
  }
  return total;
}

function nationAtWar(world: World, nationId: NationId): boolean {
  return world.wars.some((war) => war.attackers.includes(nationId) || war.defenders.includes(nationId));
}

function nationEnemySet(world: World, nationId: NationId): Set<NationId> {
  const enemies = new Set<NationId>();
  for (const war of world.wars) {
    if (war.attackers.includes(nationId)) {
      for (const defender of war.defenders) enemies.add(defender);
    }
    if (war.defenders.includes(nationId)) {
      for (const attacker of war.attackers) enemies.add(attacker);
    }
  }
  return enemies;
}

function nationOwnedProvinceIds(world: World, nationId: NationId): ProvinceId[] {
  const ids: ProvinceId[] = [];
  for (const province of world.provinces) if (province.owner === nationId) ids.push(province.id);
  return ids;
}

function nationCoastalProvinceIds(world: World, nationId: NationId): ProvinceId[] {
  const ids: ProvinceId[] = [];
  for (const province of world.provinces) {
    if (province.owner === nationId && province.coastal) ids.push(province.id);
  }
  return ids;
}

function nationNeighborIds(world: World, nationId: NationId): NationId[] {
  const result = new Set<NationId>();
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || neighbor.owner === nationId) continue;
      result.add(neighbor.owner);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function estimateNationPower(world: World, nationId: NationId): number {
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const military = armyStrengthForNation(world, nationId) * 2 + navyStrengthForNation(world, nationId);
  const economy = Math.max(0, nation.treasury) / 600 + nationPopulation(world, nationId) / 120_000;
  return military + economy + nation.prestige * 0.3;
}

function targetStateForWar(world: World, attacker: NationId, defender: NationId): StateId {
  const candidateStates = world.states
    .filter((state) => state.owner === defender)
    .map((state) => {
      let score = 0;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        score += provincePopulation(world, province.id) * 0.0008;
        score += province.rgo.level * 1.2;
        if (province.colonial) score += 4;
        if (province.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === attacker)) score += 5;
      }
      return { id: state.id, score };
    })
    .sort((a, b) => b.score - a.score || a.id - b.id);
  return candidateStates[0]?.id ?? -1;
}

function decideWarGoal(world: World, attacker: NationId, defender: NationId, rng: Rng): WarGoalType {
  const defenderPower = estimateNationPower(world, defender);
  const attackerPower = estimateNationPower(world, attacker);
  const colonialTarget = world.states.some((state) => state.owner === defender && state.provinceIds.every((provinceId) => world.provinces[provinceId]?.colonial));
  if (colonialTarget && rng.chance(0.3)) return 'take_colony';
  if (attackerPower > defenderPower * 1.45) return rng.chance(0.72) ? 'annex_state' : 'humiliate';
  if (attackerPower > defenderPower * 1.18) return rng.chance(0.45) ? 'add_to_sphere' : 'humiliate';
  return rng.chance(0.55) ? 'humiliate' : 'cut_down_to_size';
}

function stepToward(world: World, from: ProvinceId, to: ProvinceId): ProvinceId {
  if (from === to) return from;
  const start = world.provinces[from];
  if (!start) return from;
  if (start.neighbors.includes(to)) return to;
  const queue: ProvinceId[] = [from];
  const visited = new Set<ProvinceId>([from]);
  const cameFrom = new Map<ProvinceId, ProvinceId>();
  let found = false;

  while (queue.length > 0) {
    const current = queue.shift() as ProvinceId;
    if (current === to) {
      found = true;
      break;
    }
    const province = world.provinces[current];
    if (!province) continue;
    for (const neighborId of province.neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      cameFrom.set(neighborId, current);
      queue.push(neighborId);
      if (visited.size > 500) break;
    }
    if (visited.size > 500) break;
  }

  if (!found) {
    // fall back to nearest neighbor by id distance for deterministic low-cost routing
    const neighbors = start.neighbors.slice().sort((a, b) => Math.abs(a - to) - Math.abs(b - to) || a - b);
    return neighbors[0] ?? from;
  }

  let cursor = to;
  let prev = cameFrom.get(cursor);
  while (prev !== undefined && prev !== from) {
    cursor = prev;
    prev = cameFrom.get(cursor);
  }
  return prev === from ? cursor : (start.neighbors[0] ?? from);
}

function frontTargets(world: World, nationId: NationId, enemies: Set<NationId>): ProvinceId[] {
  const targets: ProvinceId[] = [];
  for (const province of world.provinces) {
    if (province.owner !== nationId && province.controller !== nationId) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || !enemies.has(neighbor.owner)) continue;
      targets.push(neighbor.id);
      break;
    }
  }
  return targets;
}

function manageWarMovement(world: World, nationId: NationId): void {
  const enemies = nationEnemySet(world, nationId);
  if (enemies.size === 0) return;
  const nation = world.nations[nationId];
  if (!nation) return;
  const targets = frontTargets(world, nationId, enemies);
  const capital = nation.capital;
  let issuedMoves = 0;

  for (const army of world.armies) {
    if (army.owner !== nationId || army.rebel || army.regiments.length === 0) continue;
    if (army.moveTarget >= 0) continue;

    if (!army.leader) assignGeneralToArmy(world, nationId, army.id);

    const inEnemyLand = enemies.has(world.provinces[army.location]?.owner ?? -1);
    if (inEnemyLand) continue; // keep sieging when already on objective

    let desiredTarget = capital;
    const capitalThreatened = world.provinces[capital]
      ? world.provinces[capital].neighbors.some((neighborId) => enemies.has(world.provinces[neighborId]?.owner ?? -1))
      : false;
    if (!capitalThreatened && targets.length > 0) {
      desiredTarget = targets[(army.id + world.day) % targets.length] as ProvinceId;
    }
    const step = stepToward(world, army.location, desiredTarget);
    if (step !== army.location && world.provinces[army.location]?.neighbors.includes(step)) {
      army.moveTarget = step;
      army.moveProgress = 0;
      issuedMoves++;
      if (issuedMoves >= 8) break;
    }
  }
}

function choosePeaceGoals(war: War, playerSideAttackers: boolean): number[] {
  const mySide = playerSideAttackers ? war.attackers : war.defenders;
  const available = playerSideAttackers ? war.score : -war.score;
  const goals = war.goals
    .map((goal, index) => ({ goal, index }))
    .filter((entry) => mySide.includes(entry.goal.holder))
    .sort((a, b) => b.goal.scoreValue - a.goal.scoreValue || a.index - b.index);
  const selected: number[] = [];
  let used = 0;
  for (const entry of goals) {
    if (used + entry.goal.scoreValue > available) continue;
    selected.push(entry.index);
    used += entry.goal.scoreValue;
  }
  return selected;
}

function maybePeaceOut(world: World, nationId: NationId): void {
  for (const war of world.wars.slice()) {
    const attacker = war.attackers.includes(nationId);
    const defender = war.defenders.includes(nationId);
    if (!attacker && !defender) continue;
    const onAttackerSide = attacker;
    const scoreForNation = onAttackerSide ? war.score : -war.score;
    const myExhaustion = onAttackerSide ? war.attackerExhaustion : war.defenderExhaustion;
    const enemyExhaustion = onAttackerSide ? war.defenderExhaustion : war.attackerExhaustion;
    if (
      scoreForNation < BALANCE.ai.peaceScorePush
      && myExhaustion < BALANCE.ai.peaceExhaustionPush
      && !(scoreForNation > 0 && enemyExhaustion > BALANCE.ai.peaceExhaustionPush)
    ) {
      continue;
    }
    const selected = choosePeaceGoals(war, onAttackerSide);
    offerPeaceTerms(world, war.id, nationId, selected);
  }
}

function stabilizeEconomy(world: World, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const war = nationAtWar(world, nationId);
  const treasury = nation.treasury;
  const pressure = clamp((BALANCE.ai.factoryTreasuryReserve - treasury) / 6000, -1, 1);
  const warPush = war ? 0.12 : 0;
  const bankruptPush = nation.isBankrupt ? 0.2 : 0;

  nation.taxRatePoor = clamp(0.42 + pressure * 0.22 + warPush + bankruptPush, BALANCE.ai.minTax, BALANCE.ai.maxTax);
  nation.taxRateMiddle = clamp(0.33 + pressure * 0.2 + warPush * 0.7 + bankruptPush, BALANCE.ai.minTax, BALANCE.ai.maxTax);
  nation.taxRateRich = clamp(0.23 + pressure * 0.17 + warPush * 0.4 + bankruptPush * 0.8, BALANCE.ai.minTax * 0.4, BALANCE.ai.maxTax);
  nation.tariffRate = clamp(pressure * 0.55 + (nation.isBankrupt ? 0.25 : 0), -0.3, 0.5);
}

function maybeResearchTech(world: World, data: GameData, nationId: NationId, rng: Rng): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const literacyGain = 1.4 + nation.literacy * 4.8 + (nation.gpRank > 0 ? 1.5 : 0);
  nation.researchPoints = clamp(nation.researchPoints + literacyGain, 0, 10_000);
  const available = data.techs.filter((tech) => !nation.techs.includes(tech.key) && tech.cost <= nation.researchPoints);
  if (available.length === 0) return;
  const weights = available.map((tech) => {
    let weight = 1;
    if (nationAtWar(world, nationId)) {
      if (tech.category === 'army' || tech.category === 'navy') weight += 1.8;
    } else {
      if (tech.category === 'industry' || tech.category === 'commerce') weight += 1.4;
    }
    if (nation.gpRank > 0 && tech.category === 'culture') weight += 0.4;
    return weight;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll > 0 && i < available.length - 1) continue;
    const chosen = available[i];
    nation.techs.push(chosen.key);
    nation.researchPoints = Math.max(0, nation.researchPoints - chosen.cost);
    return;
  }
}

function maybeEnactPartyReform(world: World, data: GameData, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation || nation.isBankrupt) return;
  const party = partyByKey(nation, nation.rulingParty);
  if (!party) return;
  const candidates = data.reforms
    .map((reform) => {
      const current = nation.reforms[reform.key] ?? 0;
      const target = clamp(party.positions[reform.key] ?? current, 0, reform.options.length - 1);
      if (target <= current) return null;
      const legality = computeReformLegality(world, data, nation, reform, current + 1);
      if (!legality.legal) return null;
      return { reform, nextLevel: current + 1, legality };
    })
    .filter((entry): entry is { reform: GameData['reforms'][number]; nextLevel: number; legality: ReturnType<typeof computeReformLegality> } => Boolean(entry))
    .sort((a, b) => b.legality.support - a.legality.support);
  const chosen = candidates[0];
  if (!chosen) return;
  nation.reforms[chosen.reform.key] = chosen.nextLevel;
  nation.treasury -= chosen.legality.costMoney;
  nation.prestige = Math.max(0, nation.prestige - chosen.legality.costPrestige);
}

function maybeBuildFactory(world: World, data: GameData, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation || nation.isBankrupt || nation.constructionBlocked) return;
  if (nation.treasury < BALANCE.ai.factoryTreasuryReserve) return;
  const factoryRecipes = data.recipes.filter((recipe) => recipe.building === 'factory');
  if (factoryRecipes.length === 0) return;
  const states = world.states.filter((state) => state.owner === nationId);
  if (states.length === 0) return;
  const candidate = states
    .map((state) => {
      const profits = state.factories.reduce((sum, factory) => sum + factory.weeklyProfit, 0);
      const openings = state.factories.reduce((sum, factory) => sum + Math.max(0, factory.level * 2300 - factory.employed), 0);
      const pop = state.provinceIds.reduce((sum, provinceId) => sum + provincePopulation(world, provinceId), 0);
      return { state, score: profits * 0.18 + openings * 0.0006 + pop * 0.0002 - state.factories.length * 3.5 };
    })
    .sort((a, b) => b.score - a.score || a.state.id - b.state.id)[0];
  if (!candidate || candidate.score < -5) return;

  const recipe = factoryRecipes[(candidate.state.id + world.day) % factoryRecipes.length];
  const buildCost = 220 + candidate.state.factories.length * 45;
  if (nation.treasury < buildCost) return;
  nation.treasury -= buildCost;
  candidate.state.factories.push({
    recipe: recipe.key,
    level: 1,
    employed: 600,
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
}

function maybeBuildMilitary(world: World, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation || nation.isBankrupt) return;
  const totalPop = nationPopulation(world, nationId);
  const desiredArmy = Math.max(2, Math.floor((totalPop / 1000) * BALANCE.ai.baseArmyRatio));
  const currentArmy = Math.floor(armyStrengthForNation(world, nationId));
  const desiredFleet = Math.max(0, Math.floor((totalPop / 1000) * BALANCE.ai.baseFleetRatio + (nation.gpRank > 0 ? 6 : 0)));
  const currentFleet = Math.floor(navyStrengthForNation(world, nationId));

  if (currentArmy < desiredArmy && nation.treasury > 500) {
    const owned = nationOwnedProvinceIds(world, nationId);
    for (const provinceId of owned) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      const soldierPops = province.popIds
        .map((popId) => world.pops[popId])
        .filter((pop) => pop?.type === 'soldier' && pop.size > 220);
      if (soldierPops.length === 0) continue;
      const regiments = [];
      for (const pop of soldierPops) {
        if (regiments.length >= 4) break;
        if (pop.size < 180) continue;
        pop.size = Math.max(0, pop.size - 55);
        regiments.push({
          type: 'infantry' as const,
          strength: 900,
          organization: clamp(48 * nation.armyOrganization, 24, 100),
          sourcePop: pop.id,
        });
      }
      if (regiments.length > 0) {
        world.armies.push({
          id: world.nextArmyId++,
          owner: nationId,
          location: province.id,
          moveTarget: -1,
          moveProgress: 0,
          regiments,
          leader: null,
          rebel: false,
          hostileTo: -1,
        });
        nation.treasury -= regiments.length * 18;
        break;
      }
    }
  }

  if (currentFleet < desiredFleet && nation.treasury > 450) {
    const coastal = nationCoastalProvinceIds(world, nationId);
    const base = coastal[0];
    if (base !== undefined) {
      const shipsToBuild = Math.min(2, desiredFleet - currentFleet);
      const shipType: Ship['type'] = nation.gpRank > 0 ? 'frigate' : 'transport';
      const cost = shipType === 'transport' ? 55 : 70;
      if (shipsToBuild > 0 && nation.treasury >= shipsToBuild * cost) {
        const existing = world.fleets.find((fleet) => fleet.owner === nationId && fleet.location === base && fleet.embarkedArmy < 0);
        const ships = Array.from({ length: shipsToBuild }, () => ({ type: shipType, strength: 100, organization: 62 }));
        if (existing) existing.ships.push(...ships);
        else {
          world.fleets.push({
            id: world.nextFleetId++,
            owner: nationId,
            location: base,
            moveTarget: -1,
            moveProgress: 0,
            ships,
            embarkedArmy: -1,
          });
        }
        nation.treasury -= shipsToBuild * cost;
      }
    }
  }
}

function maybeDiplomaticActions(world: World, nationId: NationId, rng: Rng): void {
  const nation = world.nations[nationId];
  if (!nation || nationAtWar(world, nationId)) return;
  const neighbors = nationNeighborIds(world, nationId);
  if (neighbors.length === 0) return;

  const power = estimateNationPower(world, nationId);
  const infamyLimit = getInfamyLimit();

  // Alliance balancing: look for at least one partner if surrounded by stronger neighbors.
  const strongerNeighbors = neighbors.filter((neighborId) => estimateNationPower(world, neighborId) > power * 1.08);
  if (strongerNeighbors.length > 0 && rng.chance(0.45)) {
    const candidates = world.nations
      .filter((other) => other.id !== nationId && !neighbors.includes(other.id))
      .map((other) => {
        const relation = getOrCreateRelation(world, nationId, other.id);
        const score = relation.opinion + (other.gpRank > 0 ? 20 : 0) - Math.abs(estimateNationPower(world, other.id) - power);
        return { other: other.id, score };
      })
      .sort((a, b) => b.score - a.score || a.other - b.other);
    const chosen = candidates[0];
    if (chosen && chosen.score > 35 && !hasActiveTruce(world, nationId, chosen.other)) {
      const relation = getOrCreateRelation(world, nationId, chosen.other);
      relation.kind = 'alliance';
      relation.opinion = clamp(relation.opinion + 18, -200, 200);
      relation.expiresDay = world.day + 365 * 9;
    }
  }

  const targets = neighbors
    .filter((targetId) => !hasActiveTruce(world, nationId, targetId))
    .map((targetId) => {
      const targetPower = estimateNationPower(world, targetId);
      const relation = getOrCreateRelation(world, nationId, targetId);
      const score = power / Math.max(1, targetPower) * 30 - relation.opinion * 0.2 - world.nations[targetId].infamy * 0.4;
      return { targetId, targetPower, score };
    })
    .sort((a, b) => b.score - a.score || a.targetId - b.targetId);

  const chosen = targets[0];
  if (!chosen) return;
  if (chosen.targetPower > power * 0.95) return;
  if (nation.infamy > infamyLimit * 1.1) return;

  const goal = decideWarGoal(world, nationId, chosen.targetId, rng);
  const targetState = targetStateForWar(world, nationId, chosen.targetId);
  const validState = goal === 'humiliate' || goal === 'cut_down_to_size' || goal === 'add_to_sphere' ? -1 : targetState;
  const cb = getCbsForNation(world, nationId).find((entry) => (
    entry.target === chosen.targetId
    && entry.goal === goal
    && (entry.stateId === validState || entry.stateId === -1 || validState < 0)
  ));
  if (!cb && rng.chance(0.35)) {
    beginCbFabrication(world, nationId, chosen.targetId, goal, validState);
    return;
  }
  if (!cb) return;

  const rule = getWarGoalRule(goal);
  if (nation.infamy + rule.infamyUse > infamyLimit * 1.4) return;
  const attackers = collectAllianceBloc(world, nationId, chosen.targetId);
  const defenders = collectAllianceBloc(world, chosen.targetId, nationId);
  if (!attackers.includes(nationId)) attackers.unshift(nationId);
  if (!defenders.includes(chosen.targetId)) defenders.unshift(chosen.targetId);
  const dedupAttackers = Array.from(new Set(attackers.filter((id) => !defenders.includes(id))));
  const dedupDefenders = Array.from(new Set(defenders.filter((id) => !dedupAttackers.includes(id))));
  world.wars.push({
    id: world.nextWarId++,
    attackers: dedupAttackers.length > 0 ? dedupAttackers : [nationId],
    defenders: dedupDefenders.length > 0 ? dedupDefenders : [chosen.targetId],
    goals: [{
      holder: nationId,
      target: chosen.targetId,
      type: goal,
      stateId: validState,
      scoreValue: rule.score,
    }],
    score: 0,
    attackerExhaustion: 0,
    defenderExhaustion: 0,
    startDay: world.day,
  });
  nation.infamy = clamp(nation.infamy + cb.infamyCost, 0, 100);
}

function maybeColonialAndSphereActions(world: World, nationId: NationId, rng: Rng): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  if (nation.gpRank > 0) {
    const targets = world.nations
      .filter((candidate) => candidate.id !== nationId && candidate.gpRank === 0)
      .map((candidate) => {
        const relation = getOrCreateRelation(world, nationId, candidate.id);
        const score = relation.opinion + (candidate.spheredBy === nationId ? 18 : 0);
        return { id: candidate.id, score };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, 2);
    for (const target of targets) spendInfluence(world, nationId, target.id, 1);
  }

  if (nation.colonialPoints >= 32 && rng.chance(0.33)) {
    const candidates = world.states
      .filter((state) => state.provinceIds.length > 0)
      .filter((state) => state.provinceIds.every((provinceId) => world.provinces[provinceId]?.colonial))
      .map((state) => {
        const near = state.provinceIds.some((provinceId) => world.provinces[provinceId]?.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === nationId));
        return { id: state.id, score: near ? 2 : 1 };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const chosen = pickRandom(rng, candidates.slice(0, 6));
    if (chosen) startColonization(world, nationId, chosen.id);
  }
}

function keepValuesFinite(world: World): void {
  for (const nation of world.nations) {
    nation.treasury = clamp(nation.treasury, BALANCE.economy.treasuryFloor, BALANCE.economy.treasurySoftCap);
    if (!Number.isFinite(nation.monthlyProductionIncome)) nation.monthlyProductionIncome = 0;
    if (!Number.isFinite(nation.monthlyTariffIncome)) nation.monthlyTariffIncome = 0;
    nation.taxRatePoor = clamp(nation.taxRatePoor, 0, 1);
    nation.taxRateMiddle = clamp(nation.taxRateMiddle, 0, 1);
    nation.taxRateRich = clamp(nation.taxRateRich, 0, 1);
    nation.tariffRate = clamp(nation.tariffRate, -1, 1);
  }
  for (const good of world.market) {
    good.price = clamp(good.price, BALANCE.economy.minPrice, BALANCE.economy.maxPrice);
    good.worldStockpile = Math.max(0, good.worldStockpile);
    good.supply = Math.max(0, good.supply);
    good.demand = Math.max(0, good.demand);
  }
}

export function runAiMonthly(world: World, data: GameData, rng: Rng): void {
  const monthIndex = Math.floor(world.day / 30);
  for (const nation of world.nations) {
    if (nation.isPlayer) continue;
    const heavyPlanMonth = ((monthIndex + nation.id) % BALANCE.ai.heavyPlanningStride) === 0;

    stabilizeEconomy(world, nation.id);
    maybeResearchTech(world, data, nation.id, rng);
    maybePeaceOut(world, nation.id);
    manageWarMovement(world, nation.id);
    if (nationAtWar(world, nation.id)) mobilizeNation(world, nation.id);

    if (!heavyPlanMonth) continue;
    maybeEnactPartyReform(world, data, nation.id);
    maybeBuildFactory(world, data, nation.id);
    maybeBuildMilitary(world, nation.id);
    maybeDiplomaticActions(world, nation.id, rng);
    maybeColonialAndSphereActions(world, nation.id, rng);
  }
  keepValuesFinite(world);
}

