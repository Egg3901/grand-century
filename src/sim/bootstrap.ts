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
/**
 * Victoria II's religions onto this game's eight. Same trap as the culture
 * table: `religionIndex` falls back to index 0, which is `protestant`, so an
 * unmapped key does not fail, it converts. Before this existed no seed nation
 * carried a religion at all and RELIGION_BY_TAG covered 45 of 93 tags, which
 * left the Papal States, Tuscany, Bavaria, Poland, Serbia, Tibet, Oman, the
 * Punjab and Zululand all Protestant.
 */
export const VIC2_RELIGION_TO_GC: Record<string, string> = {
  catholic: 'catholic',
  protestant: 'protestant',
  orthodox: 'orthodox',
  // No Miaphysite bucket; Ethiopia and the Copts sit closest to orthodox.
  coptic: 'orthodox',
  sunni: 'sunni',
  // No shia bucket. Persia and Oman are the notable losses here.
  shiite: 'sunni',
  ibadi: 'sunni',
  hindu: 'hindu',
  // No sikh bucket; the Punjab reads as hindu rather than as a Muslim state.
  sikh: 'hindu',
  jain: 'hindu',
  mahayana: 'buddhist',
  theravada: 'buddhist',
  gelugpa: 'buddhist',
  shinto: 'buddhist',
  confucian: 'confucian',
  animist: 'traditional',
  shamanist: 'traditional',
  jewish: 'traditional',
};

const RELIGION_BY_TAG: Record<string, string> = {
  // The Qing constituents follow the Qing. Vic2 calls them mahayana, which
  // would read oddly as a different religion from the empire administering
  // them. Xinjiang (sunni) and Mongolia/Tibet (buddhist) are genuinely
  // different and are left to the Vic2 mapping.
  GXI: 'confucian',
  YNN: 'confucian',
  MCK: 'confucian',
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
export const PRIMARY_CULTURE_OVERRIDE: Record<string, string> = {
  ESP: 'iberian',
  // Greece only became a seedable nation with the 1830 cut (London Protocol,
  // February 1830). The build's nation library still carries the pre-Vic2
  // 'french' placeholder for it.
  GRE: 'greek',
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
 * 0.8.0 — the cultural fault lines of 1830, keyed by generated province name
 * (names are unique in the baked seed). These are the *named* historical
 * minority regions; broad colonial sweeps are handled by geography below.
 */
export const MINORITY_RULES: Record<string, MinorityRule[]> = {
  // Keys are generated province names from the Vic2 region cut. content.lint
  // asserts every key still resolves: a rebuild that renames a region must not
  // be allowed to silently delete a nationality.
  // --- British Isles ---
  'Leinster-Connacht': [{ culture: 'irish', share: 0.85 }],
  Munster: [{ culture: 'irish', share: 0.9 }],
  // Ulster's plantation counties are the reason this is not a clean 0.85.
  Ulster: [{ culture: 'irish', share: 0.45 }],
  // --- British North America ---
  Quebec: [{ culture: 'french', share: 0.76 }],
  'New Brunswick': [{ culture: 'french', share: 0.32 }],
  // --- British Africa, Caribbean and Burma ---
  'Cape Colony': [{ culture: 'african', share: 0.62, religion: 'protestant' }],
  'Eastern Cape': [{ culture: 'african', share: 0.78, religion: 'protestant' }],
  'Northern Cape': [{ culture: 'african', share: 0.72, religion: 'protestant' }],
  'Sierra Leone': [{ culture: 'african', share: 0.95, religion: 'traditional' }],
  Gambia: [{ culture: 'african', share: 0.95, religion: 'traditional' }],
  'West Indies': [{ culture: 'african', share: 0.88, religion: 'protestant' }],
  'Caribbean Islands': [{ culture: 'african', share: 0.88, religion: 'protestant' }],
  'Lesser Antilles': [{ culture: 'african', share: 0.85, religion: 'protestant' }],
  Guayana: [{ culture: 'african', share: 0.85, religion: 'protestant' }],
  Tenasserim: [{ culture: 'indochinese', share: 0.95 }],
  // --- Low Countries: Wallonia is French-speaking, Flanders is not ---
  Wallonie: [{ culture: 'french', share: 0.9 }],
  // --- Habsburg lands ---
  'Central Hungary': [{ culture: 'hungarian', share: 0.86 }],
  'Alföld': [{ culture: 'hungarian', share: 0.84 }],
  Transdanubia: [{ culture: 'hungarian', share: 0.82 }],
  Slovakia: [{ culture: 'czech', share: 0.5 }, { culture: 'hungarian', share: 0.3 }],
  'Eastern Siebenbürgen': [{ culture: 'romanian', share: 0.5 }, { culture: 'hungarian', share: 0.32 }],
  'Western Siebenbürgen': [{ culture: 'romanian', share: 0.55 }, { culture: 'hungarian', share: 0.28 }],
  Bohemia: [{ culture: 'czech', share: 0.72 }],
  Moravia: [{ culture: 'czech', share: 0.75 }],
  Lombardia: [{ culture: 'italian', share: 0.9 }],
  Venetia: [{ culture: 'italian', share: 0.9 }],
  'South Tirol': [{ culture: 'italian', share: 0.5 }],
  Istria: [{ culture: 'italian', share: 0.4 }, { culture: 'south_slavic', share: 0.4, religion: 'catholic' }],
  Croatia: [{ culture: 'south_slavic', share: 0.84, religion: 'catholic' }],
  Slavonia: [{ culture: 'south_slavic', share: 0.82, religion: 'catholic' }],
  Slovenia: [{ culture: 'south_slavic', share: 0.72, religion: 'catholic' }],
  Dalmatia: [{ culture: 'south_slavic', share: 0.8, religion: 'catholic' }],
  'East Galicia': [{ culture: 'ukrainian', share: 0.62 }, { culture: 'polish', share: 0.24 }],
  'West Galicia': [{ culture: 'polish', share: 0.85 }],
  // --- Prussia's Polish east ---
  Posen: [{ culture: 'polish', share: 0.6 }],
  'Westpreußen': [{ culture: 'polish', share: 0.33 }],
  Schlesien: [{ culture: 'polish', share: 0.22 }],
  'Ostpreußen': [{ culture: 'baltic', share: 0.12 }],
  // --- Russian Empire: Baltic provinces ---
  // The Baltic German nobility is small but owns the land and the towns; 0.1 is
  // the floor provinceCultureSlices keeps, so do not lower it.
  Lietuva: [{ culture: 'baltic', share: 0.82, religion: 'catholic' }],
  Latvia: [{ culture: 'baltic', share: 0.8 }, { culture: 'north_german', share: 0.1 }],
  Estonia: [{ culture: 'baltic', share: 0.8 }, { culture: 'north_german', share: 0.1 }],
  // --- Russian Empire: Finnic north ---
  Karelia: [{ culture: 'finnish', share: 0.45 }],
  Ingria: [{ culture: 'finnish', share: 0.18 }],
  // --- Russian Empire: the western gubernias ---
  Minsk: [{ culture: 'ukrainian', share: 0.7 }],
  Orsha: [{ culture: 'ukrainian', share: 0.65 }],
  'Brêst': [{ culture: 'ukrainian', share: 0.7 }],
  Kiev: [{ culture: 'ukrainian', share: 0.84 }],
  Rovne: [{ culture: 'ukrainian', share: 0.75 }],
  Cherson: [{ culture: 'ukrainian', share: 0.68 }],
  Luhansk: [{ culture: 'ukrainian', share: 0.6 }],
  Budjak: [{ culture: 'romanian', share: 0.42 }, { culture: 'ukrainian', share: 0.22 }],
  Crimea: [{ culture: 'turkish', share: 0.4 }, { culture: 'ukrainian', share: 0.2 }],
  // --- Russian Empire: steppe and Volga ---
  Akmolinsk: [{ culture: 'central_asian', share: 0.9 }],
  Uralsk: [{ culture: 'central_asian', share: 0.6 }],
  Tartaria: [{ culture: 'central_asian', share: 0.7 }],
  Kazan: [{ culture: 'central_asian', share: 0.5 }],
  Astrakhan: [{ culture: 'central_asian', share: 0.35 }],
  // --- Russian Empire: Caucasus ---
  'North Caucasia': [{ culture: 'caucasian', share: 0.85, religion: 'sunni' }],
  Ekaterinodar: [{ culture: 'caucasian', share: 0.4, religion: 'sunni' }],
  Armenia: [{ culture: 'caucasian', share: 0.88 }],
  Georgia: [{ culture: 'caucasian', share: 0.88 }],
  Azerbaijan: [{ culture: 'turkish', share: 0.6, religion: 'sunni' }, { culture: 'caucasian', share: 0.25 }],
  // --- Ottoman Europe ---
  'Thessalía': [{ culture: 'greek', share: 0.9 }],
  'Aegean Islands': [{ culture: 'greek', share: 0.85 }],
  Cyprus: [{ culture: 'greek', share: 0.75 }],
  Rumelia: [{ culture: 'greek', share: 0.28 }],
  'East Macedonia': [{ culture: 'south_slavic', share: 0.4 }, { culture: 'greek', share: 0.3 }],
  'West Macedonia': [{ culture: 'south_slavic', share: 0.45 }, { culture: 'greek', share: 0.25 }],
  'North Macedonia': [{ culture: 'south_slavic', share: 0.6 }],
  'Southern Serbia': [{ culture: 'south_slavic', share: 0.85 }],
  Bosnia: [{ culture: 'south_slavic', share: 0.88 }],
  Montenegro: [{ culture: 'south_slavic', share: 0.9 }],
  Bulgaria: [{ culture: 'south_slavic', share: 0.78 }],
  Albania: [{ culture: 'south_slavic', share: 0.3 }, { culture: 'greek', share: 0.25 }],
  Thrace: [{ culture: 'greek', share: 0.25 }],
  Dobrudja: [{ culture: 'romanian', share: 0.4 }],
  // --- Ottoman Anatolia: Greeks on the coast, Armenians in the east ---
  Aydin: [{ culture: 'greek', share: 0.2 }],
  Hudavendigar: [{ culture: 'greek', share: 0.15 }],
  Trabzon: [{ culture: 'greek', share: 0.3 }],
  'Ankara and Adana': [{ culture: 'caucasian', share: 0.15 }],
  Kars: [{ culture: 'caucasian', share: 0.35 }],
  'Diyarbakir-Van': [{ culture: 'caucasian', share: 0.3 }],
  // --- Ottoman Arab provinces (Syria is Ottoman again at the 1830 rollback) ---
  Baghdad: [{ culture: 'arabic', share: 0.93 }],
  Basra: [{ culture: 'arabic', share: 0.93 }],
  Mosul: [{ culture: 'arabic', share: 0.85 }],
  Aleppo: [{ culture: 'arabic', share: 0.93 }],
  Syria: [{ culture: 'arabic', share: 0.93 }],
  Lebanon: [{ culture: 'arabic', share: 0.9 }],
  Palestine: [{ culture: 'arabic', share: 0.92 }],
  Transjordan: [{ culture: 'arabic', share: 0.95 }],
  Libya: [{ culture: 'arabic', share: 0.94 }],
  // --- Egypt's Sudanese south ---
  Sudan: [{ culture: 'african', share: 0.8 }],
  Dongola: [{ culture: 'african', share: 0.5 }],
  Kordofan: [{ culture: 'african', share: 0.8 }],
  Eritrea: [{ culture: 'african', share: 0.7 }],
  // --- Persia's Turkic northwest ---
  Tabriz: [{ culture: 'turkish', share: 0.6 }],
  // --- Mexico's Texan settlers ---
  Texas: [{ culture: 'yankee', share: 0.35, religion: 'protestant' }],
  // --- Spain overseas ---
  'Luzón': [{ culture: 'malay', share: 0.9, religion: 'catholic' }],
  Visayas: [{ culture: 'malay', share: 0.9, religion: 'catholic' }],
  Mindanao: [{ culture: 'malay', share: 0.9 }],
  'South Cameroon': [{ culture: 'african', share: 0.95, religion: 'traditional' }],
  // --- Portugal's African coast ---
  'North Angola': [{ culture: 'african', share: 0.92, religion: 'traditional' }],
  'South Angola': [{ culture: 'african', share: 0.92, religion: 'traditional' }],
  Mocambique: [{ culture: 'african', share: 0.92, religion: 'traditional' }],
  'Lourenço Marques': [{ culture: 'african', share: 0.9, religion: 'traditional' }],
  Zambezia: [{ culture: 'african', share: 0.92, religion: 'traditional' }],
};

/**
 * Provinces of British India that follow Islam rather than Hinduism. Punjab,
 * Sindh and the Frontier were not British in 1830 (Sikh, Talpur and Afghan
 * respectively), so eastern Bengal is the whole list at this start date.
 */
export const SOUTH_ASIAN_SUNNI = new Set(['North Bengal']);

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
  // Portuguese Brazil.
  if (ownerTag === 'POR' && lon >= -76 && lon <= -30) {
    return [{ culture: 'latin_american', share: 0.88 }];
  }
  return null;
}

/** Placeholder tags: pops there are natives, not subjects of a real empire. */
const PLACEHOLDER_TAGS = new Set(['UNC', 'UNA', 'COL']);

/**
 * Native culture for named placeholder provinces. The lon/lat boxes below cover
 * the bulk of the uncolonized world; these are the provinces they get wrong.
 */
export const PLACEHOLDER_NAME_RULES: Record<string, string> = {
  // Sahara and the Libyan interior sit north of the African lat box.
  Sahara: 'african',
  'West Sahara': 'african',
  'Libyan Desert': 'african',
  'Inner Mauritania': 'african',
  // Pacific: Vic2's island coordinates are unreliable (the map is hand-drawn,
  // not projected), so these are named rather than boxed.
  Fiji: 'polynesian',
  Kiribati: 'polynesian',
  'Western Polynesia': 'polynesian',
  'Northern New Guinea': 'polynesian',
  'Southern New Guinea': 'polynesian',
  'Christmas & Cocos Islands': 'malay',
  // Siberia's peoples fold into the steppe bucket that already carries the
  // Mongols, Tibetans and Kazakhs.
  'Inner Chukotka': 'central_asian',
  'North Siberia': 'central_asian',
  Sakhalin: 'central_asian',
  // The North American interior is not empty and is not American yet.
  'Northwest Territories': 'indigenous_american',
  'Yukon Territory': 'indigenous_american',
  Colorado: 'indigenous_american',
  Oklahoma: 'indigenous_american',
  Oregon: 'indigenous_american',
  Washington: 'indigenous_american',
};

/**
 * Religion for named placeholder provinces where the culture's own default is
 * wrong. `african` defaults to sunni, which is right across the Sahel and the
 * Sudan and wrong everywhere south of it.
 */
export const PLACEHOLDER_RELIGION_RULES: Record<string, string> = {
  Dahomey: 'traditional',
  Togo: 'traditional',
  'Niger Delta': 'traditional',
  'Yoruba States': 'traditional',
  Guinea: 'traditional',
  'Windward Coast': 'traditional',
  Gabon: 'traditional',
  Congo: 'traditional',
  'Bas-Congo': 'traditional',
  'Congo Orientale': 'traditional',
  Equateur: 'traditional',
  Kasai: 'traditional',
  Katanga: 'traditional',
  Kazembe: 'traditional',
  Zambia: 'traditional',
  Zambezi: 'traditional',
  'East Angola': 'traditional',
  Botswana: 'traditional',
  Hereroland: 'traditional',
  Namaqualand: 'traditional',
  'Rift Valley': 'traditional',
  Uganda: 'traditional',
  Tanganyika: 'traditional',
  Equatoria: 'traditional',
  'Ubangi-Shari': 'traditional',
};

/** Native culture for provinces owned by map-placeholder tags (UNC/UNA/COL). */
function placeholderCultureFor(name: string, lon: number, lat: number): string | null {
  const named = PLACEHOLDER_NAME_RULES[name];
  if (named) return named;
  if (lon >= -20 && lon <= 52 && lat >= -36 && lat <= 20) return 'african';
  if (lon >= 95 && lon <= 170 && lat >= -12 && lat <= 25) return 'malay';
  if (lon >= -100 && lon <= -55 && lat >= -60 && lat <= 30) return 'latin_american';
  return null;
}
/**
 * Victoria II ships ~200 cultures; Grand Century models 33. The Vic2 re-cut
 * writes Paradox's own culture key into the seed for every tag it adds, so
 * without this table `cultureIndex` silently falls back to index 0 and Serbia,
 * Tibet, Zululand and Oman all come out British. Every Vic2 primary culture
 * present in the 1830 seed must resolve here; content.lint asserts it.
 */
export const VIC2_CULTURE_TO_GC: Record<string, string> = {
  // Arab world
  bedouin: 'arabic',
  maghrebi: 'arabic',
  mashriqi: 'arabic',
  // Turkestan, Mongolia, Tibet — one steppe/highland bucket in this model
  uzbek: 'central_asian',
  kirgiz: 'central_asian',
  mongol: 'central_asian',
  tibetan: 'central_asian',
  // Iranic
  baluchi: 'persian',
  // Afrikaners are Dutch settlers, and NLD is north_german in this vocabulary
  boer: 'north_german',
  // Qing peoples: administered as Chinese provinces, so they stay Han here
  // rather than seeding a spurious minority inside the empire.
  beifaren: 'han',
  nanfaren: 'han',
  zhuang: 'han',
  manchu: 'han',
  // Balkans
  serb: 'south_slavic',
  // Sub-Saharan Africa and the Black Atlantic
  zulu: 'african',
  hausa: 'african',
  malagasy: 'african',
  afro_american: 'african',
  afro_antillean: 'african',
  // Subcontinent
  gujarati: 'south_asian',
  avadhi: 'south_asian',
  kannada: 'south_asian',
  marathi: 'south_asian',
  oriya: 'south_asian',
  panjabi: 'south_asian',
  sindi: 'south_asian',
  malayalam: 'south_asian',
  // Latin America
  central_american: 'latin_american',
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

function capitalId(worldSeed: WorldSeedData, id: number): number {
  if (id >= 0 && id < worldSeed.provinceCount) return id;
  return 0;
}

/** 0.8.0: historical override wins, then the generated seed, then the fallback. */
export function religionKeyFor(tag: string, seedReligion?: string): string {
  const seeded = seedReligion ? VIC2_RELIGION_TO_GC[seedReligion] ?? seedReligion : undefined;
  return RELIGION_BY_TAG[tag] ?? seeded ?? 'protestant';
}

function primaryCultureKeyFor(tag: string, seedPrimary: string): string {
  const seeded = VIC2_CULTURE_TO_GC[seedPrimary] ?? seedPrimary;
  return PRIMARY_CULTURE_OVERRIDE[tag] || seeded || CULTURE_BY_TAG[tag] || 'british';
}

function gpRankFor(seed: { tag: string; greatPowerRank?: number }): number {
  if (seed.greatPowerRank && seed.greatPowerRank > 0) return seed.greatPowerRank;
  return GP_ORDER.includes(seed.tag) ? GP_ORDER.indexOf(seed.tag) + 1 : 0;
}

function createNations(data: GameData, worldSeed: WorldSeedData): Nation[] {
  const seedNationIdByTag = new Map(worldSeed.nations.map((seed, id) => [seed.tag, id]));
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
    lastElectionYear: data.startDate.year - 4,
    nextElectionYear: isElectiveGovernment(seed.government) ? data.startDate.year + (id % 4) : Number.MAX_SAFE_INTEGER,
    electionLastResult: 'No election held yet.',
    capital: capitalId(worldSeed, seed.capitalProvinceId),
    polityStatus: seed.polityStatus ?? 'sovereign',
    overlordNation: seed.overlordTag ? (seedNationIdByTag.get(seed.overlordTag) ?? -1) : -1,
    eraSummary: seed.eraSummary,
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
    const controller = seed.controllerTag ? (tagToNationId[seed.controllerTag] ?? owner) : owner;
    const terrain = seed.terrain as Terrain;
    const recipe = RGO_GOOD_TO_RECIPE[seed.rgoGood] ?? RGO_RECIPES[seed.id % RGO_RECIPES.length];
    const level = clamp(1 + Math.round(seed.populationWeight * 1.6), 1, 5);
    const employed = Math.max(800, Math.floor((1200 + rng.next() * 2400) * seed.populationWeight));
    provinces.push({
      id: seed.id,
      name: seed.name,
      owner,
      controller,
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
      lastInputCost: 0,
      lastWages: 0,
      lastOperating: 0,
      lastCapacity: 2300,
      lastInputFill: 1,
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
        lastInputCost: 0,
        lastWages: 0,
        lastOperating: 0,
        lastCapacity: 2300,
        lastInputFill: 1,
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
    const override = PLACEHOLDER_RELIGION_RULES[seed.name];
    return [{ culture: native, religion: cultureReligion(native, override), weight: 1 }];
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
  const religionByNation = nations.map((nation) => religionIndex(
    data,
    // Curated table first: RELIGION_BY_TAG encodes deliberate calls (the Qing
    // are confucian here, where Vic2 says mahayana). Vic2's own answer fills
    // everything it does not cover.
    religionKeyFor(nation.tag, worldSeed.nations[nation.id]?.religion),
  ));
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
    scenarioId: data.scenarioId,
    startDate: { ...data.startDate },
    seed: seed >>> 0,
    rngState: rng.state,
    // Start paused so the player can survey the world before the clock runs.
    speed: 0,
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
      unmet: 0,
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
