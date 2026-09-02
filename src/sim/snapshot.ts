import type { BudgetLine, GameData, NationId, NationSummary, PartyIdeology, PopType, ProductionLedgerEntry, ProvinceSummary, WarGoalType, World, WorldSnapshot } from '../shared/types';
import type { PlayerView, SharedSnapshot } from '../net/snapshotCodec';
import { BALANCE, tariffBandForTradePolicy } from './balance';
import { dateAtDay } from './calendar';
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
import { buildChoiceViews, getEventDef, getPlayerBalanceOfPowerView, listPlayerDecisions } from './systems/events';
import { buildPlayerTechView, techModifiersFor } from './systems/research';
import {
  buildCrisisShowdownView,
  computeTensionContributions,
  computeTensionDecay,
  getWorldTension,
  listCrisisCandidates,
} from './systems/crisis';
import { buildMovementViews, culturePolicyOf, CULTURE_TUNING, getCultureLedger } from './systems/culture';
import { availableRegimentTypes, availableShipTypes } from './militaryCatalog';
import {
  colonialReachKind,
  computeColonialPointsBreakdown,
  isSupplied,
  listColonialClaimViews,
} from './systems/war';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Factory-density urbanization proxy used by the pop consciousness formula. */
function provinceUrbanization(world: World, provinceId: number): number {
  const province = world.provinces[provinceId];
  if (!province) return 0;
  const state = world.states[province.stateId];
  if (!state) return 0;
  const factoryLevel = state.factories.reduce((sum, factory) => sum + factory.level, 0);
  return clamp01(factoryLevel / Math.max(1, state.provinceIds.length * 10));
}
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

let recipeIndexCache: {
  data: GameData;
  indexes: {
    rgoOutputByRecipe: Record<string, number>;
    recipeByKey: Map<string, GameData['recipes'][number]>;
  };
} | null = null;

function recipeIndexes(data: GameData): {
  rgoOutputByRecipe: Record<string, number>;
  recipeByKey: Map<string, GameData['recipes'][number]>;
} {
  // GameData is a module singleton in practice; reuse the index across shared +
  // player builds in the same tick (and across ticks) instead of reallocating.
  if (recipeIndexCache?.data === data) return recipeIndexCache.indexes;
  const rgoOutputByRecipe = Object.fromEntries(
    data.recipes
      .filter((recipe) => recipe.building === 'rgo')
      .map((recipe) => [recipe.key, recipe.output.good]),
  ) as Record<string, number>;
  const recipeByKey = new Map(data.recipes.map((recipe) => [recipe.key, recipe]));
  const indexes = { rgoOutputByRecipe, recipeByKey };
  recipeIndexCache = { data, indexes };
  return indexes;
}

/** Mark player-movement heartland provinces for the culture mapmode (mutates in place). */
function markCultureHeartland(
  provinces: ProvinceSummary[],
  world: World,
  nationId: NationId,
): void {
  const heartlandStates = new Set<number>();
  for (const movement of world.movements ?? []) {
    if (movement.nation !== nationId) continue;
    for (const stateId of movement.heartlandStateIds) heartlandStates.add(stateId);
  }
  if (heartlandStates.size === 0) return;
  for (const province of provinces) {
    if (heartlandStates.has(province.stateId)) province.cultureHeartland = true;
  }
}

/**
 * Shared (non-per-client) snapshot fields — built once per MP broadcast.
 * Matches `SharedSnapshot` in snapshotCodec (wire extractShared boundary).
 *
 * Note: `cultureHeartland` stays false here. Single-player `buildSnapshot`
 * applies it from `world.playerNation` after compose so SP output stays
 * bit-identical to the former single-pass builder.
 */
export function buildSharedSnapshot(world: World, data: GameData): SharedSnapshot {
  const { rgoOutputByRecipe, recipeByKey } = recipeIndexes(data);

  // One province walk builds ProvinceSummary rows AND buckets per-owner
  // province counts, owned-pop militancy, and naval power. Replaces the old
  // separate owned-aggregate pass + navalPow pass + provinces.map (three full
  // world.provinces scans). Same province order ⇒ bit-identical aggregates.
  const nationCount = world.nations.length;
  const ownedProvinceCount = new Array<number>(nationCount).fill(0);
  const ownedPopIdCount = new Array<number>(nationCount).fill(0);
  const ownedPopMilitancySum = new Array<number>(nationCount).fill(0);
  const ownedStateCount = new Array<number>(nationCount).fill(0);
  const ownedStateUnrestSum = new Array<number>(nationCount).fill(0);
  const navalPow = new Array<number>(nationCount).fill(0);

  for (const state of world.states) {
    const owner = state.owner;
    if (owner < 0 || owner >= nationCount) continue;
    ownedStateCount[owner]++;
    ownedStateUnrestSum[owner] += state.unrestRisk;
  }

  const provinces: ProvinceSummary[] = new Array(world.provinces.length);
  for (let i = 0; i < world.provinces.length; i++) {
    const province = world.provinces[i];
    const owner = province.owner;
    if (owner >= 0 && owner < nationCount) {
      ownedProvinceCount[owner]++;
      navalPow[owner] += province.navalBaseLevel * 10;
      for (const popId of province.popIds) {
        ownedPopIdCount[owner]++;
        ownedPopMilitancySum[owner] += world.pops[popId]?.militancy ?? 0;
      }
    }

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
    provinces[i] = {
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
  }

  const powerByNation = new Map(world.nations.map((nation) => [nation.id, getNationPowerBreakdown(world, nation.id)]));
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
      polityStatus: nation.polityStatus ?? 'sovereign',
      overlordNation: nation.overlordNation ?? -1,
      eraSummary: nation.eraSummary,
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
      availableRegimentTypes: availableRegimentTypes(nation),
      availableShipTypes: availableShipTypes(nation),
      colonialPoints: cpBreakdown.available,
      colonialPointsBreakdown: cpBreakdown,
    };
  });

  return {
    day: world.day,
    date: dateAtDay(world.day, world.startDate ?? data.startDate),
    scenarioId: world.scenarioId ?? data.scenarioId,
    startDate: world.startDate ?? data.startDate,
    speed: world.speed,
    seed: world.seed,
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
    infamyLimit: getInfamyLimit(),
    ninthPowerScore: getNinthPowerScore(world),
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
  };
}

/**
 * Per-nation HUD/panel fields — cheap enough to build once per connected client.
 * Takes `nationId` explicitly so MP never mutates `world.playerNation`.
 * Matches `PlayerView` in snapshotCodec (wire extractPlayerView boundary).
 *
 * `playerBudget` is zero here (same as the former single-pass `buildSnapshot`);
 * `snapshot()` / the MP emit path fill the real budget via `computePlayerBudget`.
 */
export function buildPlayerView(world: World, data: GameData, nationId: NationId): PlayerView {
  const { rgoOutputByRecipe, recipeByKey } = recipeIndexes(data);

  const playerOwnedStates = world.states.filter((state) => state.owner === nationId);
  const playerCoreStateIds = world.nations[nationId]?.coreStateIds?.slice().sort((a, b) => a - b) ?? [];
  const playerFormables = getFormableStatusesForNation(world, data, nationId);

  // One walk over player-owned provinces builds RGO production rows and the
  // population ledger (was two separate world.provinces filters/loops).
  const playerRgoProduction: ProductionLedgerEntry[] = [];
  const playerPopulationMap = new Map<string, {
    size: number;
    needs: number;
    mil: number;
    con: number;
    growth: number;
    life: number;
    everyday: number;
    luxury: number;
    urban: number;
    scarce: Map<number, { fillSum: number; weight: number }>;
    ideology: Record<string, number>;
    agitating: Map<string, number>;
  }>();
  const playerNation = world.nations[nationId];
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    const capacity = Math.max(0, province.rgo.level) * BALANCE.economy.rgoEmploymentPerLevel;
    playerRgoProduction.push({
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
    });
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
        life: 0,
        everyday: 0,
        luxury: 0,
        urban: 0,
        scarce: new Map(),
        ideology: {} as Record<string, number>,
        agitating: new Map<string, number>(),
      };
      bucket.size += pop.size;
      bucket.needs += pop.needsMet * pop.size;
      bucket.mil += pop.militancy * pop.size;
      bucket.con += pop.consciousness * pop.size;
      bucket.growth += pop.lastGrowth;
      bucket.life += (pop.lifeNeedsFrac ?? pop.needsMet) * pop.size;
      bucket.everyday += (pop.everydayNeedsFrac ?? pop.needsMet) * pop.size;
      bucket.luxury += (pop.luxuryNeedsFrac ?? 1) * pop.size;
      bucket.urban += provinceUrbanization(world, pop.provinceId) * pop.size;
      for (const scarce of pop.scarceGoods ?? []) {
        const prior = bucket.scarce.get(scarce.good) ?? { fillSum: 0, weight: 0 };
        prior.fillSum += scarce.fill * pop.size;
        prior.weight += pop.size;
        bucket.scarce.set(scarce.good, prior);
      }
      const ideology = ideologyFromPop(pop);
      bucket.ideology[ideology] = (bucket.ideology[ideology] ?? 0) + pop.size;
      if (playerNation) {
        const demanded = reformDemandForPop(pop, playerNation, data);
        if (demanded) bucket.agitating.set(demanded, (bucket.agitating.get(demanded) ?? 0) + pop.size);
      }
      playerPopulationMap.set(key, bucket);
    }
  }
  const playerProduction = [
    ...playerRgoProduction,
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
  const literacy = playerNation?.literacy ?? 0;
  const healthcareLevel = playerNation?.reforms.healthcare ?? 0;
  const techPopGrowth = playerNation
    ? Math.max(0, techModifiersFor(playerNation, data).popGrowth ?? 0)
    : 0;
  const playerPopulation = Array.from(playerPopulationMap.entries())
    .map(([type, bucket]) => {
      const dominantIdeology = (Object.entries(bucket.ideology).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'conservative') as PartyIdeology;
      const scarceGoods = Array.from(bucket.scarce.entries())
        .map(([goodId, entry]) => {
          const def = data.goods[goodId];
          return {
            key: def?.key ?? `good_${goodId}`,
            name: def?.name ?? `Good ${goodId}`,
            fill: entry.weight > 0 ? entry.fillSum / entry.weight : 1,
          };
        })
        .sort((a, b) => a.fill - b.fill)
        .slice(0, 4);
      const avgNeedsMet = bucket.size > 0 ? bucket.needs / bucket.size : 0;
      const avgLuxuryNeeds = bucket.size > 0 ? bucket.luxury / bucket.size : 0;
      const avgUrban = bucket.size > 0 ? bucket.urban / bucket.size : 0;
      const needsScaledGrowthCap = 0.00014 + avgNeedsMet * 0.000035;
      const growthCap = Math.min(BALANCE.population.maxGrowthRate, needsScaledGrowthCap);
      return {
        type: type as PopType,
        size: bucket.size,
        avgNeedsMet,
        avgMilitancy: bucket.size > 0 ? bucket.mil / bucket.size : 0,
        avgConsciousness: bucket.size > 0 ? bucket.con / bucket.size : 0,
        dominantIdeology,
        agitatingFor: Array.from(bucket.agitating.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([reform]) => reform),
        growth: bucket.growth,
        avgLifeNeeds: bucket.size > 0 ? bucket.life / bucket.size : 0,
        avgEverydayNeeds: bucket.size > 0 ? bucket.everyday / bucket.size : 0,
        avgLuxuryNeeds,
        scarceGoods,
        growthDrivers: [
          { label: 'Needs contribution', value: avgNeedsMet * 0.0013 },
          { label: 'Healthcare reform', value: healthcareLevel * 0.00012 },
          { label: 'Medicine tech', value: techPopGrowth },
          { label: 'Base rate', value: -0.0009 },
          { label: 'Growth cap', value: growthCap },
          { label: 'Monthly delta', value: bucket.growth },
        ],
        consciousnessDrivers: [
          { label: 'Literacy (monthly)', value: literacy * BALANCE.population.monthlyConsciousnessLiteracy },
          { label: 'Urban (monthly)', value: avgUrban * BALANCE.population.monthlyConsciousnessUrban },
          { label: 'Needs penalty', value: -(1 - avgNeedsMet) * BALANCE.population.monthlyConsciousnessNeedPenalty },
          { label: 'Literacy (weekly)', value: literacy * 0.03 },
          { label: 'Urban (weekly)', value: avgUrban * 0.02 },
          { label: 'Luxury (weekly)', value: avgLuxuryNeeds * 0.01 },
          { label: 'Unmet (weekly)', value: -(1 - avgNeedsMet) * 0.01 },
        ],
      };
    })
    .sort((a, b) => b.size - a.size);
  const playerReformAgitation = topReformDemandEntries(world, data, nationId, 5);
  const playerStates = playerOwnedStates.map((state) => ({
    id: state.id,
    name: state.name,
    factoryCount: state.factories.length,
    coastal: state.provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal ?? false),
  }));

  return {
    playerNation: nationId,
    playerCbs: getCbsForNation(world, nationId).map((cb) => ({ ...cb })),
    playerPendingCbs: getPendingCbsForNation(world, nationId).map((cb) => ({ ...cb })),
    playerDiplomaticPoints: getDiplomaticPoints(world, nationId),
    fabricateCbCostByGoal: (['annex_state', 'liberate_state', 'humiliate', 'add_to_sphere', 'take_colony', 'cut_down_to_size'] as WarGoalType[])
      .reduce((acc, goal) => {
        acc[goal] = getFabricateCbCost(goal);
        return acc;
      }, {} as Record<WarGoalType, number>),
    warGoalInfamyUse: getWarGoalInfamyUse(),
    playerInfluencePool: getInfluencePool(world, nationId),
    playerInfluenceTargets: getInfluenceTargetsForNation(world, nationId).map((entry) => ({ ...entry })),
    playerAlliancePreviews: world.nations
      .filter((nation) => nation.id !== nationId)
      .map((nation) => {
        const result = evaluateAllianceAcceptance(world, nationId, nation.id);
        return { target: nation.id, score: Number(result.score.toFixed(1)), accepted: result.accepted };
      }),
    coalitionAgainstPlayer: getCoalitionAgainst(world, nationId),
    playerPowerScore: getNationPowerBreakdown(world, nationId).score,
    rivalryDpCost: getRivalryDpCost(),
    rivalryCap: getRivalryCap(),
    playerRivalryCount: world.relations.filter((relation) => (
      relation.kind === 'rivalry'
      && (relation.a === nationId || relation.b === nationId)
    )).length,
    playerProduction,
    playerPopulation,
    playerPopMobility: world.popMobilityLedger
      ? {
        day: world.popMobilityLedger.day,
        migrated: world.popMobilityLedger.migrated,
        migrations: world.popMobilityLedger.migrations.map((entry) => ({ ...entry })),
        conversions: world.popMobilityLedger.conversions.map((entry) => ({ ...entry })),
      }
      : { day: world.day, migrated: 0, migrations: [], conversions: [] },
    playerReformAgitation,
    playerStates,
    playerCoreStateIds,
    playerFormables,
    pendingPlayerEvents: (world.pendingEvents ?? [])
      .filter((event) => event.nationId === nationId)
      .map((event) => {
        const def = getEventDef(event.eventKey);
        const nation = world.nations[event.nationId];
        // Re-evaluate gates at snapshot time — treasury/reforms can change under a modal.
        const choices = def && nation
          ? buildChoiceViews(world, data, nation, def.choices)
          : event.choices.map((choice) => ({
            ...choice,
            effectsSummary: choice.effectsSummary.slice(),
          }));
        return {
          ...event,
          choices,
        };
      }),
    playerDecisions: listPlayerDecisions(world, data, nationId),
    playerTech: buildPlayerTechView(world, data, nationId),
    playerBudget: zeroBudget(),
    playerStockpile: { ...(world.nations[nationId]?.stockpile ?? {}) },
    playerStockpileOrders: { ...(world.nations[nationId]?.stockpileOrders ?? {}) },
  };
}

/**
 * Full WorldSnapshot for single-player / tests.
 * Composes shared + player view, then attaches fields that exist on
 * WorldSnapshot but are outside the MP wire SharedSnapshot/PlayerView split
 * (mapMode, crisis, culture ledgers, colonial claims, chronicle, …).
 */
export function buildSnapshot(world: World, data: GameData): WorldSnapshot {
  const shared = buildSharedSnapshot(world, data);
  const view = buildPlayerView(world, data, world.playerNation);
  // Former single-pass marked heartland from world.playerNation onto provinces.
  markCultureHeartland(shared.provinces, world, world.playerNation);

  const playerNation = world.nations[world.playerNation];
  const colonialClaims = listColonialClaimViews(world, world.playerNation);
  const playerClaimableColonialStates = world.states
    .map((state) => {
      const reach = colonialReachKind(world, world.playerNation, state.id);
      return reach ? { stateId: state.id, reach } : null;
    })
    .filter((entry): entry is { stateId: number; reach: 'adjacent' | 'overseas' } => entry !== null)
    .sort((a, b) => a.stateId - b.stateId);

  return {
    ...shared,
    ...view,
    mapMode: world.mapMode,
    playerBalanceOfPower: getPlayerBalanceOfPowerView(world, data, world.playerNation),
    chronicle: world.chronicle ?? [],
    chronicleWarsFought: (world.chronicleWarIds ?? []).length,
    campaignOver: (() => {
      if (world.day >= 100 * 365) return 'century' as const;
      // numProvinces already bucketed in the shared province pass — no extra scan.
      const alive = (shared.nations[world.playerNation]?.numProvinces ?? 0) > 0;
      return alive ? null : ('eliminated' as const);
    })(),
    recentBattles: (world.recentBattles ?? [])
      .filter((battle) => battle.attackerNation === world.playerNation || battle.defenderNation === world.playerNation)
      .slice(-8),
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
    playerCultures: getCultureLedger(world, data, world.playerNation),
    playerMovements: buildMovementViews(world, data, world.playerNation),
    colonialClaims,
    playerClaimableColonialStates,
  };
}
