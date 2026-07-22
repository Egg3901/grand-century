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
  CampaignMapMode,
} from '../shared/types';
import { Rng } from './rng';
import { WORLD_SEED, type WorldSeedData } from '../data/generated';
import { DEFAULT_CAMPAIGN_MAP_MODE } from '../shared/campaignMap';
import { resolveWorldSeed } from './proceduralWorld';
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
  JPN: 'buddhist',
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
  SIA: 'buddhist',
  KOR: 'confucian',
  MOR: 'sunni',
  ETH: 'orthodox',
  NEP: 'hindu',
  BHU: 'buddhist',
  BUR: 'buddhist',
  VIE: 'buddhist',
  CAM: 'buddhist',
  LAO: 'buddhist',
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

/**
 * 0.8.0 — historical primary-culture fixes now that the culture table is no
 * longer 8 entries wide. Takes precedence over the (coarse) generated seed.
 * Original 8-culture assignments that were already right are not repeated here.
 */
const PRIMARY_CULTURE_OVERRIDE: Record<string, string> = {
  ESP: 'iberian',
  POR: 'iberian',
  SAR: 'italian',
  TSC: 'italian',
  TUS: 'italian',
  PAP: 'italian',
  MOD: 'italian',
  PAR: 'italian',
  DEN: 'scandinavian',
  SWE: 'scandinavian',
  PER: 'persian',
  EGY: 'arabic',
  MOR: 'arabic',
  ETH: 'african',
  AFG: 'central_asian',
  JPN: 'japanese',
  KOR: 'korean',
  VIE: 'indochinese',
  SIA: 'indochinese',
  CAM: 'indochinese',
  LAO: 'indochinese',
  BUR: 'indochinese',
  NEP: 'south_asian',
  BHU: 'south_asian',
  MEX: 'latin_american',
  BRA: 'latin_american',
  ARG: 'latin_american',
  CHL: 'latin_american',
  CLM: 'latin_american',
  VEN: 'latin_american',
  BOL: 'latin_american',
  PRG: 'latin_american',
  URY: 'latin_american',
  PEU: 'latin_american',
};

/** One seeded minority share; remainder of the province stays owner-primary. */
interface MinorityRule {
  culture: string;
  share: number;
  /** Religion key override (else the culture's typical religion is used). */
  religion?: string;
}

/**
 * 0.8.0 — the cultural fault lines of 1820, keyed by generated province name
 * (names are unique in the baked seed). These are the *named* historical
 * minority regions; broad colonial sweeps are handled by geography below.
 */
const MINORITY_RULES: Record<string, MinorityRule[]> = {
  // --- British Isles ---
  Ireland: [{ culture: 'irish', share: 0.85 }],
  'Ireland (United Kingdom)': [{ culture: 'irish', share: 0.6 }],
  // --- British North America / Africa ---
  Quebec: [{ culture: 'french', share: 0.76 }],
  'New Brunswick': [{ culture: 'french', share: 0.32 }],
  'Eastern Cape': [{ culture: 'african', share: 0.78, religion: 'protestant' }],
  'Free State': [{ culture: 'african', share: 0.7, religion: 'protestant' }],
  Gauteng: [{ culture: 'african', share: 0.74, religion: 'protestant' }],
  'KwaZulu-Natal': [{ culture: 'african', share: 0.82, religion: 'protestant' }],
  Limpopo: [{ culture: 'african', share: 0.86, religion: 'protestant' }],
  Mpumalanga: [{ culture: 'african', share: 0.82, religion: 'protestant' }],
  'North West': [{ culture: 'african', share: 0.8, religion: 'protestant' }],
  'Northern Cape': [{ culture: 'african', share: 0.72, religion: 'protestant' }],
  'Western Cape': [{ culture: 'african', share: 0.62, religion: 'protestant' }],
  // --- Low Countries ---
  Belgium: [{ culture: 'french', share: 0.55 }],
  // --- Habsburg lands ---
  Hungary: [{ culture: 'hungarian', share: 0.86 }],
  Czechia: [{ culture: 'czech', share: 0.72 }],
  Slovakia: [{ culture: 'czech', share: 0.5 }, { culture: 'hungarian', share: 0.3 }],
  Croatia: [{ culture: 'south_slavic', share: 0.84, religion: 'catholic' }],
  Slovenia: [{ culture: 'south_slavic', share: 0.72, religion: 'catholic' }],
  'Lombardy-Venetia': [{ culture: 'italian', share: 0.88 }],
  // --- Prussia (Posen) ---
  Prussia: [{ culture: 'polish', share: 0.14 }],
  // --- Russian Empire ---
  'Greater Poland': [{ culture: 'polish', share: 0.88 }],
  'Lesser Poland': [{ culture: 'polish', share: 0.88 }],
  Mazovia: [{ culture: 'polish', share: 0.88 }],
  Pomerania: [{ culture: 'polish', share: 0.7 }, { culture: 'north_german', share: 0.18 }],
  Lithuania: [{ culture: 'baltic', share: 0.82, religion: 'catholic' }],
  Latvia: [{ culture: 'baltic', share: 0.8 }],
  Estonia: [{ culture: 'baltic', share: 0.8 }],
  Lapland: [{ culture: 'finnish', share: 0.88 }],
  Ostrobothnia: [{ culture: 'finnish', share: 0.88 }],
  'Southern Finland': [{ culture: 'finnish', share: 0.86 }],
  Belarus: [{ culture: 'ukrainian', share: 0.72 }],
  Kyiv: [{ culture: 'ukrainian', share: 0.84 }],
  Kharkiv: [{ culture: 'ukrainian', share: 0.78 }],
  Lviv: [{ culture: 'ukrainian', share: 0.7 }, { culture: 'polish', share: 0.16 }],
  Odessa: [{ culture: 'ukrainian', share: 0.7 }],
  Kaliningrad: [{ culture: 'north_german', share: 0.65 }],
  'Central Kazakhstan': [{ culture: 'central_asian', share: 0.9 }],
  'Eastern Kazakhstan': [{ culture: 'central_asian', share: 0.9 }],
  'Northern Kazakhstan': [{ culture: 'central_asian', share: 0.85 }],
  'Southern Kazakhstan': [{ culture: 'central_asian', share: 0.9 }],
  'Western Kazakhstan': [{ culture: 'central_asian', share: 0.9 }],
  Armenia: [{ culture: 'caucasian', share: 0.88 }],
  Azerbaijan: [{ culture: 'turkish', share: 0.6, religion: 'sunni' }, { culture: 'caucasian', share: 0.25 }],
  Georgia: [{ culture: 'caucasian', share: 0.88 }],
  'Chechen Republic': [{ culture: 'caucasian', share: 0.85, religion: 'sunni' }],
  'Republic of Dagestan': [{ culture: 'caucasian', share: 0.85, religion: 'sunni' }],
  'Republic of Ingushetia': [{ culture: 'caucasian', share: 0.85, religion: 'sunni' }],
  'Kabardino-Balkaria': [{ culture: 'caucasian', share: 0.8, religion: 'sunni' }],
  'Republic of North Ossetia-Alania': [{ culture: 'caucasian', share: 0.8 }],
  'Republic of Adygea': [{ culture: 'caucasian', share: 0.75, religion: 'sunni' }],
  'Karachay-Cherkess Republic': [{ culture: 'caucasian', share: 0.75, religion: 'sunni' }],
  'Autonomous Republic of Crimea': [{ culture: 'turkish', share: 0.4 }, { culture: 'ukrainian', share: 0.2 }],
  Sevastopol: [{ culture: 'turkish', share: 0.3 }, { culture: 'ukrainian', share: 0.25 }],
  'Republic of Tatarstan': [{ culture: 'central_asian', share: 0.55 }],
  Bashkortostan: [{ culture: 'central_asian', share: 0.55 }],
  // --- Ottoman Empire ---
  Greece: [{ culture: 'greek', share: 0.9 }],
  Bulgaria: [{ culture: 'south_slavic', share: 0.78 }],
  'Republic of Serbia': [{ culture: 'south_slavic', share: 0.88 }],
  Romania: [{ culture: 'romanian', share: 0.88 }],
  Albania: [{ culture: 'south_slavic', share: 0.3 }, { culture: 'greek', share: 0.25 }],
  Thrace: [{ culture: 'greek', share: 0.25 }],
  Anatolia: [{ culture: 'greek', share: 0.12 }],
  Pontus: [{ culture: 'greek', share: 0.3 }],
  Cilicia: [{ culture: 'caucasian', share: 0.22 }],
  Baghdad: [{ culture: 'arabic', share: 0.93 }],
  Basra: [{ culture: 'arabic', share: 0.93 }],
  Mosul: [{ culture: 'arabic', share: 0.85 }],
  Algiers: [{ culture: 'arabic', share: 0.94 }],
  Constantine: [{ culture: 'arabic', share: 0.94 }],
  Oran: [{ culture: 'arabic', share: 0.94 }],
  Sahara: [{ culture: 'arabic', share: 0.94 }],
  Tunisia: [{ culture: 'arabic', share: 0.94 }],
  Cyrenaica: [{ culture: 'arabic', share: 0.94 }],
  Fezzan: [{ culture: 'arabic', share: 0.94 }],
  Tripolitania: [{ culture: 'arabic', share: 0.94 }],
  // --- Egypt's Sudanese south ---
  'South Sudan (Northeast)': [{ culture: 'african', share: 0.9 }],
  'South Sudan (Southeast)': [{ culture: 'african', share: 0.9 }],
  'South Sudan (West)': [{ culture: 'african', share: 0.9 }],
  Darfur: [{ culture: 'african', share: 0.85 }],
  Kordofan: [{ culture: 'african', share: 0.8 }],
  // --- Persia ---
  'Azerbaijan (Iran)': [{ culture: 'turkish', share: 0.6 }],
  // --- Qing frontiers ---
  Tibet: [{ culture: 'central_asian', share: 0.9, religion: 'buddhist' }],
  Xinjiang: [{ culture: 'central_asian', share: 0.85 }],
  'Inner Mongolia': [{ culture: 'central_asian', share: 0.7, religion: 'buddhist' }],
  'Eastern Mongolia': [{ culture: 'central_asian', share: 0.85, religion: 'buddhist' }],
  'Western Mongolia': [{ culture: 'central_asian', share: 0.85, religion: 'buddhist' }],
  Gobi: [{ culture: 'central_asian', share: 0.85, religion: 'buddhist' }],
  Ulaanbaatar: [{ culture: 'central_asian', share: 0.85, religion: 'buddhist' }],
  // --- Mexico's Texan settlers ---
  Texas: [{ culture: 'yankee', share: 0.35, religion: 'protestant' }],
  // --- Portugal's African coast ---
  'Cuando Cubango': [{ culture: 'african', share: 0.92 }],
  Huambo: [{ culture: 'african', share: 0.92 }],
  Luanda: [{ culture: 'african', share: 0.88 }],
  Beira: [{ culture: 'african', share: 0.92 }],
  Maputo: [{ culture: 'african', share: 0.9 }],
  Nampula: [{ culture: 'african', share: 0.92 }],
};

/** Pakistan/Bengal provinces of British India follow Islam, not Hinduism. */
const SOUTH_ASIAN_SUNNI = new Set([
  'Baluchistan', 'Frontier', 'Punjab (Pakistan)', 'Sindh', 'Bangladesh', 'Jammu and Kashmir',
]);

/**
 * Broad colonial-sweep classifier (owner-scoped). Returns the native culture
 * for provinces the named-rule table does not cover.
 */
function colonialMinorityFor(ownerTag: string, name: string, lon: number, lat: number): MinorityRule[] | null {
  // British India: everything ENG owns in the subcontinent box.
  if (ownerTag === 'ENG' && lon >= 60 && lon <= 98 && lat >= 5 && lat <= 35.5) {
    return [{ culture: 'south_asian', share: 0.97, religion: SOUTH_ASIAN_SUNNI.has(name) ? 'sunni' : 'hindu' }];
  }
  // Dutch East Indies.
  if (ownerTag === 'NLD' && lon >= 94 && lon <= 142 && lat >= -12 && lat <= 7) {
    return [{ culture: 'malay', share: 0.96 }];
  }
  // Spanish possessions: the Americas and the Philippines.
  if (ownerTag === 'ESP' && lon >= -120 && lon <= -55) {
    return [{ culture: 'latin_american', share: 0.85 }];
  }
  if (ownerTag === 'ESP' && name === 'Philippines') {
    return [{ culture: 'malay', share: 0.9, religion: 'catholic' }];
  }
  // Portuguese Brazil.
  if (ownerTag === 'POR' && lon >= -76 && lon <= -30) {
    return [{ culture: 'latin_american', share: 0.88 }];
  }
  return null;
}

/** Placeholder tags: pops there are natives, not subjects of a real empire. */
const PLACEHOLDER_TAGS = new Set(['UNC', 'UNA', 'COL']);

const PLACEHOLDER_NAME_RULES: Record<string, string> = {
  Moldova: 'romanian',
  'Bosnia and Herzegovina': 'south_slavic',
  Kosovo: 'south_slavic',
  Montenegro: 'south_slavic',
  'North Macedonia': 'south_slavic',
  Luxembourg: 'french',
  Iceland: 'scandinavian',
  'East Greenland': 'scandinavian',
  'North Greenland': 'scandinavian',
  'West Greenland': 'scandinavian',
  Cyprus: 'greek',
  'Northern Cyprus': 'greek',
  'Sri Lanka': 'south_asian',
  Kuwait: 'arabic',
  Oman: 'arabic',
  Qatar: 'arabic',
  'United Arab Emirates': 'arabic',
  Hejaz: 'arabic',
  Nejd: 'arabic',
  Asir: 'arabic',
  'Eastern Arabia': 'arabic',
  'Yemen (East)': 'arabic',
  'Yemen (North)': 'arabic',
  'Yemen (West)': 'arabic',
  Kyrgyzstan: 'central_asian',
  Tajikistan: 'central_asian',
  'Turkmenistan (East)': 'central_asian',
  'Turkmenistan (North)': 'central_asian',
  'Turkmenistan (Northwest)': 'central_asian',
  'Uzbekistan (East)': 'central_asian',
  'Uzbekistan (Northwest)': 'central_asian',
  'Uzbekistan (Southeast)': 'central_asian',
};

/** Native culture for provinces owned by map-placeholder tags (UNC/UNA/COL). */
function placeholderCultureFor(name: string, lon: number, lat: number): string | null {
  const named = PLACEHOLDER_NAME_RULES[name];
  if (named) return named;
  if (lon >= -20 && lon <= 52 && lat >= -36 && lat <= 20) return 'african';
  if (lon >= 95 && lon <= 170 && lat >= -12) return 'malay';
  if (lon >= -100 && lon <= -55 && lat >= -60 && lat <= 30) return 'latin_american';
  return null;
}
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

function capitalId(worldSeed: WorldSeedData, id: number): number {
  if (id >= 0 && id < worldSeed.provinceCount) return id;
  return 0;
}

/** 0.8.0: historical override wins, then the generated seed, then the fallback. */
function primaryCultureKeyFor(tag: string, seedPrimary: string): string {
  return PRIMARY_CULTURE_OVERRIDE[tag] || seedPrimary || CULTURE_BY_TAG[tag] || 'british';
}

function gpRankFor(seed: { tag: string; greatPowerRank?: number }): number {
  if (seed.greatPowerRank && seed.greatPowerRank > 0) return seed.greatPowerRank;
  return GP_ORDER.includes(seed.tag) ? GP_ORDER.indexOf(seed.tag) + 1 : 0;
}

function createNations(data: GameData, worldSeed: WorldSeedData): Nation[] {
  return worldSeed.nations.map((seed, id) => {
    const gpRank = gpRankFor(seed);
    return {
    coreStateIds: Array.from(new Set((data.nationCores?.[seed.tag] ?? seed.coreStateIds ?? []).slice())).sort((a, b) => a - b),
    id,
    tag: seed.tag,
    name: seed.name,
    color: seed.color,
    primaryCulture: cultureIndex(data, primaryCultureKeyFor(seed.tag, seed.primaryCulture)),
    acceptedCultures: [cultureIndex(data, primaryCultureKeyFor(seed.tag, seed.primaryCulture))],
    government: seed.government,
    rulingParty: defaultRulingParty(seed.government),
    parties: createNationParties(),
    upperHouse: defaultUpperHouse(seed.government),
    electionIntervalYears: seed.government === 'constitutional_monarchy' ? 5 : 4,
    lastElectionYear: 1816,
    nextElectionYear: isElectiveGovernment(seed.government) ? 1820 + (id % 4) : Number.MAX_SAFE_INTEGER,
    electionLastResult: 'No election held yet.',
    capital: capitalId(worldSeed, seed.capitalProvinceId),
    treasury: 2600 + (gpRank > 0 ? (9 - gpRank) * 380 : 0),
    prestige: gpRank > 0 ? 25 + Math.max(0, 8 - gpRank) * 5 : 6,
    infamy: 0,
    literacy: seed.government === 'uncivilized' ? 0.12 : gpRank > 0 ? 0.45 : 0.26,
    nationalConsciousness: 1.2,
    researchPoints: 0,
    reforms: nationReforms(data),
    techs: seed.government === 'uncivilized' ? [] : ['market_structure'],
    currentResearch: null,
    researchProgress: 0,
    inventions: [],
    taxRatePoor: 0.45,
    taxRateMiddle: 0.35,
    taxRateRich: 0.25,
    tariffRate: 0.1,
    gpRank,
    spheredBy: -1 as NationId,
    sphereMembers: [],
    colonialPoints: 0,
    isCivilized: seed.government !== 'uncivilized',
    isPlayer: false,
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
    // 0.8.0 culture
    culturePolicy: 'assimilationist' as const,
    assimilationByCulture: {},
  };
  });
}

function createStates(worldSeed: WorldSeedData, tagToNationId: Record<string, number>): State[] {
  return worldSeed.states.map((stateSeed) => ({
    id: stateSeed.id,
    name: stateSeed.name,
    owner: tagToNationId[stateSeed.ownerTag] ?? 0,
    provinceIds: stateSeed.provinceIds.slice(),
    factories: [],
    unrestRisk: 0,
    unrestMonths: 0,
    lastRebellionDay: -3650,
  }));
}

function createProvinces(worldSeed: WorldSeedData, rng: Rng, tagToNationId: Record<string, number>): { provinces: Province[]; runtime: ProvinceSeedRuntime[] } {
  const provinces: Province[] = [];
  const runtime: ProvinceSeedRuntime[] = [];
  const validIds = new Set(worldSeed.provinces.map((province) => province.id));

  for (const seed of worldSeed.provinces) {
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
        weeklyProfit: 0,
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

function addFactorySeeds(worldSeed: WorldSeedData, states: State[], rng: Rng): void {
  states.forEach((state, index) => {
    const ownerTag = worldSeed.nations[state.owner]?.tag ?? '';
    if (!INDUSTRIAL_TAGS.has(ownerTag) && !worldSeed.nations[state.owner]?.greatPowerRank) return;
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

/** One (culture, religion, weight) slice of a province's population. */
interface CultureSlice {
  culture: number;
  religion: number;
  weight: number;
}

/**
 * 0.8.0 — the cultural makeup of a seeded province: named historical minority
 * regions first, then broad colonial sweeps, then native cultures under the
 * placeholder tags, then light border blending with foreign neighbours.
 * Deterministic (pure function of the baked seed + game data).
 */
function provinceCultureSlices(
  seed: { name: string; ownerTag: string; lon: number; lat: number; neighbors: number[] },
  nations: Nation[],
  ownerId: number,
  religionByNation: number[],
  provinceOwnerBySeedId: Map<number, number>,
  data: GameData,
): CultureSlice[] {
  const owner = nations[ownerId];
  const primary = owner.primaryCulture;
  const primaryReligion = religionByNation[ownerId] ?? 0;
  const cultureReligion = (cultureIdx: number, override?: string): number => {
    if (override) return religionIndex(data, override);
    const key = data.cultures[cultureIdx]?.religion;
    return key ? religionIndex(data, key) : primaryReligion;
  };

  // Native population under map-placeholder tags: one homogeneous native slice.
  if (PLACEHOLDER_TAGS.has(seed.ownerTag)) {
    const nativeKey = placeholderCultureFor(seed.name, seed.lon, seed.lat);
    const native = nativeKey ? cultureIndex(data, nativeKey, primary) : primary;
    return [{ culture: native, religion: cultureReligion(native), weight: 1 }];
  }

  const rules = MINORITY_RULES[seed.name]
    ?? colonialMinorityFor(seed.ownerTag, seed.name, seed.lon, seed.lat)
    ?? [];
  const slices: CultureSlice[] = [];
  let minorityTotal = 0;
  for (const rule of rules) {
    const culture = cultureIndex(data, rule.culture, primary);
    if (culture === primary) continue;
    const weight = clamp(rule.share, 0, 0.98);
    slices.push({ culture, religion: cultureReligion(culture, rule.religion), weight });
    minorityTotal += weight;
  }

  // Border blending: the largest same-continent foreign neighbour culture
  // seeps across the border (Alsace, the marches...). Named rules win.
  if (slices.length === 0 && owner.isCivilized) {
    for (const neighborId of seed.neighbors) {
      const neighborOwner = provinceOwnerBySeedId.get(neighborId);
      if (neighborOwner === undefined || neighborOwner === ownerId) continue;
      const other = nations[neighborOwner];
      if (!other || !other.isCivilized || other.primaryCulture === primary) continue;
      slices.push({
        culture: other.primaryCulture,
        religion: cultureReligion(other.primaryCulture),
        weight: 0.12,
      });
      minorityTotal += 0.12;
      break; // one blended culture max
    }
  }

  minorityTotal = Math.min(minorityTotal, 0.98);
  slices.unshift({ culture: primary, religion: primaryReligion, weight: 1 - minorityTotal });
  // Largest first; keep at most 3 slices, ignore slivers under 10%.
  const kept = slices
    .filter((slice) => slice.weight >= 0.1)
    .sort((a, b) => b.weight - a.weight || a.culture - b.culture)
    .slice(0, 3);
  const total = kept.reduce((sum, slice) => sum + slice.weight, 0);
  for (const slice of kept) slice.weight /= Math.max(1e-9, total);
  return kept.length > 0 ? kept : [{ culture: primary, religion: primaryReligion, weight: 1 }];
}

function createPops(worldSeed: WorldSeedData, worldProvinces: Province[], provinceRuntime: ProvinceSeedRuntime[], nations: Nation[], data: GameData, rng: Rng): Pop[] {
  const pops: Pop[] = [];
  const religionByNation = nations.map((nation) => religionIndex(data, RELIGION_BY_TAG[nation.tag] || 'protestant'));
  const runtimeByProvince = new Map(provinceRuntime.map((item) => [item.id, item]));
  const seedByProvince = new Map(worldSeed.provinces.map((seed) => [seed.id, seed]));
  const provinceOwnerBySeedId = new Map(worldProvinces.map((province) => [province.id, province.owner]));
  // Pop classes that split into cultural cohorts; the rest take one culture.
  const SPLIT_TYPES = new Set<PopType>(['farmer', 'laborer', 'craftsman']);
  for (const province of worldProvinces) {
    const nation = nations[province.owner];
    const runtime = runtimeByProvince.get(province.id);
    const weight = runtime?.weight ?? 1;
    const religion = religionByNation[province.owner] ?? 0;
    const seed = seedByProvince.get(province.id);
    const slices: CultureSlice[] = seed
      ? provinceCultureSlices(seed, nations, province.owner, religionByNation, provinceOwnerBySeedId, data)
      : [{ culture: nation.primaryCulture, religion, weight: 1 }];
    const plurality = slices[0];
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
      const typeSize = Math.max(80, Math.floor(basePopulation * share * (0.9 + rng.next() * 0.25)));
      // Soldiers serve the crown; local elites belong to the local plurality.
      const cohorts: CultureSlice[] = type === 'soldier'
        ? [{ culture: nation.primaryCulture, religion, weight: 1 }]
        : SPLIT_TYPES.has(type)
          ? slices
          : [plurality];
      for (const cohort of cohorts) {
        const size = Math.max(60, Math.floor(typeSize * cohort.weight));
        const pop: Pop = {
          id: pops.length,
          type,
          provinceId: province.id,
          size,
          culture: cohort.culture,
          religion: cohort.religion,
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
  }
  return pops;
}

function createRelations(worldSeed: WorldSeedData, rng: Rng): DiploRelation[] {
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
  for (let a = 0; a < worldSeed.nations.length; a++) {
    for (let b = a + 1; b < worldSeed.nations.length; b++) {
      const tagA = worldSeed.nations[a]?.tag ?? '';
      const tagB = worldSeed.nations[b]?.tag ?? '';
      const key = `${tagA}:${tagB}`;
      const reverse = `${tagB}:${tagA}`;
      let kind: DiploRelation['kind'] = alliancePairs.has(key) || alliancePairs.has(reverse)
        ? 'alliance'
        : rivalryPairs.has(key) || rivalryPairs.has(reverse)
          ? 'rivalry'
          : 'neutral';
      // Procedural maps: sprinkle a few seeded alliances/rivalries among GPs.
      if (kind === 'neutral') {
        const gpA = worldSeed.nations[a]?.greatPowerRank ?? 0;
        const gpB = worldSeed.nations[b]?.greatPowerRank ?? 0;
        if (gpA > 0 && gpB > 0) {
          const roll = rng.next();
          if (roll < 0.12) kind = 'alliance';
          else if (roll < 0.28) kind = 'rivalry';
        }
      }
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

export function createWorld(
  data: GameData,
  seed: number,
  mapMode: CampaignMapMode = DEFAULT_CAMPAIGN_MAP_MODE,
): World {
  const worldSeed = resolveWorldSeed(WORLD_SEED, seed, mapMode);
  const rng = new Rng(seed >>> 0);
  const nations = createNations(data, worldSeed);
  const tagToNationId = Object.fromEntries(nations.map((nation) => [nation.tag, nation.id])) as Record<string, number>;
  const states = createStates(worldSeed, tagToNationId);
  const { provinces, runtime } = createProvinces(worldSeed, rng, tagToNationId);
  addFactorySeeds(worldSeed, states, rng);
  const pops = createPops(worldSeed, provinces, runtime, nations, data, rng);

  const defaultPlayer = tagToNationId.ENG
    ?? nations.find((nation) => (worldSeed.nations[nation.id]?.greatPowerRank ?? 0) === 1)?.id
    ?? 0;

  const world: World = {
    day: 0,
    seed: seed >>> 0,
    rngState: rng.state,
    speed: 1,
    playerNation: defaultPlayer,
    mapMode,
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
    rebellions: [],
    relations: createRelations(worldSeed, rng),
    pendingEvents: [],
    eventLastFired: {},
    decisionLastTaken: {},
    nextEventInstanceId: 1,
    nextArmyId: 1,
    nextFleetId: 1,
    nextWarId: 1,
    nextRebellionId: 1,
    nextPopId: pops.length,
    // 0.7.0 Concert of Europe
    tension: 15,
    crisis: null,
    congresses: [],
    nextCrisisId: 1,
    crisisCooldownUntil: 0,
    // 0.8.0 Age of Nationalism
    movements: [],
    nextMovementId: 1,
  };
  if (nations[defaultPlayer]) nations[defaultPlayer].isPlayer = true;
  for (const nation of world.nations) {
    const ownedStates = world.states
      .filter((state) => state.owner === nation.id)
      .map((state) => state.id);
    nation.coreStateIds = Array.from(new Set([...(nation.coreStateIds ?? []), ...ownedStates])).sort((a, b) => a - b);
  }
  for (const nation of world.nations) updateMilitaryDerivedForNation(world, nation.id);
  primeDiplomacy(world, data);
  return world;
}
