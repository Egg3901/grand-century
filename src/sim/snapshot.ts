import type { BudgetLine, GameData, NationSummary, PartyIdeology, PopType, ProvinceSummary, WarGoalType, World, WorldSnapshot } from '../shared/types';
import { BALANCE, tariffBandForTradePolicy } from './balance';
import { dayToDate } from './world';
import { ideologyFromPop, partyByKey, reformDemandForPop, topReformDemandEntries } from './politics';
import {
  evaluateAllianceAcceptance,
  getCbsForNation,
  getCoalitionAgainst,
  getDiplomaticPoints,
  getFabricateCbCost,
  getGreatPowerStandings,
  getInfluencePool,
  getInfluenceTargetsForNation,
  getInfamyLimit,
  getNationPowerBreakdown,
  getNinthPowerScore,
  getPendingCbsForNation,
  getRivalryCap,
  getRivalryDpCost,
  getWarGoalInfamyUse,
} from './systems/diplomacy';
import { getFormableStatusesForNation } from './formables';
import { getPlayerBalanceOfPowerView, listPlayerDecisions } from './systems/events';
import { buildPlayerTechView } from './systems/research';
import {
  buildCrisisShowdownView,
  computeTensionContributions,
  computeTensionDecay,
  getWorldTension,
  listCrisisCandidates,
} from './systems/crisis';
import { buildCultureLedger, buildMovementViews, culturePolicyOf, CULTURE_TUNING } from './systems/culture';
import {
  colonialReachKind,
  computeColonialPointsBreakdown,
  isSupplied,
  listColonialClaimViews,
} from './systems/war';

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
  const navalPow = (() => {
    const power = new Array(world.nations.length).fill(0);
    for (const province of world.provinces) {
      const owner = province.owner;
      if (owner >= 0 && owner < power.length) power[owner] += province.navalBaseLevel * 10;
    }
    return power;
  })();
  const nations: NationSummary[] = world.nations.map((nation) => {
    const popIdCount = ownedPopIdCount[nation.id];
    const avgMilitancy = popIdCount > 0 ? ownedPopMilitancySum[nation.id] / popIdCount : 0;
    const stateCount = ownedStateCount[nation.id];
    const avgUnrest = stateCount > 0 ? ownedStateUnrestSum[nation.id] / stateCount : 0;
    const ruling = partyByKey(nation, nation.rulingParty);
    const power = powerByNation.get(nation.id) ?? { industry: 0, military: 0, score: 0 };
    const cpBreakdown = computeColonialPointsBreakdown(world, nation.id, navalPow);
    const tariffBand = tariffBandForTradePolicy(nation.reforms.trade_policy ?? 0);
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
      tariffMin: tariffBand.min,
      tariffMax: tariffBand.max,
      isBankrupt: nation.isBankrupt,
      bankruptcyMonths: nation.bankruptcyMonths,
      constructionBlocked: nation.constructionBlocked,
      mobilizationCapacity: nation.mobilizationCapacity,
      standingRegimentCapacity: nation.standingRegimentCapacity,
      colonialPoints: cpBreakdown.available,
      colonialPointsBreakdown: cpBreakdown,
    };
  });

  const provinces: ProvinceSummary[] = world.provinces.map((province) => {
    const stats = provincePopStats(world, province.popIds);
    const rgoGood = rgoOutputByRecipe[province.rgo.recipe] ?? 0;
    const rgoOutput = (province.rgo.employed / 1000) * (recipeByKey.get(province.rgo.recipe)?.output.amount ?? 0);
    const ownerNation = world.nations[province.owner];
    let pluralityCulture = -1;
    let pluralitySize = 0;
    let nonAccepted = 0;
    const cultureSizes = new Map<number, number>();
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      cultureSizes.set(pop.culture, (cultureSizes.get(pop.culture) ?? 0) + pop.size);
      if (ownerNation
        && pop.culture !== ownerNation.primaryCulture
        && !(ownerNation.acceptedCultures ?? []).includes(pop.culture)) {
        nonAccepted += pop.size;
      }
    }
    for (const [culture, size] of cultureSizes) {
      if (size > pluralitySize || (size === pluralitySize && culture < pluralityCulture)) {
        pluralitySize = size;
        pluralityCulture = culture;
      }
    }
    const popTotal = stats.population;
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
      pluralityCulture,
      pluralityShare: popTotal > 0 && pluralityCulture >= 0 ? pluralitySize / popTotal : 0,
      nonAcceptedShare: popTotal > 0 ? nonAccepted / popTotal : 0,
      cultureHeartland: false,
    };
  });

  // Mark player-movement heartland provinces for the culture mapmode.
  {
    const heartlandStates = new Set<number>();
    for (const movement of world.movements ?? []) {
      if (movement.nation !== world.playerNation) continue;
      for (const stateId of movement.heartlandStateIds) heartlandStates.add(stateId);
    }
    if (heartlandStates.size > 0) {
      for (const province of provinces) {
        if (heartlandStates.has(province.stateId)) province.cultureHeartland = true;
      }
    }
  }

  const playerOwnedStates = world.states.filter((state) => state.owner === world.playerNation);
  const playerCoreStateIds = world.nations[world.playerNation]?.coreStateIds?.slice().sort((a, b) => a - b) ?? [];
  const playerFormables = getFormableStatusesForNation(world, data, world.playerNation);
  const playerProduction = [
    ...world.provinces
      .filter((province) => province.owner === world.playerNation)
      .map((province) => {
        const capacity = Math.max(0, province.rgo.level) * BALANCE.economy.rgoEmploymentPerLevel;
        return {
          kind: 'rgo' as const,
          locationName: province.name,
          recipe: province.rgo.recipe,
          outputGood: rgoOutputByRecipe[province.rgo.recipe] ?? 0,
          outputAmount: (province.rgo.employed / 1000) * (recipeByKey.get(province.rgo.recipe)?.output.amount ?? 0),
          employment: province.rgo.employed,
          profit: province.rgo.weeklyProfit,
          level: province.rgo.level,
          capacity,
          inputCost: 0,
          wages: 0,
          operating: 0,
          inputFill: 1,
          cashReserve: 0,
          profitableWeeks: 0,
          lossWeeks: 0,
        };
      }),
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
        capacity: factory.lastCapacity || Math.max(1, factory.level) * 2300,
        inputCost: factory.lastInputCost,
        wages: factory.lastWages,
        operating: factory.lastOperating,
        inputFill: factory.lastInputFill,
        cashReserve: factory.cashReserve,
        profitableWeeks: factory.profitableWeeks,
        lossWeeks: factory.lossWeeks,
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
  const colonialClaims = listColonialClaimViews(world, world.playerNation);
  const playerClaimableColonialStates = world.states
    .map((state) => {
      const reach = colonialReachKind(world, world.playerNation, state.id);
      return reach ? { stateId: state.id, reach } : null;
    })
    .filter((entry): entry is { stateId: number; reach: 'adjacent' | 'overseas' } => entry !== null)
    .sort((a, b) => a.stateId - b.stateId);

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
    wars: world.wars.map((war) => ({
      ...war,
      attackers: war.attackers.slice(),
      defenders: war.defenders.slice(),
      goals: war.goals.map((goal) => ({ ...goal })),
      scoreBreakdown: war.scoreBreakdown ? { ...war.scoreBreakdown } : undefined,
    })),
    relations: world.relations.map((relation) => ({ ...relation })),
    greatPowers: getGreatPowerStandings(world).map((entry) => ({ ...entry, sphereMembers: entry.sphereMembers.slice() })),
    playerCbs: getCbsForNation(world, world.playerNation).map((cb) => ({ ...cb })),
    playerPendingCbs: getPendingCbsForNation(world, world.playerNation).map((cb) => ({ ...cb })),
    playerDiplomaticPoints: getDiplomaticPoints(world, world.playerNation),
    fabricateCbCostByGoal: (['annex_state', 'liberate_state', 'humiliate', 'add_to_sphere', 'take_colony', 'cut_down_to_size'] as WarGoalType[])
      .reduce((acc, goal) => {
        acc[goal] = getFabricateCbCost(goal);
        return acc;
      }, {} as Record<WarGoalType, number>),
    warGoalInfamyUse: getWarGoalInfamyUse(),
    playerInfluencePool: getInfluencePool(world, world.playerNation),
    playerInfluenceTargets: getInfluenceTargetsForNation(world, world.playerNation).map((entry) => ({ ...entry })),
    playerAlliancePreviews: world.nations
      .filter((nation) => nation.id !== world.playerNation)
      .map((nation) => {
        const result = evaluateAllianceAcceptance(world, world.playerNation, nation.id);
        return { target: nation.id, score: Number(result.score.toFixed(1)), accepted: result.accepted };
      }),
    infamyLimit: getInfamyLimit(),
    coalitionAgainstPlayer: getCoalitionAgainst(world, world.playerNation),
    ninthPowerScore: getNinthPowerScore(world),
    playerPowerScore: getNationPowerBreakdown(world, world.playerNation).score,
    rivalryDpCost: getRivalryDpCost(),
    rivalryCap: getRivalryCap(),
    playerRivalryCount: world.relations.filter((relation) => (
      relation.kind === 'rivalry'
      && (relation.a === world.playerNation || relation.b === world.playerNation)
    )).length,
    armies: world.armies.map((army) => {
      const embarked = world.fleets.some((fleet) => fleet.embarkedArmy === army.id);
      const supplied = army.rebel || army.regiments.length === 0 || embarked
        ? true
        : (army.supplied ?? isSupplied(world, army.owner, army.location));
      return {
        ...army,
        regiments: army.regiments.map((regiment) => ({ ...regiment })),
        leader: army.leader ? { ...army.leader } : null,
        supplied,
      };
    }),
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
    playerBalanceOfPower: getPlayerBalanceOfPowerView(world, data, world.playerNation),
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
    tensionTrace: (() => {
      const pressure = computeTensionContributions(world);
      const decay = computeTensionDecay(world.tension ?? 15);
      return [
        ...pressure,
        { label: 'Natural decay', value: Number((-decay).toFixed(2)) },
      ];
    })(),
    tensionDecay: computeTensionDecay(world.tension ?? 15),
    tensionNetDelta: (() => {
      const pressure = computeTensionContributions(world).reduce((sum, entry) => sum + entry.value, 0);
      const decay = computeTensionDecay(world.tension ?? 15);
      return Number((pressure - decay).toFixed(2));
    })(),
    crisisCooldownUntil: world.crisisCooldownUntil ?? 0,
    activeCrisis: world.crisis
      ? {
        ...world.crisis,
        attackerBackers: world.crisis.attackerBackers.slice(),
        defenderBackers: world.crisis.defenderBackers.slice(),
        pressedBy: world.crisis.pressedBy.slice(),
      }
      : null,
    crisisShowdown: world.crisis ? buildCrisisShowdownView(world, world.crisis) : null,
    crisisCandidates: world.crisis ? [] : listCrisisCandidates(world, 5),
    congressHistory: (world.congresses ?? []).map((record) => ({ ...record })),
    // 0.8.0 Age of Nationalism
    playerCulturePolicy: playerNation ? culturePolicyOf(playerNation) : 'assimilationist',
    playerCulturePolicyCooldownDays: (() => {
      if (!playerNation) return 0;
      const last = playerNation.culturePolicyChangedDay ?? -1;
      if (last < 0) return 0;
      return Math.max(0, CULTURE_TUNING.policyCooldownDays - (world.day - last));
    })(),
    playerCulturePolicyCost: CULTURE_TUNING.policyPrestigeCost,
    playerCultures: buildCultureLedger(world, data, world.playerNation),
    playerMovements: buildMovementViews(world, data, world.playerNation),
    colonialClaims,
    playerClaimableColonialStates,
    playerBudget: zeroBudget(),
  };
}
