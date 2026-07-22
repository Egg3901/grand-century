import type { GameData, NationId, ProvinceId, Ship, StateId, War, WarGoalType, World } from '../../shared/types';
import { BALANCE } from '../balance';
import type { Rng } from '../rng';
import { computeReformLegality, partyByKey } from '../politics';
import {
  beginCbFabrication,
  collectAllianceBloc,
  getCbsForNation,
  getInfluencePressureForTarget,
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
import { formNation, getFormableStatusesForNation } from '../formables';
import { isRecipeUnlocked } from './research';

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

function buildNationNeighborMap(world: World): NationId[][] {
  const neighbors: Set<NationId>[] = Array.from({ length: world.nations.length }, () => new Set<NationId>());
  for (const province of world.provinces) {
    const owner = province.owner;
    if (!world.nations[owner]) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || neighbor.owner === owner) continue;
      neighbors[owner].add(neighbor.owner);
    }
  }
  return neighbors.map((set) => Array.from(set).sort((a, b) => a - b));
}

function estimateNationPower(world: World, nationId: NationId): number {
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const military = armyStrengthForNation(world, nationId) * 2 + navyStrengthForNation(world, nationId) * 0.7;
  const economy = Math.max(0, nation.treasury) / 650 + nationPopulation(world, nationId) / 125_000;
  return military + economy + nation.prestige * 0.28;
}

function estimateBlocPower(world: World, nationIds: NationId[]): number {
  let total = 0;
  for (const nationId of nationIds) total += estimateNationPower(world, nationId);
  return total;
}

function allianceIdsForNation(world: World, nationId: NationId): NationId[] {
  return world.relations
    .filter((relation) => relation.kind === 'alliance' && (relation.expiresDay < 0 || relation.expiresDay > world.day))
    .map((relation) => relation.a === nationId ? relation.b : relation.b === nationId ? relation.a : -1)
    .filter((id): id is NationId => id >= 0)
    .sort((a, b) => a - b);
}

function rivalIdsForNation(world: World, nationId: NationId): NationId[] {
  return world.relations
    .filter((relation) => relation.kind === 'rivalry' && (relation.a === nationId || relation.b === nationId))
    .map((relation) => relation.a === nationId ? relation.b : relation.a)
    .sort((a, b) => a - b);
}

function stateConquestScore(world: World, attacker: NationId, stateId: StateId): { score: number; colonial: boolean; bordersAttacker: boolean } {
  const state = world.states[stateId];
  if (!state || state.provinceIds.length === 0) return { score: -999, colonial: false, bordersAttacker: false };
  let score = 0;
  let colonial = true;
  let bordersAttacker = false;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    score += provincePopulation(world, province.id) * 0.0007;
    score += province.rgo.level * 1.25;
    if (province.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === attacker)) {
      bordersAttacker = true;
      score += 5.5;
    }
    if (!province.colonial) colonial = false;
  }
  if (colonial) score += 2.5;
  if (!bordersAttacker) score -= 2.2;
  return { score, colonial, bordersAttacker };
}

function bestTargetStateForWar(world: World, attacker: NationId, defender: NationId): {
  stateId: StateId;
  score: number;
  colonial: boolean;
  bordersAttacker: boolean;
} {
  const ranked = world.states
    .filter((state) => state.owner === defender)
    .map((state) => {
      const detail = stateConquestScore(world, attacker, state.id);
      return { stateId: state.id, ...detail };
    })
    .sort((a, b) => b.score - a.score || a.stateId - b.stateId);
  return ranked[0] ?? { stateId: -1, score: -999, colonial: false, bordersAttacker: false };
}

function hasColonialWarReach(world: World, nationId: NationId, stateId: StateId): boolean {
  const state = world.states[stateId];
  if (!state || state.provinceIds.length === 0) return false;
  const ownsCoastWithBase = world.provinces.some((province) => (
    province.owner === nationId && province.coastal && province.navalBaseLevel > 0
  ));
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    if (province.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === nationId)) return true;
    if (province.coastal && ownsCoastWithBase) return true;
  }
  return false;
}

function decideWarGoal(
  world: World,
  attacker: NationId,
  defender: NationId,
  advantage: number,
  preferredState: ReturnType<typeof bestTargetStateForWar>,
): { goal: WarGoalType; stateId: StateId } {
  const attackerNation = world.nations[attacker];
  const defenderNation = world.nations[defender];
  const relation = getOrCreateRelation(world, attacker, defender);
  const rival = relation.kind === 'rivalry';
  const risingRival = defenderNation && attackerNation
    ? defenderNation.prestige > attackerNation.prestige * 0.9 && estimateNationPower(world, defender) > estimateNationPower(world, attacker) * 0.85
    : false;

  if (
    preferredState.stateId >= 0
    && preferredState.colonial
    && hasColonialWarReach(world, attacker, preferredState.stateId)
    && advantage >= BALANCE.ai.warDeclareMinAdvantage
  ) {
    return { goal: 'take_colony', stateId: preferredState.stateId };
  }

  if (
    preferredState.stateId >= 0
    && preferredState.bordersAttacker
    && preferredState.score > 8
    && advantage >= BALANCE.ai.warDeclareStrongAdvantage
  ) {
    return { goal: 'annex_state', stateId: preferredState.stateId };
  }

  if ((rival || risingRival) && advantage >= BALANCE.ai.warDeclareMinAdvantage) {
    return { goal: 'cut_down_to_size', stateId: -1 };
  }

  if (attackerNation?.gpRank > 0 && defenderNation?.gpRank === 0 && relation.opinion < -20 && advantage >= BALANCE.ai.warDeclareMinAdvantage) {
    return { goal: 'add_to_sphere', stateId: -1 };
  }

  if (preferredState.stateId >= 0 && advantage >= BALANCE.ai.warDeclareStrongAdvantage && preferredState.score > 7.5) {
    return { goal: 'annex_state', stateId: preferredState.stateId };
  }

  return { goal: 'humiliate', stateId: -1 };
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
    const orderedNeighbors = province.neighbors.slice().sort((a, b) => a - b);
    for (const neighborId of orderedNeighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      cameFrom.set(neighborId, current);
      queue.push(neighborId);
      if (visited.size > 550) break;
    }
    if (visited.size > 550) break;
  }

  if (!found) {
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

function nearestFriendlySupplyProvince(world: World, nationId: NationId, from: ProvinceId, enemies: Set<NationId>): ProvinceId {
  const queue: ProvinceId[] = [from];
  const visited = new Set<ProvinceId>([from]);
  while (queue.length > 0) {
    const current = queue.shift() as ProvinceId;
    const province = world.provinces[current];
    if (!province) continue;
    const friendly = province.owner === nationId || province.controller === nationId;
    const threatened = province.neighbors.some((neighborId) => enemies.has(world.provinces[neighborId]?.owner ?? -1));
    if (friendly && !threatened) return current;
    const orderedNeighbors = province.neighbors.slice().sort((a, b) => a - b);
    for (const neighborId of orderedNeighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      if (visited.size > 320) break;
      queue.push(neighborId);
    }
    if (visited.size > 320) break;
  }
  return from;
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
  return Array.from(new Set(targets)).sort((a, b) => a - b);
}

function collectThreatenedHomeProvinces(world: World, nationId: NationId, enemies: Set<NationId>): ProvinceId[] {
  const threatened: ProvinceId[] = [];
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    if (province.controller !== nationId) {
      threatened.push(province.id);
      continue;
    }
    if (province.neighbors.some((neighborId) => enemies.has(world.provinces[neighborId]?.owner ?? -1))) threatened.push(province.id);
  }
  return threatened.sort((a, b) => a - b);
}

function warObjectiveProvinces(world: World, nationId: NationId, enemies: Set<NationId>): ProvinceId[] {
  const objectives = new Set<ProvinceId>();
  for (const enemyId of enemies) {
    const enemy = world.nations[enemyId];
    if (enemy) objectives.add(enemy.capital);
  }
  for (const war of world.wars) {
    const onAttackers = war.attackers.includes(nationId);
    const onDefenders = war.defenders.includes(nationId);
    if (!onAttackers && !onDefenders) continue;
    for (const goal of war.goals) {
      if (goal.holder !== nationId || goal.stateId < 0) continue;
      const state = world.states[goal.stateId];
      if (!state) continue;
      for (const provinceId of state.provinceIds) objectives.add(provinceId);
    }
  }
  for (const front of frontTargets(world, nationId, enemies)) objectives.add(front);
  return Array.from(objectives).sort((a, b) => a - b);
}

function armyReadiness(army: { regiments: Array<{ organization: number; strength: number }> } | null | undefined): { avgOrg: number; avgStrength: number } {
  if (!army || army.regiments.length === 0) return { avgOrg: 0, avgStrength: 0 };
  let org = 0;
  let strength = 0;
  for (const regiment of army.regiments) {
    org += clamp(regiment.organization, 0, 100);
    strength += clamp(regiment.strength / 1000, 0, 1.1);
  }
  return {
    avgOrg: org / army.regiments.length,
    avgStrength: strength / army.regiments.length,
  };
}

function manageWarMovement(world: World, nationId: NationId): void {
  const enemies = nationEnemySet(world, nationId);
  if (enemies.size === 0) return;
  const nation = world.nations[nationId];
  if (!nation) return;
  const capital = nation.capital;
  const objectives = warObjectiveProvinces(world, nationId, enemies);
  const threatened = collectThreatenedHomeProvinces(world, nationId, enemies);
  const enemyArmyProvinces = new Set<ProvinceId>();
  for (const army of world.armies) {
    if (enemies.has(army.owner) && !army.rebel && army.regiments.length > 0) {
      enemyArmyProvinces.add(army.location);
    }
  }
  let issuedMoves = 0;

  for (const army of world.armies) {
    if (army.owner !== nationId || army.rebel || army.regiments.length === 0) continue;
    if (army.moveTarget >= 0) continue;
    if (!army.leader) assignGeneralToArmy(world, nationId, army.id);

    const readiness = armyReadiness(army);
    const weak = readiness.avgOrg < BALANCE.ai.warRetreatOrgThreshold || readiness.avgStrength < BALANCE.ai.warRetreatStrengthThreshold;
    if (weak) {
      const fallback = nearestFriendlySupplyProvince(world, nationId, army.location, enemies);
      const retreatStep = stepToward(world, army.location, fallback);
      let weakStep = retreatStep;
      if (weakStep === army.location) {
        const neighbors = world.provinces[army.location]?.neighbors.slice().sort((a, b) => a - b) ?? [];
        weakStep = neighbors[0] ?? army.location;
      }
      if (weakStep !== army.location && world.provinces[army.location]?.neighbors.includes(weakStep)) {
        army.moveTarget = weakStep;
        army.moveProgress = 0;
        issuedMoves++;
        if (issuedMoves >= BALANCE.ai.warMoveBudgetPerMonth) break;
      }
      continue;
    }

    const locationProvince = world.provinces[army.location];
    const inEnemyLand = enemies.has(locationProvince?.owner ?? -1);
    if (inEnemyLand && (locationProvince?.controller ?? -1) !== nationId && !enemyArmyProvinces.has(army.location)) {
      continue;
    }

    const adjacentUndefended = (locationProvince?.neighbors ?? [])
      .map((neighborId) => world.provinces[neighborId])
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .filter((candidate) => enemies.has(candidate.owner) && candidate.controller !== nationId && !enemyArmyProvinces.has(candidate.id))
      .sort((a, b) => a.id - b.id)[0];

    let desiredTarget: ProvinceId = capital;
    const capitalThreatened = threatened.includes(capital);
    if (capitalThreatened && army.id % 3 === 0) desiredTarget = capital;
    else if (threatened.length > 0 && army.id % 2 === 0) desiredTarget = threatened[(army.id + world.day) % threatened.length] as ProvinceId;
    else if (adjacentUndefended) desiredTarget = adjacentUndefended.id;
    else if (objectives.length > 0) desiredTarget = objectives[(army.id + world.day) % objectives.length] as ProvinceId;

    let step = stepToward(world, army.location, desiredTarget);
    if (step === army.location) {
      const patrol = world.provinces[army.location]?.neighbors.slice().sort((a, b) => a - b)[0];
      if (patrol !== undefined) step = patrol;
    }
    if (step !== army.location && world.provinces[army.location]?.neighbors.includes(step)) {
      army.moveTarget = step;
      army.moveProgress = 0;
      issuedMoves++;
      if (issuedMoves >= BALANCE.ai.warMoveBudgetPerMonth) break;
    }
  }
  if (issuedMoves > 0) return;
  const fallbackArmy = world.armies
    .filter((army) => army.owner === nationId && !army.rebel && army.regiments.length > 0 && army.moveTarget < 0)
    .sort((a, b) => a.id - b.id)[0];
  if (!fallbackArmy) return;
  const neighbors = world.provinces[fallbackArmy.location]?.neighbors.slice().sort((a, b) => a - b) ?? [];
  const fallbackNeighbor = neighbors[0];
  if (fallbackNeighbor === undefined) return;
  fallbackArmy.moveTarget = fallbackNeighbor;
  fallbackArmy.moveProgress = 0;
}

function choosePeaceGoals(war: War, attackerSide: boolean): number[] {
  const mySide = attackerSide ? war.attackers : war.defenders;
  const available = attackerSide ? war.score : -war.score;
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

function sideStrengthInWar(world: World, side: NationId[]): number {
  let total = 0;
  for (const nationId of side) total += estimateNationPower(world, nationId);
  return Math.max(1, total);
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
    const myStrength = sideStrengthInWar(world, onAttackerSide ? war.attackers : war.defenders);
    const enemyStrength = sideStrengthInWar(world, onAttackerSide ? war.defenders : war.attackers);
    const strengthRatio = myStrength / Math.max(1, enemyStrength);
    const warDays = world.day - war.startDay;
    const achievableGoals = choosePeaceGoals(war, onAttackerSide);

    const losing = scoreForNation <= BALANCE.ai.peaceLoseScore
      || myExhaustion >= BALANCE.ai.peaceExhaustionPush
      || strengthRatio < 0.82;
    const stalemate = Math.abs(scoreForNation) <= BALANCE.ai.peaceStalemateScoreBand
      && warDays >= BALANCE.ai.peaceStalemateDays;
    const forcedExit = warDays >= BALANCE.ai.peaceForceExitDays;
    const commitToWar = warDays < 120 && myExhaustion < BALANCE.ai.peaceExhaustionPush && scoreForNation > -35;
    if ((losing || stalemate || forcedExit) && !commitToWar) {
      offerPeaceTerms(world, war.id, nationId, []);
      continue;
    }

    const winning = scoreForNation >= BALANCE.ai.peaceWinScore
      || (scoreForNation >= BALANCE.ai.peaceScorePush && enemyExhaustion >= BALANCE.ai.peaceExhaustionPush && strengthRatio >= 0.95);
    if (!winning || achievableGoals.length === 0) continue;

    const holdOut = myExhaustion < BALANCE.ai.peaceHoldExhaustionMax
      && enemyExhaustion < 90
      && strengthRatio > 1
      && scoreForNation < 85
      && warDays < BALANCE.ai.peaceForceExitDays;
    if (holdOut) continue;
    const result = offerPeaceTerms(world, war.id, nationId, achievableGoals);
    if (!result.ok && result.counterGoals && result.counterGoals.length < achievableGoals.length) {
      offerPeaceTerms(world, war.id, nationId, result.counterGoals);
    }
  }
}

function stabilizeEconomy(world: World, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const war = nationAtWar(world, nationId);
  const treasury = nation.treasury;
  const income = nation.monthlyProductionIncome + nation.monthlyTariffIncome;
  const reserveTarget = BALANCE.ai.factoryTreasuryReserve + (war ? 450 : 0);
  const pressure = clamp((reserveTarget - treasury) / 6200, -1.1, 1.1);
  const warPush = war ? 0.12 : 0;
  const bankruptPush = nation.isBankrupt ? 0.2 : 0;
  const incomeStress = income < 0 ? clamp(Math.abs(income) / 350, 0, 0.18) : 0;

  nation.taxRatePoor = clamp(0.34 + pressure * 0.17 + warPush + bankruptPush + incomeStress, BALANCE.ai.minTax, BALANCE.ai.maxTax);
  nation.taxRateMiddle = clamp(0.27 + pressure * 0.15 + warPush * 0.7 + bankruptPush + incomeStress * 0.75, BALANCE.ai.minTax, BALANCE.ai.maxTax);
  nation.taxRateRich = clamp(0.18 + pressure * 0.13 + warPush * 0.35 + bankruptPush * 0.65 + incomeStress * 0.45, BALANCE.ai.minTax * 0.4, BALANCE.ai.maxTax);
  nation.tariffRate = clamp(
    pressure * 0.32 + (income < 0 ? 0.05 : 0) + (nation.isBankrupt ? 0.15 : 0),
    BALANCE.ai.minTariff,
    BALANCE.ai.maxTariff,
  );
}

// 0.6.0: AI tech selection & research point generation moved to
// src/sim/systems/research.ts (runResearchMonthly), which now also covers the
// player nation. The party/posture weighting lives on there.

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
    .sort((a, b) => b.legality.support - a.legality.support || a.reform.key.localeCompare(b.reform.key));
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
  // 0.6.0: only recipes whose tech gate this nation has passed.
  const factoryRecipes = data.recipes.filter((recipe) => recipe.building === 'factory' && isRecipeUnlocked(nation, recipe));
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

  const stateIsCoastal = candidate.state.provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal);
  const recipe = factoryRecipes
    .filter((factoryRecipe) => !factoryRecipe.requiresCoastal || stateIsCoastal)
    .map((factoryRecipe) => {
      const outputPrice = world.market[factoryRecipe.output.good]?.price ?? 0;
      const outputValue = outputPrice * factoryRecipe.output.amount * BALANCE.economy.factoryOutputBoost;
      const inputValue = factoryRecipe.inputs.reduce((sum, input) => (
        sum + (world.market[input.good]?.price ?? 0) * input.amount * BALANCE.economy.factoryInputIntensity
      ), 0);
      const expectedMargin = outputValue - inputValue;
      return { factoryRecipe, expectedMargin };
    })
    .sort((a, b) => b.expectedMargin - a.expectedMargin || a.factoryRecipe.key.localeCompare(b.factoryRecipe.key))[0]?.factoryRecipe;
  if (!recipe) return;
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
    lastInputCost: 0,
    lastWages: 0,
    lastOperating: 0,
    lastCapacity: 2300,
    lastInputFill: 1,
  });
}

function maybeBuildMilitary(world: World, nationId: NationId): void {
  const nation = world.nations[nationId];
  if (!nation || nation.isBankrupt) return;
  const totalPop = nationPopulation(world, nationId);
  const income = Math.max(0, nation.monthlyProductionIncome + nation.monthlyTariffIncome);
  const ecoMultiplier = clamp((nation.treasury + income * BALANCE.ai.militaryBuildMaxIncomeMultiplier) / 4500, 0.45, 1.4);
  const warBoost = nationAtWar(world, nationId) ? 1.15 : 1;
  const desiredArmy = Math.max(2, Math.floor((totalPop / 1000) * BALANCE.ai.baseArmyRatio * ecoMultiplier * warBoost));
  const currentArmy = Math.floor(armyStrengthForNation(world, nationId));
  const desiredFleet = Math.max(0, Math.floor((totalPop / 1000) * BALANCE.ai.baseFleetRatio * ecoMultiplier + (nation.gpRank > 0 ? 5 : 0)));
  const currentFleet = Math.floor(navyStrengthForNation(world, nationId));

  if (currentArmy < desiredArmy && nation.treasury > Math.max(BALANCE.ai.militaryBuildTreasuryFloor, BALANCE.ai.warTreasuryReserve)) {
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

  if (currentFleet < desiredFleet && nation.treasury > BALANCE.ai.militaryBuildTreasuryFloor) {
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

interface WarTargetChoice {
  targetId: NationId;
  advantage: number;
  targetState: ReturnType<typeof bestTargetStateForWar>;
  attackers: NationId[];
  defenders: NationId[];
  score: number;
}

function pickPrimaryThreat(world: World, nationId: NationId, neighbors: NationId[], power: number): NationId | null {
  const candidates = Array.from(new Set([...neighbors, ...rivalIdsForNation(world, nationId)]))
    .map((otherId) => {
      const otherPower = estimateNationPower(world, otherId);
      const relation = getOrCreateRelation(world, nationId, otherId);
      let score = 0;
      if (neighbors.includes(otherId)) score += 14;
      score += (otherPower / Math.max(1, power)) * 14;
      score += Math.max(0, -relation.opinion) * 0.08;
      if (relation.kind === 'rivalry') score += 10;
      score += world.nations[otherId]?.infamy ? world.nations[otherId].infamy * 0.25 : 0;
      return { otherId, score };
    })
    .sort((a, b) => b.score - a.score || a.otherId - b.otherId);
  if (!candidates[0] || candidates[0].score < 12) return null;
  return candidates[0].otherId;
}

function manageAlliancesAndRivalries(
  world: World,
  nationId: NationId,
  neighbors: NationId[],
  neighborMap: NationId[][],
  power: number,
  plannedTarget: NationId | null,
): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const threat = pickPrimaryThreat(world, nationId, neighbors, power);
  const threatPower = threat !== null ? estimateNationPower(world, threat) : 0;

  for (const relation of world.relations) {
    if (relation.kind !== 'alliance') continue;
    if (relation.a !== nationId && relation.b !== nationId) continue;
    const allyId = relation.a === nationId ? relation.b : relation.a;
    const allyPower = estimateNationPower(world, allyId);
    const allyHostile = relation.opinion <= BALANCE.ai.allianceBreakHostileOpinion;
    const tooWeak = allyPower < power * BALANCE.ai.allianceBreakWeakPowerRatio && (threat === null || power > threatPower * 1.08);
    const conflictsWithPlans = plannedTarget !== null && plannedTarget === allyId;
    if (allyHostile || tooWeak || conflictsWithPlans) {
      relation.kind = 'neutral';
      relation.expiresDay = -1;
    }
  }

  const allies = allianceIdsForNation(world, nationId);
  if (threat !== null && allies.length < 2) {
    const candidates = world.nations
      .filter((other) => other.id !== nationId)
      .filter((other) => other.id !== plannedTarget)
      .map((other) => {
        const relation = getOrCreateRelation(world, nationId, other.id);
        if (relation.kind === 'rivalry' || relation.kind === 'truce' || relation.kind === 'alliance') return { id: other.id, score: -999 };
        if (hasActiveTruce(world, nationId, other.id)) return { id: other.id, score: -999 };
        const otherPower = estimateNationPower(world, other.id);
        const opinion = relation.opinion;
        const complement = 17 - Math.abs(otherPower - power) * 0.22;
        const sharesThreatBorder = neighborMap[other.id]?.includes(threat) ? 18 : 0;
        const canHelp = otherPower + power > threatPower * 1.02 ? 14 : 0;
        const score = opinion * 0.55 + complement + sharesThreatBorder + canHelp;
        return { id: other.id, score };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const choice = candidates[0];
    if (choice && choice.score >= BALANCE.ai.allianceMinOpinion) {
      const relation = getOrCreateRelation(world, nationId, choice.id);
      relation.kind = 'alliance';
      relation.opinion = clamp(relation.opinion + 14, -200, 200);
      relation.expiresDay = world.day + 365 * 9;
    }
  }

  for (const relation of world.relations) {
    if (relation.kind !== 'rivalry') continue;
    if (relation.a !== nationId && relation.b !== nationId) continue;
    const rivalId = relation.a === nationId ? relation.b : relation.a;
    const rivalPower = estimateNationPower(world, rivalId);
    const ratio = power / Math.max(1, rivalPower);
    if (ratio < 0.45 || ratio > 2.2 || relation.opinion > 30) {
      relation.kind = 'neutral';
      relation.expiresDay = -1;
    }
  }

  if (rivalIdsForNation(world, nationId).length === 0) {
    const rivalCandidates = world.nations
      .filter((other) => other.id !== nationId)
      .map((other) => {
        const relation = getOrCreateRelation(world, nationId, other.id);
        if (relation.kind === 'alliance' || relation.kind === 'truce') return { id: other.id, score: -999 };
        const otherPower = estimateNationPower(world, other.id);
        const ratio = power / Math.max(1, otherPower);
        const comparable = ratio >= BALANCE.ai.rivalComparablePowerMin && ratio <= BALANCE.ai.rivalComparablePowerMax;
        const borderContest = neighbors.includes(other.id) ? 16 : 0;
        let sphereContest = 0;
        if (nation.gpRank > 0 && other.gpRank > 0) {
          const mine = world.nations.filter((candidate) => candidate.spheredBy === nationId).length;
          const theirs = world.nations.filter((candidate) => candidate.spheredBy === other.id).length;
          if (mine > 0 || theirs > 0) sphereContest = 8;
        }
        const hostility = Math.max(0, -relation.opinion) * 0.11;
        const score = borderContest + sphereContest + hostility + (comparable ? 11 : -7);
        return { id: other.id, score };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const rival = rivalCandidates[0];
    if (rival && rival.score >= BALANCE.ai.rivalMinScore) {
      const relation = getOrCreateRelation(world, nationId, rival.id);
      relation.kind = 'rivalry';
      relation.opinion = Math.min(relation.opinion, -40);
      relation.expiresDay = -1;
    }
  }
}

function chooseWarTarget(world: World, nationId: NationId, neighbors: NationId[]): WarTargetChoice | null {
  const candidates: WarTargetChoice[] = [];
  for (const targetId of neighbors) {
    const targetNation = world.nations[targetId];
    if (!targetNation) continue;
    if (hasActiveTruce(world, nationId, targetId)) continue;
    const relation = getOrCreateRelation(world, nationId, targetId);
    if (relation.kind === 'alliance') continue;
    const targetState = bestTargetStateForWar(world, nationId, targetId);
    const attackers = collectAllianceBloc(world, nationId, targetId);
    const defenders = collectAllianceBloc(world, targetId, nationId);
    const dedupAttackers = Array.from(new Set(attackers.filter((id) => !defenders.includes(id)))).sort((a, b) => a - b);
    const dedupDefenders = Array.from(new Set(defenders.filter((id) => !dedupAttackers.includes(id)))).sort((a, b) => a - b);
    const attackPower = estimateBlocPower(world, dedupAttackers.length > 0 ? dedupAttackers : [nationId]);
    const defendPower = estimateBlocPower(world, dedupDefenders.length > 0 ? dedupDefenders : [targetId]);
    const advantage = attackPower / Math.max(1, defendPower);
    const hostility = Math.max(0, -relation.opinion) * 0.2 - Math.max(0, relation.opinion) * 0.18;
    const rivalryBonus = relation.kind === 'rivalry' ? 8 : 0;
    const economicPrize = targetState.score;
    const score = (advantage - 1) * 43 + hostility + rivalryBonus + economicPrize - targetNation.infamy * 0.2;
    candidates.push({
      targetId,
      advantage,
      targetState,
      attackers: dedupAttackers.length > 0 ? dedupAttackers : [nationId],
      defenders: dedupDefenders.length > 0 ? dedupDefenders : [targetId],
      score,
    });
  }

  const sorted = candidates.sort((a, b) => b.score - a.score || a.targetId - b.targetId);
  const chosen = sorted[0];
  if (!chosen) return null;
  if (chosen.advantage < BALANCE.ai.warDeclareMinAdvantage) return null;
  if (chosen.targetState.stateId < 0 && chosen.advantage < BALANCE.ai.warDeclareStrongAdvantage) return null;
  return chosen;
}

function maybeDiplomaticActions(world: World, nationId: NationId, _rng: Rng, neighborMap: NationId[][]): void {
  const nation = world.nations[nationId];
  if (!nation || nationAtWar(world, nationId)) return;
  const neighbors = neighborMap[nationId] ?? [];
  if (neighbors.length === 0) return;

  const power = estimateNationPower(world, nationId);
  const targetChoice = chooseWarTarget(world, nationId, neighbors);
  const plannedTarget = targetChoice?.targetId ?? null;
  manageAlliancesAndRivalries(world, nationId, neighbors, neighborMap, power, plannedTarget);

  const infamyLimit = getInfamyLimit();
  if (!targetChoice) return;
  if (nation.infamy > infamyLimit * BALANCE.ai.warInfamyDeclareFactor) return;
  if (nation.treasury < BALANCE.ai.warTreasuryReserve) return;
  if (nation.isBankrupt) return;
  if (nation.bankruptcyMonths > 0 && nation.monthlyProductionIncome + nation.monthlyTariffIncome < 0) return;
  if (nation.infamy > infamyLimit * 1.15) return;

  const { goal, stateId } = decideWarGoal(world, nationId, targetChoice.targetId, targetChoice.advantage, targetChoice.targetState);
  const validState = goal === 'humiliate' || goal === 'cut_down_to_size' || goal === 'add_to_sphere' ? -1 : stateId;
  const cb = getCbsForNation(world, nationId).find((entry) => (
    entry.target === targetChoice.targetId
    && entry.goal === goal
    && (entry.stateId === validState || entry.stateId === -1 || validState < 0)
  ));
  if (!cb) {
    beginCbFabrication(world, nationId, targetChoice.targetId, goal, validState);
    return;
  }

  const rule = getWarGoalRule(goal);
  if (nation.infamy + rule.infamyUse > infamyLimit * 1.32) return;
  if (targetChoice.advantage < BALANCE.ai.warDeclareMinAdvantage) return;
  world.wars.push({
    id: world.nextWarId++,
    attackers: targetChoice.attackers,
    defenders: targetChoice.defenders,
    goals: [{
      holder: nationId,
      target: targetChoice.targetId,
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

function hasColonialReach(world: World, nationId: NationId): boolean {
  return world.provinces.some((province) => province.owner === nationId && province.coastal && province.navalBaseLevel > 0);
}

function maybeColonialAndSphereActions(world: World, nationId: NationId, rng: Rng, neighborMap: NationId[][]): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const myPower = estimateNationPower(world, nationId);
  if (nation.gpRank > 0) {
    const candidates = world.nations
      .filter((candidate) => candidate.id !== nationId && candidate.gpRank === 0)
      .map((candidate) => {
        const relation = getOrCreateRelation(world, nationId, candidate.id);
        const pressure = getInfluencePressureForTarget(world, candidate.id);
        const ownPressure = pressure.find((entry) => entry.gp === nationId)?.points ?? 0;
        const leader = pressure[0];
        let backoffPenalty = 0;
        if (leader && leader.gp !== nationId) {
          const leaderPower = estimateNationPower(world, leader.gp);
          if (
            leader.points - ownPressure >= BALANCE.ai.sphereBackoffLead
            && leaderPower > myPower * BALANCE.ai.sphereBackoffPowerMargin
          ) {
            backoffPenalty = 40;
          }
        }
        const near = (neighborMap[nationId] ?? []).includes(candidate.id) ? 18 : 0;
        const sphereBias = candidate.spheredBy === nationId ? 22 : candidate.spheredBy >= 0 ? -10 : 0;
        const score = relation.opinion * 0.35 + near + sphereBias + ownPressure * 0.3 - backoffPenalty;
        return { id: candidate.id, score };
      })
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, BALANCE.ai.sphereContestTargets);
    for (const target of candidates) {
      if (target.score < 8) continue;
      spendInfluence(world, nationId, target.id, 1);
    }
  }

  if (nation.colonialPoints >= 32 && rng.chance(0.34)) {
    const reach = hasColonialReach(world, nationId);
    const candidates = world.states
      .filter((state) => state.provinceIds.length > 0)
      .filter((state) => state.provinceIds.every((provinceId) => world.provinces[provinceId]?.colonial))
      .map((state) => {
        const near = state.provinceIds.some((provinceId) => (
          world.provinces[provinceId]?.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === nationId)
        ));
        const coastal = state.provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal);
        if (!near && !(reach && coastal)) return { id: state.id, score: -999 };
        const pop = state.provinceIds.reduce((sum, provinceId) => sum + provincePopulation(world, provinceId), 0);
        const rgo = state.provinceIds.reduce((sum, provinceId) => sum + (world.provinces[provinceId]?.rgo.level ?? 0), 0);
        const score = (near ? 8 : 3) + pop * 0.00009 + rgo * 0.75;
        return { id: state.id, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const chosen = pickRandom(rng, candidates.slice(0, BALANCE.ai.colonizationPickTop));
    if (chosen) startColonization(world, nationId, chosen.id);
  }
}

function maybePursueFormables(world: World, data: GameData, nationId: NationId): boolean {
  const nation = world.nations[nationId];
  if (!nation) return false;
  const statuses = getFormableStatusesForNation(world, data, nationId);
  if (statuses.length === 0) return false;
  const ready = statuses.find((status) => status.ready);
  if (ready) {
    formNation(world, data, nationId, ready.key);
    return true;
  }

  const target = statuses
    .slice()
    .sort((a, b) => (
      b.controlledCoreStates - a.controlledCoreStates
      || a.requiredCoreStates - b.requiredCoreStates
      || a.key.localeCompare(b.key)
    ))[0];
  if (!target || nation.gpRank <= 0) return false;

  const sphere = new Set(nation.sphereMembers);
  const missingOwners = new Set<NationId>();
  for (const stateId of target.coreStateIds) {
    const state = world.states[stateId];
    if (!state) continue;
    if (state.owner === nationId || sphere.has(state.owner)) continue;
    if (world.nations[state.owner]?.gpRank > 0) continue;
    missingOwners.add(state.owner);
  }

  for (const ownerId of Array.from(missingOwners).sort((a, b) => a - b).slice(0, 2)) {
    spendInfluence(world, nationId, ownerId, 1);
  }
  return false;
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
  const neighborMap = buildNationNeighborMap(world);
  for (const nation of world.nations) {
    if (nation.isPlayer) continue;
    const heavyPlanMonth = ((monthIndex + nation.id) % BALANCE.ai.heavyPlanningStride) === 0;

    stabilizeEconomy(world, nation.id);
    maybePeaceOut(world, nation.id);
    manageWarMovement(world, nation.id);
    if (nationAtWar(world, nation.id)) mobilizeNation(world, nation.id);
    const formed = maybePursueFormables(world, data, nation.id);
    if (formed) continue;

    if (!heavyPlanMonth) continue;
    maybeEnactPartyReform(world, data, nation.id);
    maybeBuildFactory(world, data, nation.id);
    maybeBuildMilitary(world, nation.id);
    maybeDiplomaticActions(world, nation.id, rng, neighborMap);
    maybeColonialAndSphereActions(world, nation.id, rng, neighborMap);
    maybePursueFormables(world, data, nation.id);
  }
  keepValuesFinite(world);
}

