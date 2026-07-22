import type { BudgetLine, GameData, NationSummary, PartyIdeology, PopType, ProvinceSummary, World, WorldSnapshot } from '../shared/types';
import { dayToDate } from './world';
import { ideologyFromPop, partyByKey, reformDemandForPop, topReformDemandEntries } from './politics';
import {
  getCbsForNation,
  getCoalitionAgainst,
  getGreatPowerStandings,
  getInfluencePool,
  getInfluenceTargetsForNation,
  getInfamyLimit,
  getNationPowerBreakdown,
} from './systems/diplomacy';
import { getFormableStatusesForNation } from './formables';
import { listPlayerDecisions } from './systems/events';
import { buildPlayerTechView } from './systems/research';
import { computeTensionContributions, getWorldTension } from './systems/crisis';
import { buildCultureLedger, buildMovementViews, culturePolicyOf } from './systems/culture';

function zeroBudget(): BudgetLine {
  return {
    taxIncome: 0,
    tariffIncome: 0,
    productionIncome: 0,
    armyUpkeep: 0,
    subsidySpend: 0,
    constructionSpend: 0,
    adminSpend: 0,
    reformUpkeep: 0,
    net: 0,
    bankrupt: false,
    trace: {
      taxIncome: [],
      tariffIncome: [],
      productionIncome: [],
      armyUpkeep: [],
      subsidySpend: [],
      constructionSpend: [],
      adminSpend: [],
      reformUpkeep: [],
      net: [],
    },
  };
}

interface ProvincePopStats {
  population: number;
  militancy: number;
  needsMet: number;
  growth: number;
  outputProxy: number;
}

/**
 * Population / militancy / needs / growth / output for one province in a single
 * pop pass (was three separate passes over the same popIds per province, per
 * snapshot). Accumulation order is unchanged so results are bit-identical to the
 * old provincePopulation / provinceMilitancy / provinceNeeds trio.
 */
function provincePopStats(world: World, popIds: number[]): ProvincePopStats {
  if (popIds.length === 0) return { population: 0, militancy: 0, needsMet: 0, growth: 0, outputProxy: 0 };
  let population = 0;
  let militancySum = 0;
  let needs = 0;
  let growth = 0;
  let outputProxy = 0;
  for (const popId of popIds) {
    const pop = world.pops[popId];
    population += Math.max(0, pop?.size ?? 0);
    militancySum += Math.max(0, pop?.militancy ?? 0);
    if (!pop) continue;
    needs += Math.max(0, pop.needsMet);
    growth += Number.isFinite(pop.lastGrowth) ? pop.lastGrowth : 0;
    outputProxy += Math.max(0, pop.money) * 0.002;
  }
  return {
    population,
    militancy: militancySum / popIds.length,
    needsMet: needs / popIds.length,
    growth,
    outputProxy,
  };
}

export function buildSnapshot(world: World, data: GameData): WorldSnapshot {
  const rgoOutputByRecipe = Object.fromEntries(
    data.recipes
      .filter((recipe) => recipe.building === 'rgo')
      .map((recipe) => [recipe.key, recipe.output.good]),
  ) as Record<string, number>;
  // One recipe-by-key index instead of data.recipes.find(...) per province (and
  // per player factory) — that was an O(recipes) linear scan on every province.
  const recipeByKey = new Map(data.recipes.map((recipe) => [recipe.key, recipe]));

  // Per-owner aggregates in single passes: province counts + owned-pop militancy
  // and owned-state unrest, bucketed by owner in world order. Replaces the
  // per-nation world.provinces.filter / world.states.filter / flatMap+reduce
  // (O(nations x (provinces+states)) every snapshot). Same accumulation order
  // per owner ⇒ bit-identical averages.
  const nationCount = world.nations.length;
  const ownedProvinceCount = new Array<number>(nationCount).fill(0);
  const ownedPopIdCount = new Array<number>(nationCount).fill(0);
  const ownedPopMilitancySum = new Array<number>(nationCount).fill(0);
  const ownedStateCount = new Array<number>(nationCount).fill(0);
  const ownedStateUnrestSum = new Array<number>(nationCount).fill(0);
  for (const province of world.provinces) {
    const owner = province.owner;
    if (owner < 0 || owner >= nationCount) continue;
    ownedProvinceCount[owner]++;
    for (const popId of province.popIds) {
      ownedPopIdCount[owner]++;
      ownedPopMilitancySum[owner] += world.pops[popId]?.militancy ?? 0;
    }
  }
  for (const state of world.states) {
    const owner = state.owner;
    if (owner < 0 || owner >= nationCount) continue;
    ownedStateCount[owner]++;
    ownedStateUnrestSum[owner] += state.unrestRisk;
  }

  const powerByNation = new Map(world.nations.map((nation) => [nation.id, getNationPowerBreakdown(world, nation.id)]));
  const nations: NationSummary[] = world.nations.map((nation) => {
    const popIdCount = ownedPopIdCount[nation.id];
    const avgMilitancy = popIdCount > 0 ? ownedPopMilitancySum[nation.id] / popIdCount : 0;
    const stateCount = ownedStateCount[nation.id];
    const avgUnrest = stateCount > 0 ? ownedStateUnrestSum[nation.id] / stateCount : 0;
    const ruling = partyByKey(nation, nation.rulingParty);
    const power = powerByNation.get(nation.id) ?? { industry: 0, military: 0, score: 0 };
    return {
      id: nation.id,
      tag: nation.tag,
      name: nation.name,
      color: nation.color,
      capital: nation.capital,
      government: nation.government,
      rulingParty: ruling?.name ?? nation.rulingParty,
      rulingIdeology: ruling?.ideology ?? 'conservative',
      treasury: nation.treasury,
      prestige: nation.prestige,
      infamy: nation.infamy,
      gpRank: nation.gpRank,
      industryScore: power.industry,
      militaryScore: power.military,
      powerScore: power.score,
      spheredBy: nation.spheredBy,
      sphereMembers: nation.sphereMembers.slice().sort((a, b) => a - b),
      atWar: world.wars.some((war) => war.attackers.includes(nation.id) || war.defenders.includes(nation.id)),
      numProvinces: ownedProvinceCount[nation.id],
      militancy: avgMilitancy,
      unrest: avgUnrest,
      taxRatePoor: nation.taxRatePoor,
      taxRateMiddle: nation.taxRateMiddle,
      taxRateRich: nation.taxRateRich,
      tariffRate: nation.tariffRate,
      isBankrupt: nation.isBankrupt,
      constructionBlocked: nation.constructionBlocked,
      mobilizationCapacity: nation.mobilizationCapacity,
    };
  });

  const provinces: ProvinceSummary[] = world.provinces.map((province) => {
    const stats = provincePopStats(world, province.popIds);
    const rgoGood = rgoOutputByRecipe[province.rgo.recipe] ?? 0;
    const rgoOutput = (province.rgo.employed / 1000) * (recipeByKey.get(province.rgo.recipe)?.output.amount ?? 0);
    return {
      id: province.id,
      owner: province.owner,
      controller: province.controller,
      stateId: province.stateId,
      population: stats.population,
      militancy: stats.militancy,
      unrestRisk: world.states[province.stateId]?.unrestRisk ?? 0,
      needsMet: stats.needsMet,
      growth: stats.growth,
      economyOutput: rgoOutput + stats.outputProxy,
      rgoGood,
      fortLevel: province.fortLevel,
      occupation: province.occupationProgress,
    };
  });

  const playerOwnedStates = world.states.filter((state) => state.owner === world.playerNation);
  const playerCoreStateIds = world.nations[world.playerNation]?.coreStateIds?.slice().sort((a, b) => a - b) ?? [];
  const playerFormables = getFormableStatusesForNation(world, data, world.playerNation);
  const playerProduction = [
    ...world.provinces
      .filter((province) => province.owner === world.playerNation)
      .map((province) => ({
        kind: 'rgo' as const,
        locationName: province.name,
        recipe: province.rgo.recipe,
        outputGood: rgoOutputByRecipe[province.rgo.recipe] ?? 0,
        outputAmount: (province.rgo.employed / 1000) * (recipeByKey.get(province.rgo.recipe)?.output.amount ?? 0),
        employment: province.rgo.employed,
        profit: province.rgo.weeklyProfit,
        level: province.rgo.level,
      })),
    ...playerOwnedStates.flatMap((state) => state.factories.map((factory) => {
      const recipe = recipeByKey.get(factory.recipe);
      return {
        kind: 'factory' as const,
        locationName: state.name,
        recipe: factory.recipe,
        outputGood: recipe?.output.good ?? 0,
        outputAmount: factory.lastOutput,
        employment: factory.employed,
        profit: factory.weeklyProfit,
        level: factory.level,
      };
    })),
  ];

  const playerPopulationMap = new Map<string, {
    size: number;
    needs: number;
    mil: number;
    con: number;
    growth: number;
    count: number;
    ideology: Record<string, number>;
    agitating: Map<string, number>;
  }>();
  const playerNation = world.nations[world.playerNation];
  for (const province of world.provinces) {
    if (province.owner !== world.playerNation) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      const key = pop.type;
      const bucket = playerPopulationMap.get(key) ?? {
        size: 0,
        needs: 0,
        mil: 0,
        con: 0,
        growth: 0,
        count: 0,
        ideology: {},
        agitating: new Map<string, number>(),
      };
      bucket.size += pop.size;
      bucket.needs += pop.needsMet;
      bucket.mil += pop.militancy;
      bucket.con += pop.consciousness;
      bucket.growth += pop.lastGrowth;
      bucket.count += 1;
      const ideology = ideologyFromPop(pop);
      bucket.ideology[ideology] = (bucket.ideology[ideology] ?? 0) + pop.size;
      if (playerNation) {
        const demanded = reformDemandForPop(pop, playerNation, data);
        if (demanded) bucket.agitating.set(demanded, (bucket.agitating.get(demanded) ?? 0) + pop.size);
      }
      playerPopulationMap.set(key, bucket);
    }
  }
  const playerPopulation = Array.from(playerPopulationMap.entries())
    .map(([type, bucket]) => {
      const dominantIdeology = (Object.entries(bucket.ideology).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'conservative') as PartyIdeology;
      return {
        type: type as PopType,
        size: bucket.size,
        avgNeedsMet: bucket.count > 0 ? bucket.needs / bucket.count : 0,
        avgMilitancy: bucket.count > 0 ? bucket.mil / bucket.count : 0,
        avgConsciousness: bucket.count > 0 ? bucket.con / bucket.count : 0,
        dominantIdeology,
        agitatingFor: Array.from(bucket.agitating.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([reform]) => reform),
        growth: bucket.growth,
      };
    })
    .sort((a, b) => b.size - a.size);
  const playerReformAgitation = topReformDemandEntries(world, data, world.playerNation, 5);
  const playerStates = playerOwnedStates.map((state) => ({
    id: state.id,
    name: state.name,
    factoryCount: state.factories.length,
    coastal: state.provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal ?? false),
  }));

  return {
    day: world.day,
    date: dayToDate(world.day),
    speed: world.speed,
    playerNation: world.playerNation,
    seed: world.seed,
    mapMode: world.mapMode,
    nations,
    provinces,
    market: world.market.map((good) => ({ ...good })),
    wars: world.wars.map((war) => ({ ...war, attackers: war.attackers.slice(), defenders: war.defenders.slice(), goals: war.goals.map((goal) => ({ ...goal })) })),
    relations: world.relations.map((relation) => ({ ...relation })),
    greatPowers: getGreatPowerStandings(world).map((entry) => ({ ...entry, sphereMembers: entry.sphereMembers.slice() })),
    playerCbs: getCbsForNation(world, world.playerNation).map((cb) => ({ ...cb })),
    playerInfluencePool: getInfluencePool(world, world.playerNation),
    playerInfluenceTargets: getInfluenceTargetsForNation(world, world.playerNation).map((entry) => ({ ...entry })),
    infamyLimit: getInfamyLimit(),
    coalitionAgainstPlayer: getCoalitionAgainst(world, world.playerNation),
    armies: world.armies.map((army) => ({ ...army, regiments: army.regiments.map((regiment) => ({ ...regiment })), leader: army.leader ? { ...army.leader } : null })),
    fleets: world.fleets.map((fleet) => ({ ...fleet, ships: fleet.ships.map((ship) => ({ ...ship })) })),
    rebellions: world.rebellions.map((rebellion) => ({
      ...rebellion,
      demand: {
        ...rebellion.demand,
        stateIds: rebellion.demand.stateIds?.slice(),
      },
    })),
    playerProduction,
    playerPopulation,
    playerReformAgitation,
    playerStates,
    playerCoreStateIds,
    playerFormables,
    chronicle: world.chronicle ?? [],
    chronicleWarsFought: (world.chronicleWarIds ?? []).length,
    campaignOver: (() => {
      if (world.day >= 100 * 365) return 'century' as const;
      const alive = world.provinces.some((province) => province.owner === world.playerNation);
      return alive ? null : ('eliminated' as const);
    })(),
    recentBattles: (world.recentBattles ?? [])
      .filter((battle) => battle.attackerNation === world.playerNation || battle.defenderNation === world.playerNation)
      .slice(-8),
    pendingPlayerEvents: (world.pendingEvents ?? [])
      .filter((event) => event.nationId === world.playerNation)
      .map((event) => ({
        ...event,
        choices: event.choices.map((choice) => ({
          ...choice,
          effectsSummary: choice.effectsSummary.slice(),
        })),
      })),
    playerDecisions: listPlayerDecisions(world, data, world.playerNation),
    playerTech: buildPlayerTechView(world, data, world.playerNation),
    // 0.7.0 Concert of Europe
    worldTension: getWorldTension(world),
    tensionTrace: computeTensionContributions(world),
    activeCrisis: world.crisis
      ? {
        ...world.crisis,
        attackerBackers: world.crisis.attackerBackers.slice(),
        defenderBackers: world.crisis.defenderBackers.slice(),
        pressedBy: world.crisis.pressedBy.slice(),
      }
      : null,
    congressHistory: (world.congresses ?? []).map((record) => ({ ...record })),
    // 0.8.0 Age of Nationalism
    playerCulturePolicy: playerNation ? culturePolicyOf(playerNation) : 'assimilationist',
    playerCultures: buildCultureLedger(world, data, world.playerNation),
    playerMovements: buildMovementViews(world, data, world.playerNation),
    playerBudget: zeroBudget(),
  };
}
