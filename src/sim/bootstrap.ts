import type {
  BudgetLine,
  DiploRelation,
  Factory,
  GameData,
  Nation,
  NationId,
  Pop,
  PopType,
  Province,
  State,
  Terrain,
  World,
} from '../shared/types';
import { Rng } from './rng';
import { WORLD_SEED } from '../data/generated';
import {
  createNationParties,
  defaultRulingParty,
  defaultUpperHouse,
  isElectiveGovernment,
  updateMilitaryDerivedForNation,
} from './politics';
import { primeDiplomacy } from './systems/diplomacy';

const RGO_RECIPES = ['rgo_grain', 'rgo_cattle', 'rgo_timber', 'rgo_coal', 'rgo_iron', 'rgo_cotton'];
const FACTORY_RECIPES = ['factory_fabric', 'factory_steel', 'factory_small_arms', 'factory_cannery'];
const POP_TYPES: PopType[] = ['farmer', 'laborer', 'soldier', 'aristocrat', 'craftsman', 'clergy'];
const GP_ORDER = ['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'OTT', 'ESP'];
const INDUSTRIAL_TAGS = new Set(['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'NLD', 'SWE', 'SAR', 'TSC', 'ESP', 'POR']);
const RGO_GOOD_TO_RECIPE: Record<string, string> = {
  grain: 'rgo_grain',
  cattle: 'rgo_cattle',
  timber: 'rgo_timber',
  coal: 'rgo_coal',
  iron: 'rgo_iron',
  cotton: 'rgo_cotton',
};
const RELIGION_BY_TAG: Record<string, string> = {
  ENG: 'protestant',
  FRA: 'catholic',
  PRU: 'protestant',
  AUS: 'catholic',
  RUS: 'orthodox',
  USA: 'protestant',
  QNG: 'confucian',
  OTT: 'sunni',
  ESP: 'catholic',
  POR: 'catholic',
  NLD: 'protestant',
  SWE: 'protestant',
  SAR: 'catholic',
  TSC: 'catholic',
  JPN: 'confucian',
  BRA: 'catholic',
  ARG: 'catholic',
  PER: 'sunni',
  PEU: 'catholic',
  MEX: 'catholic',
  BEL: 'catholic',
  GRE: 'orthodox',
  DEN: 'protestant',
  SWI: 'catholic',
  EGY: 'sunni',
  AFG: 'sunni',
  SIA: 'confucian',
  KOR: 'confucian',
  MOR: 'sunni',
  ETH: 'orthodox',
  NEP: 'confucian',
  BHU: 'confucian',
  BUR: 'confucian',
  VIE: 'confucian',
  CAM: 'confucian',
  LAO: 'confucian',
  CHL: 'catholic',
  CLM: 'catholic',
  VEN: 'catholic',
  BOL: 'catholic',
  PRG: 'catholic',
  URY: 'catholic',
  COL: 'protestant',
  UNC: 'confucian',
  UNA: 'confucian',
};
const CULTURE_BY_TAG: Record<string, string> = {
  ENG: 'british',
  FRA: 'french',
  PRU: 'north_german',
  AUS: 'south_german',
  RUS: 'russian',
  USA: 'yankee',
  QNG: 'han',
  OTT: 'turkish',
  ESP: 'french',
  POR: 'french',
  NLD: 'north_german',
  SWE: 'north_german',
  SAR: 'south_german',
  TSC: 'south_german',
  JPN: 'han',
  BRA: 'french',
  ARG: 'french',
  PER: 'turkish',
  PEU: 'french',
  MEX: 'yankee',
  BEL: 'french',
  GRE: 'turkish',
  DEN: 'north_german',
  SWI: 'south_german',
  EGY: 'turkish',
  AFG: 'turkish',
  SIA: 'han',
  KOR: 'han',
  MOR: 'turkish',
  ETH: 'turkish',
  NEP: 'han',
  BHU: 'han',
  BUR: 'han',
  VIE: 'han',
  CAM: 'han',
  LAO: 'han',
  CHL: 'french',
  CLM: 'french',
  VEN: 'french',
  BOL: 'french',
  PRG: 'french',
  URY: 'french',
  COL: 'british',
  UNC: 'han',
  UNA: 'han',
};

interface ProvinceSeedRuntime {
  id: number;
  weight: number;
}

function emptyTrace() {
  return [];
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
      taxIncome: emptyTrace(),
      tariffIncome: emptyTrace(),
      productionIncome: emptyTrace(),
      armyUpkeep: emptyTrace(),
      subsidySpend: emptyTrace(),
      constructionSpend: emptyTrace(),
      adminSpend: emptyTrace(),
      reformUpkeep: emptyTrace(),
      net: emptyTrace(),
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cultureIndex(data: GameData, key: string, fallback = 0): number {
  const index = data.cultures.findIndex((culture) => culture.key === key);
  return index >= 0 ? index : fallback;
}

function religionIndex(data: GameData, key: string, fallback = 0): number {
  const index = data.religions.findIndex((religion) => religion.key === key);
  return index >= 0 ? index : fallback;
}

function nationReforms(data: GameData): Record<string, number> {
  return Object.fromEntries(data.reforms.map((reform) => [reform.key, 0]));
}

function capitalId(id: number): number {
  if (id >= 0 && id < WORLD_SEED.provinceCount) return id;
  return 0;
}

function createNations(data: GameData): Nation[] {
  return WORLD_SEED.nations.map((seed, id) => ({
    id,
    tag: seed.tag,
    name: seed.name,
    color: seed.color,
    primaryCulture: cultureIndex(data, seed.primaryCulture || CULTURE_BY_TAG[seed.tag] || 'british'),
    acceptedCultures: [cultureIndex(data, seed.primaryCulture || CULTURE_BY_TAG[seed.tag] || 'british')],
    government: seed.government,
    rulingParty: defaultRulingParty(seed.government),
    parties: createNationParties(),
    upperHouse: defaultUpperHouse(seed.government),
    electionIntervalYears: seed.government === 'constitutional_monarchy' ? 5 : 4,
    lastElectionYear: 1832,
    nextElectionYear: isElectiveGovernment(seed.government) ? 1836 + (id % 4) : Number.MAX_SAFE_INTEGER,
    electionLastResult: 'No election held yet.',
    capital: capitalId(seed.capitalProvinceId),
    treasury: 2600 + (GP_ORDER.length - Math.min(GP_ORDER.length, GP_ORDER.indexOf(seed.tag) + 1 || GP_ORDER.length)) * 380,
    prestige: GP_ORDER.includes(seed.tag) ? 25 + Math.max(0, 8 - GP_ORDER.indexOf(seed.tag)) * 5 : 6,
    infamy: 0,
    literacy: seed.government === 'uncivilized' ? 0.12 : GP_ORDER.includes(seed.tag) ? 0.45 : 0.26,
    nationalConsciousness: 1.2,
    researchPoints: 0,
    reforms: nationReforms(data),
    techs: seed.government === 'uncivilized' ? [] : ['market_structure'],
    taxRatePoor: 0.45,
    taxRateMiddle: 0.35,
    taxRateRich: 0.25,
    tariffRate: 0.1,
    gpRank: GP_ORDER.includes(seed.tag) ? GP_ORDER.indexOf(seed.tag) + 1 : 0,
    spheredBy: -1 as NationId,
    sphereMembers: [],
    colonialPoints: 0,
    isCivilized: seed.government !== 'uncivilized',
    isPlayer: seed.tag === 'ENG',
    isBankrupt: false,
    bankruptcyMonths: 0,
    constructionBlocked: false,
    monthlyTariffIncome: 0,
    monthlyProductionIncome: 0,
    lastBudget: zeroBudget(),
    regimentsPerSoldierPop: 0.8,
    standingRegimentCapacity: 0,
    mobilizationCapacity: 0,
    armyOrganization: 0.84,
    armyMorale: 0.9,
  }));
}

function createStates(tagToNationId: Record<string, number>): State[] {
  return WORLD_SEED.states.map((stateSeed) => ({
    id: stateSeed.id,
    name: stateSeed.name,
    owner: tagToNationId[stateSeed.ownerTag] ?? 0,
    provinceIds: stateSeed.provinceIds.slice(),
    factories: [],
    unrestRisk: 0,
    lastRebellionDay: -3650,
  }));
}

function createProvinces(rng: Rng, tagToNationId: Record<string, number>): { provinces: Province[]; runtime: ProvinceSeedRuntime[] } {
  const provinces: Province[] = [];
  const runtime: ProvinceSeedRuntime[] = [];
  const validIds = new Set(WORLD_SEED.provinces.map((province) => province.id));

  for (const seed of WORLD_SEED.provinces) {
    const owner = tagToNationId[seed.ownerTag] ?? 0;
    const terrain = seed.terrain as Terrain;
    const recipe = RGO_GOOD_TO_RECIPE[seed.rgoGood] ?? RGO_RECIPES[seed.id % RGO_RECIPES.length];
    const level = clamp(1 + Math.round(seed.populationWeight * 1.6), 1, 5);
    const employed = Math.max(800, Math.floor((1200 + rng.next() * 2400) * seed.populationWeight));
    provinces.push({
      id: seed.id,
      name: seed.name,
      owner,
      controller: owner,
      stateId: seed.stateId,
      terrain,
      rgo: {
        recipe,
        level,
        employed,
      },
      fortLevel: terrain === 'mountains' || terrain === 'hills' ? 1 : 0,
      navalBaseLevel: seed.coastal && (seed.ownerTag === 'ENG' || seed.ownerTag === 'USA' || seed.ownerTag === 'NLD') ? 1 : 0,
      coastal: seed.coastal,
      neighbors: seed.neighbors.filter((neighbor) => validIds.has(neighbor)),
      popIds: [],
      occupationProgress: 0,
      colonial: seed.ownerTag === 'COL' || seed.ownerTag === 'UNC' || seed.ownerTag === 'UNA',
    });
    runtime.push({
      id: seed.id,
      weight: Math.max(0.2, seed.populationWeight),
    });
  }
  return { provinces, runtime };
}

function addFactorySeeds(states: State[], rng: Rng): void {
  states.forEach((state, index) => {
    const ownerTag = WORLD_SEED.nations[state.owner]?.tag ?? '';
    if (!INDUSTRIAL_TAGS.has(ownerTag)) return;
    if (state.provinceIds.length === 0 || rng.next() < 0.34) return;
    const primaryRecipe = FACTORY_RECIPES[index % FACTORY_RECIPES.length];
    const factory: Factory = {
      recipe: primaryRecipe,
      level: 1 + (index % 2),
      employed: 3000 + Math.floor(rng.next() * 7000),
      stockpileIn: 0,
      profitTrend: 0,
      weeklyProfit: 0,
      cashReserve: 20,
      workerShare: 0,
      clerkShare: 0,
      lastOutput: 0,
      profitableWeeks: 0,
      lossWeeks: 0,
    };
    state.factories.push(factory);
    if (index % 3 === 0 && rng.next() > 0.38) {
      state.factories.push({
        recipe: FACTORY_RECIPES[(index + 1) % FACTORY_RECIPES.length],
        level: 1,
        employed: 1200 + Math.floor(rng.next() * 3000),
        stockpileIn: 0,
        profitTrend: 0,
        weeklyProfit: 0,
        cashReserve: 10,
        workerShare: 0,
        clerkShare: 0,
        lastOutput: 0,
        profitableWeeks: 0,
        lossWeeks: 0,
      });
    }
  });
}

function createPops(worldProvinces: Province[], provinceRuntime: ProvinceSeedRuntime[], nations: Nation[], data: GameData, rng: Rng): Pop[] {
  const pops: Pop[] = [];
  const religionByNation = nations.map((nation) => religionIndex(data, RELIGION_BY_TAG[nation.tag] || 'protestant'));
  const runtimeByProvince = new Map(provinceRuntime.map((item) => [item.id, item]));
  for (const province of worldProvinces) {
    const nation = nations[province.owner];
    const runtime = runtimeByProvince.get(province.id);
    const weight = runtime?.weight ?? 1;
    const culture = nation.primaryCulture;
    const religion = religionByNation[province.owner] ?? 0;
    const density = Math.max(0.3, weight * (province.terrain === 'desert' ? 0.62 : 1));
    const basePopulation = Math.max(2200, Math.floor((7000 + rng.next() * 16000) * density));
    const sizeShareByType: Record<PopType, number> = {
      farmer: 0.42,
      laborer: 0.27,
      soldier: 0.08,
      aristocrat: 0.03,
      craftsman: nation.isCivilized ? 0.14 : 0.06,
      clergy: 0.06,
      capitalist: 0,
      clerk: 0,
      officer: 0,
      slave: 0,
    };
    for (let i = 0; i < POP_TYPES.length; i++) {
      const type = POP_TYPES[i];
      const share = sizeShareByType[type] ?? 0.05;
      const size = Math.max(80, Math.floor(basePopulation * share * (0.9 + rng.next() * 0.25)));
      const pop: Pop = {
        id: pops.length,
        type,
        provinceId: province.id,
        size,
        culture,
        religion,
        money: 8 + rng.next() * 25,
        militancy: 0.8 + rng.next() * 1.4,
        consciousness: 0.6 + rng.next() * 1.6,
        needsMet: 0.55 + rng.next() * 0.35,
        lastGrowth: 0,
        ideology: Math.floor(rng.next() * 4),
      };
      province.popIds.push(pop.id);
      pops.push(pop);
    }
  }
  return pops;
}

function createRelations(): DiploRelation[] {
  const relations: DiploRelation[] = [];
  const alliancePairs = new Set<string>([
    'ENG:POR',
    'AUS:RUS',
  ]);
  const rivalryPairs = new Set<string>([
    'ENG:FRA',
    'PRU:AUS',
    'RUS:OTT',
    'USA:ENG',
  ]);
  for (let a = 0; a < WORLD_SEED.nations.length; a++) {
    for (let b = a + 1; b < WORLD_SEED.nations.length; b++) {
      const tagA = WORLD_SEED.nations[a]?.tag ?? '';
      const tagB = WORLD_SEED.nations[b]?.tag ?? '';
      const key = `${tagA}:${tagB}`;
      const reverse = `${tagB}:${tagA}`;
      const kind = alliancePairs.has(key) || alliancePairs.has(reverse)
        ? 'alliance'
        : rivalryPairs.has(key) || rivalryPairs.has(reverse)
          ? 'rivalry'
          : 'neutral';
      relations.push({
        a,
        b,
        kind,
        opinion: kind === 'alliance' ? 90 : kind === 'rivalry' ? -55 : 0,
        expiresDay: kind === 'alliance' ? 365 * 12 : -1,
      });
    }
  }
  return relations;
}

export function createWorld(data: GameData, seed: number): World {
  const rng = new Rng(seed >>> 0);
  const nations = createNations(data);
  const tagToNationId = Object.fromEntries(nations.map((nation) => [nation.tag, nation.id])) as Record<string, number>;
  const states = createStates(tagToNationId);
  const { provinces, runtime } = createProvinces(rng, tagToNationId);
  addFactorySeeds(states, rng);
  const pops = createPops(provinces, runtime, nations, data, rng);

  const world: World = {
    day: 0,
    seed: seed >>> 0,
    rngState: rng.state,
    speed: 1,
    playerNation: tagToNationId.ENG ?? 0,
    nations,
    provinces,
    states,
    pops,
    market: data.goods.map((good) => ({
      good: good.id,
      price: good.basePrice,
      supply: 80,
      demand: 80,
      sold: 80,
      worldStockpile: 180,
      trend: Array.from({ length: 8 }, () => good.basePrice),
      priceTrace: {
        basePrice: good.basePrice,
        ratio: 1,
        damping: 0.12,
        requestedDemand: 80,
        effectiveSupply: 80,
        stockpileStart: 180,
        stockpileEnd: 180,
      },
    })),
    marketRuntime: data.goods.map((good) => ({
      good: good.id,
      stockpileStart: 0,
      remainingProducer: 0,
      remainingStockpile: 0,
      producerSupply: 0,
      requestedDemand: 0,
      consumerBought: 0,
      stockpileBuy: 0,
      stockpileSell: 0,
    })),
    marketInvariants: data.goods.map((good) => ({
      good: good.id,
      supply: 0,
      sold: 0,
      stockpileStart: 0,
      stockpileEnd: 0,
      residual: 0,
      ok: true,
    })),
    armies: [],
    fleets: [],
    wars: [],
    relations: createRelations(),
    nextArmyId: 1,
    nextFleetId: 1,
    nextWarId: 1,
    nextPopId: pops.length,
  };
  for (const nation of world.nations) updateMilitaryDerivedForNation(world, nation.id);
  primeDiplomacy(world, data);
  return world;
}
