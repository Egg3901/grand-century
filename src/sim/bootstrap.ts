import type {
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
import { PROVINCE_GEOMETRY } from '../data/geometry';

interface NationSeed {
  tag: string;
  name: string;
  color: [number, number, number];
  government: Nation['government'];
  primaryCultureKey: string;
  acceptedCultureKeys: string[];
  religionKey: string;
  rulingParty: string;
  techs: string[];
  literacy: number;
  treasury: number;
  prestige: number;
  gpRank: number;
}

const NATION_SEEDS: NationSeed[] = [
  {
    tag: 'ENG',
    name: 'United Kingdom',
    color: [176, 94, 84],
    government: 'hms_government',
    primaryCultureKey: 'british',
    acceptedCultureKeys: ['british'],
    religionKey: 'protestant',
    rulingParty: 'Conservative',
    techs: ['muzzle_loaded_rifles', 'market_structure', 'steamers'],
    literacy: 0.58,
    treasury: 5200,
    prestige: 65,
    gpRank: 1,
  },
  {
    tag: 'FRA',
    name: 'France',
    color: [106, 124, 182],
    government: 'constitutional_monarchy',
    primaryCultureKey: 'french',
    acceptedCultureKeys: ['french'],
    religionKey: 'catholic',
    rulingParty: 'Orleanist',
    techs: ['romanticism', 'muzzle_loaded_rifles'],
    literacy: 0.49,
    treasury: 4100,
    prestige: 58,
    gpRank: 2,
  },
  {
    tag: 'PRU',
    name: 'Prussia',
    color: [82, 88, 116],
    government: 'constitutional_monarchy',
    primaryCultureKey: 'north_german',
    acceptedCultureKeys: ['south_german'],
    religionKey: 'protestant',
    rulingParty: 'Junker Ministry',
    techs: ['post_napoleonic_thought'],
    literacy: 0.51,
    treasury: 3200,
    prestige: 47,
    gpRank: 3,
  },
  {
    tag: 'RUS',
    name: 'Russian Empire',
    color: [112, 128, 92],
    government: 'absolute_monarchy',
    primaryCultureKey: 'russian',
    acceptedCultureKeys: ['russian'],
    religionKey: 'orthodox',
    rulingParty: 'Autocracy',
    techs: ['muzzle_loaded_rifles'],
    literacy: 0.23,
    treasury: 4600,
    prestige: 54,
    gpRank: 4,
  },
  {
    tag: 'AUS',
    name: 'Austrian Empire',
    color: [154, 132, 92],
    government: 'absolute_monarchy',
    primaryCultureKey: 'south_german',
    acceptedCultureKeys: ['north_german'],
    religionKey: 'catholic',
    rulingParty: 'Imperial Court',
    techs: ['romanticism'],
    literacy: 0.36,
    treasury: 3500,
    prestige: 44,
    gpRank: 5,
  },
  {
    tag: 'USA',
    name: 'United States',
    color: [132, 98, 88],
    government: 'democracy',
    primaryCultureKey: 'yankee',
    acceptedCultureKeys: ['british'],
    religionKey: 'protestant',
    rulingParty: 'Democrats',
    techs: ['market_structure'],
    literacy: 0.54,
    treasury: 2900,
    prestige: 39,
    gpRank: 6,
  },
  {
    tag: 'CHI',
    name: 'Qing Empire',
    color: [146, 126, 72],
    government: 'uncivilized',
    primaryCultureKey: 'han',
    acceptedCultureKeys: ['han'],
    religionKey: 'confucian',
    rulingParty: 'Imperial Bureaucracy',
    techs: [],
    literacy: 0.15,
    treasury: 3800,
    prestige: 25,
    gpRank: 0,
  },
  {
    tag: 'OTT',
    name: 'Ottoman Empire',
    color: [128, 112, 88],
    government: 'absolute_monarchy',
    primaryCultureKey: 'turkish',
    acceptedCultureKeys: ['turkish'],
    religionKey: 'sunni',
    rulingParty: 'Sublime Porte',
    techs: [],
    literacy: 0.2,
    treasury: 2700,
    prestige: 28,
    gpRank: 8,
  },
];

const RGO_RECIPES = ['rgo_grain', 'rgo_cattle', 'rgo_timber', 'rgo_coal', 'rgo_iron', 'rgo_cotton'];
const FACTORY_RECIPES = ['factory_fabric', 'factory_steel', 'factory_small_arms', 'factory_cannery'];
const TERRAINS: Terrain[] = ['farmland', 'plains', 'forest', 'hills', 'coast', 'mountains'];
const POP_TYPES: PopType[] = ['farmer', 'laborer', 'soldier', 'aristocrat'];

function cultureIndex(data: GameData, key: string, fallback = 0): number {
  const index = data.cultures.findIndex((culture) => culture.key === key);
  return index >= 0 ? index : fallback;
}

function religionIndex(data: GameData, key: string, fallback = 0): number {
  const index = data.religions.findIndex((religion) => religion.key === key);
  return index >= 0 ? index : fallback;
}

function createNations(data: GameData): Nation[] {
  return NATION_SEEDS.map((seed, id) => ({
    id,
    tag: seed.tag,
    name: seed.name,
    color: seed.color,
    primaryCulture: cultureIndex(data, seed.primaryCultureKey),
    acceptedCultures: seed.acceptedCultureKeys.map((key) => cultureIndex(data, key)).filter((value, i, arr) => arr.indexOf(value) === i),
    government: seed.government,
    rulingParty: seed.rulingParty,
    capital: id * 6,
    treasury: seed.treasury,
    prestige: seed.prestige,
    infamy: 0,
    literacy: seed.literacy,
    researchPoints: 0,
    reforms: Object.fromEntries(data.reforms.map((reform) => [reform.key, 0])),
    techs: seed.techs.slice(),
    taxRatePoor: 0.45,
    taxRateMiddle: 0.35,
    taxRateRich: 0.25,
    tariffRate: 0.1,
    gpRank: seed.gpRank,
    spheredBy: -1 as NationId,
    sphereMembers: [],
    colonialPoints: 0,
    isCivilized: seed.government !== 'uncivilized',
    isPlayer: seed.tag === 'ENG',
  }));
}

function createStates(nations: Nation[]): State[] {
  const states: State[] = [];
  for (const nation of nations) {
    const baseProvince = nation.id * 6;
    states.push({
      id: states.length,
      name: `${nation.tag} Homeland`,
      owner: nation.id,
      provinceIds: [baseProvince, baseProvince + 1, baseProvince + 2],
      factories: [],
    });
    states.push({
      id: states.length,
      name: `${nation.tag} March`,
      owner: nation.id,
      provinceIds: [baseProvince + 3, baseProvince + 4, baseProvince + 5],
      factories: [],
    });
  }
  return states;
}

function provinceStateById(states: State[]): number[] {
  const stateByProvince: number[] = [];
  for (const state of states) {
    for (const provinceId of state.provinceIds) stateByProvince[provinceId] = state.id;
  }
  return stateByProvince;
}

function createProvinces(states: State[], rng: Rng): Province[] {
  const stateByProvince = provinceStateById(states);
  return PROVINCE_GEOMETRY.map((shape) => {
    const owner = Math.floor(shape.id / 6);
    const rgoRecipe = RGO_RECIPES[(shape.id + shape.row) % RGO_RECIPES.length];
    const terrain = TERRAINS[(shape.row + shape.col) % TERRAINS.length];
    const employed = 5000 + Math.floor(rng.next() * 12000);
    return {
      id: shape.id,
      name: shape.name,
      owner,
      controller: owner,
      stateId: stateByProvince[shape.id] ?? 0,
      terrain,
      rgo: {
        recipe: rgoRecipe,
        level: 1 + ((shape.col + shape.row) % 3),
        employed,
      },
      fortLevel: shape.col % 3 === 0 ? 1 : 0,
      navalBaseLevel: terrain === 'coast' ? 1 : 0,
      coastal: terrain === 'coast',
      neighbors: shape.neighbors.slice(),
      popIds: [],
      occupationProgress: 0,
      colonial: false,
    };
  });
}

function addFactorySeeds(states: State[], rng: Rng): void {
  states.forEach((state, index) => {
    const primaryRecipe = FACTORY_RECIPES[index % FACTORY_RECIPES.length];
    const factory: Factory = {
      recipe: primaryRecipe,
      level: 1 + (index % 2),
      employed: 3000 + Math.floor(rng.next() * 7000),
      stockpileIn: 0,
      profitTrend: 0,
    };
    state.factories.push(factory);
    if (index % 3 === 0) {
      state.factories.push({
        recipe: FACTORY_RECIPES[(index + 1) % FACTORY_RECIPES.length],
        level: 1,
        employed: 1200 + Math.floor(rng.next() * 3000),
        stockpileIn: 0,
        profitTrend: 0,
      });
    }
  });
}

function createPops(worldProvinces: Province[], nations: Nation[], data: GameData, rng: Rng): Pop[] {
  const pops: Pop[] = [];
  const religionByNation = NATION_SEEDS.map((seed) => religionIndex(data, seed.religionKey));
  for (const province of worldProvinces) {
    const nation = nations[province.owner];
    const culture = nation.primaryCulture;
    const religion = religionByNation[province.owner] ?? 0;
    for (let i = 0; i < POP_TYPES.length; i++) {
      const type = POP_TYPES[i];
      const baseSize = 6500 + Math.floor(rng.next() * 12000);
      const sizeMultiplier = type === 'soldier' ? 0.45 : type === 'aristocrat' ? 0.08 : 1;
      const size = Math.max(100, Math.floor(baseSize * sizeMultiplier));
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
  for (let a = 0; a < NATION_SEEDS.length; a++) {
    for (let b = a + 1; b < NATION_SEEDS.length; b++) {
      relations.push({
        a,
        b,
        kind: 'rivalry',
        opinion: 0,
        expiresDay: -1,
      });
    }
  }
  return relations;
}

export function createWorld(data: GameData, seed: number): World {
  const rng = new Rng(seed >>> 0);
  const nations = createNations(data);
  const states = createStates(nations);
  const provinces = createProvinces(states, rng);
  addFactorySeeds(states, rng);
  const pops = createPops(provinces, nations, data, rng);

  return {
    day: 0,
    seed: seed >>> 0,
    rngState: rng.state,
    speed: 1,
    playerNation: nations.find((nation) => nation.tag === 'ENG')?.id ?? 0,
    nations,
    provinces,
    states,
    pops,
    market: data.goods.map((good) => ({
      good: good.id,
      price: good.basePrice,
      supply: 80,
      demand: 80,
      worldStockpile: 180,
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
}
