import type { GameData, GoodDef, Recipe } from '../shared/types';
import { PROVINCE_COUNT } from './geometry';

const GOODS: GoodDef[] = [
  { id: 0, key: 'grain', name: 'Grain', category: 'raw', basePrice: 2.2 },
  { id: 1, key: 'cattle', name: 'Cattle', category: 'raw', basePrice: 2.4 },
  { id: 2, key: 'fish', name: 'Fish', category: 'raw', basePrice: 2.3 },
  { id: 3, key: 'fruit', name: 'Fruit', category: 'raw', basePrice: 2.1 },
  { id: 4, key: 'timber', name: 'Timber', category: 'raw', basePrice: 2.6 },
  { id: 5, key: 'cotton', name: 'Cotton', category: 'raw', basePrice: 2.8 },
  { id: 6, key: 'wool', name: 'Wool', category: 'raw', basePrice: 2.7 },
  { id: 7, key: 'coal', name: 'Coal', category: 'raw', basePrice: 3.2 },
  { id: 8, key: 'iron', name: 'Iron', category: 'raw', basePrice: 3.5 },
  { id: 9, key: 'dye', name: 'Dye', category: 'raw', basePrice: 3.4 },
  { id: 10, key: 'sulfur', name: 'Sulfur', category: 'raw', basePrice: 3.9 },
  { id: 11, key: 'oil', name: 'Oil', category: 'raw', basePrice: 4.8 },
  { id: 12, key: 'rubber', name: 'Rubber', category: 'raw', basePrice: 4.6 },
  { id: 13, key: 'fabric', name: 'Fabric', category: 'intermediate', basePrice: 4.2 },
  { id: 14, key: 'lumber', name: 'Lumber', category: 'intermediate', basePrice: 4.1 },
  { id: 15, key: 'steel', name: 'Steel', category: 'intermediate', basePrice: 5.3 },
  { id: 16, key: 'cement', name: 'Cement', category: 'intermediate', basePrice: 4.7 },
  { id: 17, key: 'glass', name: 'Glass', category: 'intermediate', basePrice: 4.5 },
  { id: 18, key: 'paper', name: 'Paper', category: 'intermediate', basePrice: 4.4 },
  { id: 19, key: 'fertilizer', name: 'Fertilizer', category: 'intermediate', basePrice: 4.8 },
  { id: 20, key: 'furniture', name: 'Furniture', category: 'manufactured', basePrice: 6.2 },
  { id: 21, key: 'clothes', name: 'Clothes', category: 'manufactured', basePrice: 6.0 },
  { id: 22, key: 'liquor', name: 'Liquor', category: 'manufactured', basePrice: 5.8 },
  { id: 23, key: 'wine', name: 'Wine', category: 'manufactured', basePrice: 6.4 },
  { id: 24, key: 'small_arms', name: 'Small Arms', category: 'military', basePrice: 8.4 },
  { id: 25, key: 'artillery', name: 'Artillery', category: 'military', basePrice: 9.2 },
  { id: 26, key: 'canned_food', name: 'Canned Food', category: 'military', basePrice: 7.8 },
  { id: 27, key: 'machine_parts', name: 'Machine Parts', category: 'military', basePrice: 9.5 },
  { id: 28, key: 'ammunition', name: 'Ammunition', category: 'military', basePrice: 7.2 },
  { id: 29, key: 'steamers', name: 'Steamers', category: 'military', basePrice: 8.9 },
];

const GOOD_BY_KEY = Object.fromEntries(GOODS.map((good) => [good.key, good.id])) as Record<string, number>;

function input(goodKey: string, amount: number): { good: number; amount: number } {
  return { good: GOOD_BY_KEY[goodKey], amount };
}

function output(goodKey: string, amount: number): { good: number; amount: number } {
  return { good: GOOD_BY_KEY[goodKey], amount };
}

const RECIPES: Recipe[] = [
  { key: 'rgo_grain', name: 'Grain Farm', building: 'rgo', inputs: [], output: output('grain', 1.6) },
  { key: 'rgo_cattle', name: 'Cattle Ranch', building: 'rgo', inputs: [], output: output('cattle', 1.3) },
  { key: 'rgo_timber', name: 'Logging Camp', building: 'rgo', inputs: [], output: output('timber', 1.2) },
  { key: 'rgo_coal', name: 'Coal Mine', building: 'rgo', inputs: [], output: output('coal', 1.1) },
  { key: 'rgo_iron', name: 'Iron Mine', building: 'rgo', inputs: [], output: output('iron', 1.0) },
  { key: 'rgo_cotton', name: 'Cotton Plantation', building: 'rgo', inputs: [], output: output('cotton', 1.4) },
  {
    key: 'factory_fabric',
    name: 'Fabric Mill',
    building: 'factory',
    inputs: [input('cotton', 1.2)],
    output: output('fabric', 1.1),
  },
  {
    key: 'factory_steel',
    name: 'Steel Mill',
    building: 'factory',
    inputs: [input('coal', 1.0), input('iron', 1.0)],
    output: output('steel', 1.2),
  },
  {
    key: 'factory_small_arms',
    name: 'Arms Factory',
    building: 'factory',
    inputs: [input('steel', 1.0)],
    output: output('small_arms', 0.9),
  },
  {
    key: 'factory_cannery',
    name: 'Cannery',
    building: 'factory',
    inputs: [input('cattle', 0.8), input('grain', 0.7)],
    output: output('canned_food', 1.0),
  },
];

export const GAME_DATA: GameData = {
  startDate: { year: 1836, month: 1, day: 1 },
  goods: GOODS,
  recipes: RECIPES,
  cultures: [
    { key: 'british', name: 'British', color: [170, 170, 190] },
    { key: 'french', name: 'French', color: [142, 164, 196] },
    { key: 'north_german', name: 'North German', color: [160, 160, 170] },
    { key: 'south_german', name: 'South German', color: [174, 154, 136] },
    { key: 'russian', name: 'Russian', color: [156, 142, 174] },
    { key: 'yankee', name: 'Yankee', color: [156, 176, 178] },
    { key: 'han', name: 'Han', color: [176, 164, 132] },
    { key: 'turkish', name: 'Turkish', color: [168, 148, 132] },
  ],
  religions: [
    { key: 'protestant', name: 'Protestant' },
    { key: 'catholic', name: 'Catholic' },
    { key: 'orthodox', name: 'Orthodox' },
    { key: 'sunni', name: 'Sunni' },
    { key: 'confucian', name: 'Confucian' },
  ],
  reforms: [
    {
      key: 'army_professionalism',
      category: 'military',
      name: 'Army Professionalism',
      options: [
        { key: 'levy_army', name: 'Levy Army', effects: ['Small standing force'] },
        { key: 'professional_army', name: 'Professional Army', effects: ['Higher organization'] },
        { key: 'mass_conscription', name: 'Mass Conscription', effects: ['Large mobilization pool'] },
      ],
    },
    {
      key: 'press_rights',
      category: 'political',
      name: 'Press Rights',
      options: [
        { key: 'state_press', name: 'State Press', effects: ['Lower consciousness gain'] },
        { key: 'censored_press', name: 'Censored Press', effects: ['Moderate plurality'] },
        { key: 'free_press', name: 'Free Press', effects: ['Higher plurality'] },
      ],
    },
    {
      key: 'trade_policy',
      category: 'economic',
      name: 'Trade Policy',
      options: [
        { key: 'mercantilism', name: 'Mercantilism', effects: ['Tariff-friendly economy'] },
        { key: 'interventionism', name: 'Interventionism', effects: ['Balanced state role'] },
        { key: 'laissez_faire', name: 'Laissez-faire', effects: ['Private capital emphasis'] },
      ],
    },
    {
      key: 'school_system',
      category: 'social',
      name: 'School System',
      options: [
        { key: 'none', name: 'No Schools', effects: ['Slow literacy growth'] },
        { key: 'basic', name: 'Basic Schools', effects: ['Moderate literacy growth'] },
        { key: 'public', name: 'Public Schools', effects: ['Strong literacy growth'] },
      ],
    },
    {
      key: 'healthcare',
      category: 'social',
      name: 'Healthcare',
      options: [
        { key: 'none', name: 'No Healthcare', effects: ['Base pop growth'] },
        { key: 'charity', name: 'Charity Hospitals', effects: ['Lower mortality'] },
        { key: 'state', name: 'State Healthcare', effects: ['Higher pop growth'] },
      ],
    },
    {
      key: 'voting_franchise',
      category: 'political',
      name: 'Voting Franchise',
      options: [
        { key: 'landed', name: 'Landed Vote', effects: ['Elite political power'] },
        { key: 'wealth', name: 'Wealth Vote', effects: ['Expanded electorate'] },
        { key: 'universal', name: 'Universal Vote', effects: ['Mass electorate'] },
      ],
    },
  ],
  techs: [
    { key: 'muzzle_loaded_rifles', name: 'Muzzle-loaded Rifles', category: 'army', cost: 8, effects: ['+Army attack'] },
    { key: 'post_napoleonic_thought', name: 'Post-Napoleonic Thought', category: 'army', cost: 9, effects: ['+Army organization'] },
    { key: 'steamers', name: 'Steamers', category: 'navy', cost: 10, effects: ['Unlock steamer hulls'] },
    { key: 'market_structure', name: 'Market Structure', category: 'commerce', cost: 8, effects: ['+Tax efficiency'] },
    { key: 'mechanical_production', name: 'Mechanical Production', category: 'industry', cost: 9, effects: ['+Factory throughput'] },
    { key: 'practical_steam_engine', name: 'Practical Steam Engine', category: 'industry', cost: 11, effects: ['+RGO throughput'] },
    { key: 'romanticism', name: 'Romanticism', category: 'culture', cost: 7, effects: ['+Prestige'] },
    { key: 'idealism', name: 'Idealism', category: 'culture', cost: 9, effects: ['+Research points'] },
  ],
  provinceCount: PROVINCE_COUNT,
};
