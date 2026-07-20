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

function provincePopulation(world: World, popIds: number[]): number {
  let total = 0;
  for (const popId of popIds) total += Math.max(0, world.pops[popId]?.size ?? 0);
  return total;
}

function provinceMilitancy(world: World, popIds: number[]): number {
  if (popIds.length === 0) return 0;
  let total = 0;
  for (const popId of popIds) total += Math.max(0, world.pops[popId]?.militancy ?? 0);
  return total / popIds.length;
}

function provinceNeeds(world: World, popIds: number[]): { needsMet: number; growth: number; outputProxy: number } {
  if (popIds.length === 0) return { needsMet: 0, growth: 0, outputProxy: 0 };
  let needs = 0;
  let growth = 0;
  let outputProxy = 0;
  for (const popId of popIds) {
    const pop = world.pops[popId];
    if (!pop) continue;
    needs += Math.max(0, pop.needsMet);
    growth += Number.isFinite(pop.lastGrowth) ? pop.lastGrowth : 0;
    outputProxy += Math.max(0, pop.money) * 0.002;
  }
  return {
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

  const powerByNation = new Map(world.nations.map((nation) => [nation.id, getNationPowerBreakdown(world, nation.id)]));
  const nations: NationSummary[] = world.nations.map((nation) => {
    const owned = world.provinces.filter((province) => province.owner === nation.id);
    const popCount = owned.flatMap((province) => province.popIds);
    const avgMilitancy = popCount.length > 0
      ? popCount.reduce((sum, popId) => sum + (world.pops[popId]?.militancy ?? 0), 0) / popCount.length
      : 0;
    const ownedStates = world.states.filter((state) => state.owner === nation.id);
    const avgUnrest = ownedStates.length > 0
      ? ownedStates.reduce((sum, state) => sum + state.unrestRisk, 0) / ownedStates.length
      : 0;
    const ruling = partyByKey(nation, nation.rulingParty);
    const power = powerByNation.get(nation.id) ?? { industry: 0, military: 0, score: 0 };
    return {
      id: nation.id,
      tag: nation.tag,
      name: nation.name,
      color: nation.color,
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
      numProvinces: owned.length,
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
    const needs = provinceNeeds(world, province.popIds);
    const rgoGood = rgoOutputByRecipe[province.rgo.recipe] ?? 0;
    const rgoOutput = (province.rgo.employed / 1000) * (data.recipes.find((recipe) => recipe.key === province.rgo.recipe)?.output.amount ?? 0);
    return {
      id: province.id,
      owner: province.owner,
      controller: province.controller,
      stateId: province.stateId,
      population: provincePopulation(world, province.popIds),
      militancy: provinceMilitancy(world, province.popIds),
      unrestRisk: world.states[province.stateId]?.unrestRisk ?? 0,
      needsMet: needs.needsMet,
      growth: needs.growth,
      economyOutput: rgoOutput + needs.outputProxy,
      rgoGood,
      fortLevel: province.fortLevel,
      occupation: province.occupationProgress,
    };
  });

  const playerOwnedStates = world.states.filter((state) => state.owner === world.playerNation);
  const playerProduction = [
    ...world.provinces
      .filter((province) => province.owner === world.playerNation)
      .map((province) => ({
        kind: 'rgo' as const,
        locationName: province.name,
        recipe: province.rgo.recipe,
        outputGood: rgoOutputByRecipe[province.rgo.recipe] ?? 0,
        outputAmount: (province.rgo.employed / 1000) * (data.recipes.find((recipe) => recipe.key === province.rgo.recipe)?.output.amount ?? 0),
        employment: province.rgo.employed,
        profit: province.rgo.employed * 0.0025,
        level: province.rgo.level,
      })),
    ...playerOwnedStates.flatMap((state) => state.factories.map((factory) => {
      const recipe = data.recipes.find((candidate) => candidate.key === factory.recipe);
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
  }));

  return {
    day: world.day,
    date: dayToDate(world.day),
    speed: world.speed,
    playerNation: world.playerNation,
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
    playerProduction,
    playerPopulation,
    playerReformAgitation,
    playerStates,
    playerBudget: zeroBudget(),
  };
}
