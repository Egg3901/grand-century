import type { FormableDefinition, GameData, GoodDef, PopNeedsDef, PopType, Recipe } from '../shared/types';
import { PROVINCE_COUNT, WORLD_SEED } from './generated';
import { INVENTIONS, TECHS } from './techs';

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
  // --- Pre-industrial crafts (E1): available from 1820 — a vintner estate or
  // --- lumber mill is not 1850s technology. Only true industrial-revolution
  // --- chains (machine parts, artillery, cement, fertilizer, ammunition)
  // --- stay tech-gated. Vic2 parity: ~11 civilian recipes at start.
  {
    key: 'factory_fishing_wharf',
    name: 'Fishing Wharf',
    building: 'factory',
    inputs: [input('timber', 0.35)], // boats and nets
    output: output('fish', 1.0),
    requiresCoastal: true,
  },
  {
    key: 'factory_vintners',
    name: 'Vintner Estate',
    building: 'factory',
    inputs: [input('grain', 0.9)],
    output: output('wine', 0.8),
  },
  {
    key: 'factory_lumber_mill',
    name: 'Lumber Mill',
    building: 'factory',
    inputs: [input('timber', 1.1)],
    output: output('lumber', 1.2),
  },
  {
    key: 'factory_furniture',
    name: 'Furniture Works',
    building: 'factory',
    inputs: [input('lumber', 1.0)],
    output: output('furniture', 0.9),
  },
  {
    key: 'factory_machine_parts',
    name: 'Machine Parts Works',
    building: 'factory',
    inputs: [input('steel', 0.9), input('coal', 0.6)],
    output: output('machine_parts', 0.7),
    requiresTech: 'industry_machine_tooling',
  },
  {
    key: 'factory_artillery',
    name: 'Artillery Foundry',
    building: 'factory',
    inputs: [input('steel', 1.1)],
    output: output('artillery', 0.7),
    requiresTech: 'industry_bessemer_steel',
  },
  // --- 0.7.0 tech-depth chains (luxury/intermediate goods; luxury demand does
  // --- not weight into needsMet, so early-game welfare stays intact).
  {
    key: 'factory_cement',
    name: 'Cement Works',
    building: 'factory',
    inputs: [input('coal', 0.8), input('iron', 0.35)],
    output: output('cement', 1.0),
    requiresTech: 'industry_early_railroads',
  },
  {
    key: 'factory_clothing',
    name: 'Clothing Mill',
    building: 'factory',
    inputs: [input('fabric', 1.0)],
    output: output('clothes', 0.95),
  },
  {
    key: 'factory_fertilizer',
    name: 'Fertilizer Works',
    building: 'factory',
    inputs: [input('coal', 0.7), input('iron', 0.4)],
    output: output('fertilizer', 1.0),
    requiresTech: 'industry_chemical_synthesis',
  },
  {
    key: 'factory_glassworks',
    name: 'Glassworks',
    building: 'factory',
    inputs: [input('coal', 0.7), input('timber', 0.4)],
    output: output('glass', 0.9),
  },
  {
    key: 'factory_paper_mill',
    name: 'Paper Mill',
    building: 'factory',
    inputs: [input('timber', 1.0)],
    output: output('paper', 1.1),
  },
  {
    key: 'factory_ammunition',
    name: 'Ammunition Works',
    building: 'factory',
    inputs: [input('iron', 0.7), input('coal', 0.45)],
    output: output('ammunition', 0.85),
    requiresTech: 'army_smokeless_powder',
  },
];

const POP_NEEDS: Record<PopType, PopNeedsDef> = {
  farmer: {
    life: [input('grain', 0.36), input('cattle', 0.2), input('fish', 0.1)],
    everyday: [input('timber', 0.08)],
    luxury: [input('furniture', 0.02), input('wine', 0.01), input('fertilizer', 0.015)],
  },
  laborer: {
    life: [input('grain', 0.35), input('cattle', 0.22), input('fish', 0.1)],
    everyday: [input('timber', 0.09)],
    luxury: [input('furniture', 0.03), input('wine', 0.01), input('clothes', 0.015)],
  },
  craftsman: {
    life: [input('grain', 0.29), input('cattle', 0.19), input('fish', 0.09)],
    everyday: [input('timber', 0.08), input('fabric', 0.05)],
    luxury: [input('furniture', 0.05), input('wine', 0.03), input('clothes', 0.03)],
  },
  clerk: {
    life: [input('grain', 0.27), input('cattle', 0.18), input('fish', 0.08)],
    everyday: [input('timber', 0.07), input('fabric', 0.06)],
    luxury: [input('furniture', 0.06), input('wine', 0.04), input('paper', 0.025), input('clothes', 0.02)],
  },
  capitalist: {
    life: [input('grain', 0.22), input('cattle', 0.14), input('fish', 0.08)],
    everyday: [input('timber', 0.07), input('fabric', 0.08)],
    luxury: [input('furniture', 0.1), input('machine_parts', 0.02), input('glass', 0.03), input('cement', 0.02)],
  },
  aristocrat: {
    life: [input('grain', 0.22), input('cattle', 0.16), input('fish', 0.08)],
    everyday: [input('timber', 0.07), input('fabric', 0.08)],
    luxury: [input('furniture', 0.11), input('artillery', 0.01), input('glass', 0.04), input('wine', 0.02)],
  },
  clergy: {
    life: [input('grain', 0.28), input('cattle', 0.18), input('fish', 0.09)],
    everyday: [input('timber', 0.07), input('fabric', 0.05)],
    luxury: [input('furniture', 0.04), input('wine', 0.02), input('paper', 0.02)],
  },
  soldier: {
    life: [input('grain', 0.36), input('cattle', 0.23), input('fish', 0.1)],
    everyday: [input('timber', 0.08), input('fabric', 0.04)],
    luxury: [input('wine', 0.02), input('canned_food', 0.03), input('ammunition', 0.02)],
  },
  officer: {
    life: [input('grain', 0.28), input('cattle', 0.18), input('fish', 0.09)],
    everyday: [input('timber', 0.07), input('fabric', 0.06)],
    luxury: [input('wine', 0.05), input('small_arms', 0.02), input('ammunition', 0.015)],
  },
  slave: {
    life: [input('grain', 0.31), input('cattle', 0.18), input('fish', 0.08)],
    everyday: [input('timber', 0.05)],
    luxury: [],
  },
};

const NATION_CORES = Object.fromEntries(
  WORLD_SEED.nations.map((nation) => [nation.tag, (nation.coreStateIds ?? []).slice().sort((a, b) => a - b)]),
) as Record<string, number[]>;

/**
 * 0.8.0: the generated seed predates the expanded culture table — patch formable
 * result cultures here rather than regenerating the baked world data.
 */
const FORMABLE_CULTURE_OVERRIDE: Record<string, string> = {
  ITALY: 'italian',
};

const FORMABLES: FormableDefinition[] = (WORLD_SEED.formables ?? []).map((formable) => ({
  key: formable.key,
  resultTag: formable.resultTag,
  resultName: formable.resultName,
  resultColor: formable.resultColor,
  resultPrimaryCulture: FORMABLE_CULTURE_OVERRIDE[formable.key] ?? formable.resultPrimaryCulture,
  candidateTags: formable.candidateTags.slice(),
  coreStateIds: formable.coreStateIds.slice().sort((a, b) => a - b),
  requiredCoreShare: formable.requiredCoreShare,
  requireIndependent: formable.requireIndependent,
  requireGreatPower: formable.requireGreatPower,
  prestigeReward: formable.prestigeReward,
}));

// ---------------------------------------------------------------------------
// 1.0-U1: unification arc fixes & content.
//
// The baked GERMANY cores wrongly included the whole Habsburg empire (Hungary,
// Croatia, Slovenia, Slovakia, Lombardy — never German Confederation members),
// which put unification behind total conquest of Austria. Cores are the German
// Confederation instead: the seven German states plus Austria proper and
// Bohemia. 0.65 share of 9 = 6 states — Prussia can unify with the minors and
// without Vienna (kleindeutsch), Austria can compete for grossdeutsch.
// ---------------------------------------------------------------------------
const GERMAN_CONFEDERATION_STATES = [27, 138, 176, 177, 178, 179, 180, 181, 182];
const NORTH_GERMAN_STATES = [178, 179, 180, 181]; // Hanover, Hesse, Prussia, Saxony

for (const formable of FORMABLES) {
  // No 1821 Germany: unification waits for the Springtime of Nations. The
  // gate shows in the Formables panel as an explicit era requirement.
  if (formable.key === 'GERMANY' || formable.key === 'ITALY') formable.yearAtLeast = 1848;
  if (formable.key === 'ITALY' && !formable.coreStateIds.includes(274)) {
    // U2: the Risorgimento runs through Austrian Lombardy-Venetia. 6 of 7
    // cores — take Lombardy from Vienna, or unite every last minor.
    formable.coreStateIds.push(274);
    formable.coreStateIds.sort((a, b) => a - b);
  }
  if (formable.key !== 'GERMANY') continue;
  formable.coreStateIds = GERMAN_CONFEDERATION_STATES.slice();
  if (!formable.candidateTags.includes('NGF')) formable.candidateTags.push('NGF');
}

// The historical stepping stone: Prussia unites the states north of the Main
// first. Optional — a strong Prussia may skip straight to Germany — but it
// pays prestige early and marks the arc's midpoint.
FORMABLES.push({
  key: 'NORTH_GERMAN_CONFEDERATION',
  resultTag: 'NGF',
  resultName: 'North German Confederation',
  resultColor: [70, 74, 86],
  resultPrimaryCulture: 'north_german',
  candidateTags: ['PRU'],
  coreStateIds: NORTH_GERMAN_STATES.slice(),
  yearAtLeast: 1848,
  requiredCoreShare: 1,
  requireIndependent: true,
  requireGreatPower: true,
  prestigeReward: 30,
});

export const GAME_DATA: GameData = {
  startDate: { year: 1820, month: 1, day: 1 },
  goods: GOODS,
  recipes: RECIPES,
  popNeeds: POP_NEEDS,
  // 0.8.0: the original 8 cultures MUST keep their indices (pops store culture
  // as an index and saves bake it in) — new cultures are appended only.
  cultures: [
    { key: 'british', name: 'British', color: [170, 170, 190], religion: 'protestant' },
    { key: 'french', name: 'French', color: [142, 164, 196], religion: 'catholic' },
    { key: 'north_german', name: 'North German', color: [160, 160, 170], religion: 'protestant' },
    { key: 'south_german', name: 'South German', color: [174, 154, 136], religion: 'catholic' },
    { key: 'russian', name: 'Russian', color: [156, 142, 174], religion: 'orthodox' },
    { key: 'yankee', name: 'Yankee', color: [156, 176, 178], religion: 'protestant' },
    { key: 'han', name: 'Han', color: [176, 164, 132], religion: 'confucian' },
    { key: 'turkish', name: 'Turkish', color: [168, 148, 132], religion: 'sunni' },
    // --- 0.8.0 Age of Nationalism additions (append-only) ---
    { key: 'irish', name: 'Irish', color: [110, 158, 110], religion: 'catholic' },
    { key: 'polish', name: 'Polish', color: [188, 146, 152], religion: 'catholic' },
    { key: 'hungarian', name: 'Hungarian', color: [148, 176, 138], religion: 'catholic' },
    { key: 'czech', name: 'Czech', color: [164, 148, 118], religion: 'catholic' },
    { key: 'italian', name: 'Italian', color: [150, 178, 156], religion: 'catholic' },
    { key: 'south_slavic', name: 'South Slavic', color: [138, 152, 178], religion: 'orthodox' },
    { key: 'greek', name: 'Greek', color: [132, 168, 188], religion: 'orthodox' },
    { key: 'romanian', name: 'Romanian', color: [182, 168, 128], religion: 'orthodox' },
    { key: 'ukrainian', name: 'Ukrainian', color: [178, 178, 128], religion: 'orthodox' },
    { key: 'baltic', name: 'Baltic', color: [146, 170, 168], religion: 'protestant' },
    { key: 'finnish', name: 'Finnish', color: [160, 184, 184], religion: 'protestant' },
    { key: 'scandinavian', name: 'Scandinavian', color: [152, 168, 190], religion: 'protestant' },
    { key: 'iberian', name: 'Iberian', color: [190, 160, 120], religion: 'catholic' },
    { key: 'caucasian', name: 'Caucasian', color: [172, 146, 146], religion: 'orthodox' },
    { key: 'central_asian', name: 'Central Asian', color: [188, 172, 144], religion: 'sunni' },
    { key: 'arabic', name: 'Arabic', color: [178, 162, 116], religion: 'sunni' },
    { key: 'persian', name: 'Persian', color: [166, 150, 168], religion: 'sunni' },
    { key: 'south_asian', name: 'South Asian', color: [192, 156, 128], religion: 'hindu' },
    { key: 'malay', name: 'Malay', color: [150, 172, 146], religion: 'sunni' },
    { key: 'indochinese', name: 'Indochinese', color: [168, 180, 144], religion: 'buddhist' },
    { key: 'japanese', name: 'Japanese', color: [186, 158, 158], religion: 'buddhist' },
    { key: 'korean', name: 'Korean', color: [162, 174, 162], religion: 'confucian' },
    { key: 'latin_american', name: 'Latin American', color: [178, 170, 140], religion: 'catholic' },
    { key: 'african', name: 'African', color: [158, 146, 122], religion: 'sunni' },
  ],
  religions: [
    { key: 'protestant', name: 'Protestant' },
    { key: 'catholic', name: 'Catholic' },
    { key: 'orthodox', name: 'Orthodox' },
    { key: 'sunni', name: 'Sunni' },
    { key: 'confucian', name: 'Confucian' },
    // --- 0.8.0 additions (append-only; indices are baked into saves) ---
    { key: 'hindu', name: 'Hindu' },
    { key: 'buddhist', name: 'Buddhist' },
  ],
  reforms: [
    {
      key: 'economic_policy',
      category: 'economic',
      name: 'Economic Policy',
      options: [
        { key: 'traditionalism', name: 'Traditionalism', effects: ['State and estates dominate investment'] },
        { key: 'interventionism', name: 'Interventionism', effects: ['State can guide private industry'] },
        { key: 'laissez_faire', name: 'Laissez-faire', effects: ['Capitalists drive construction and trade'] },
        { key: 'state_capitalism', name: 'State Capitalism', effects: ['State plans heavy strategic industry'] },
      ],
    },
    {
      key: 'trade_policy',
      category: 'economic',
      name: 'Trade Policy',
      options: [
        { key: 'protectionism', name: 'Protectionism', effects: ['High tariff shelter for domestic producers'] },
        { key: 'mercantilism', name: 'Mercantilism', effects: ['Export-focused crown and merchant privileges'] },
        { key: 'balanced_trade', name: 'Balanced Trade', effects: ['Moderate tariffs and mixed openness'] },
        { key: 'free_trade', name: 'Free Trade', effects: ['Low tariffs and wider import access'] },
      ],
    },
    {
      key: 'voting_franchise',
      category: 'political',
      name: 'Voting Franchise',
      options: [
        { key: 'none', name: 'No Franchise', effects: ['Politics remains estate-controlled'] },
        { key: 'landed', name: 'Landed Vote', effects: ['Nobility and officers dominate parliament'] },
        { key: 'wealth', name: 'Wealth Vote', effects: ['Taxpaying middle strata gain ballots'] },
        { key: 'universal', name: 'Universal Vote', effects: ['Mass electorate reshapes party politics'] },
      ],
    },
    {
      key: 'upper_house_composition',
      category: 'political',
      name: 'Upper House Composition',
      options: [
        { key: 'appointed', name: 'Appointed Chamber', effects: ['Sticky UH; slow drift; appointed authoritarian bias'] },
        { key: 'estate_weighted', name: 'Estate Weighted', effects: ['Mostly sticky UH; mild election influence'] },
        { key: 'mixed', name: 'Mixed Chamber', effects: ['Balanced election blend and monthly drift'] },
        { key: 'proportional', name: 'Proportional Chamber', effects: ['UH tracks ideology votes and pop ideology faster'] },
      ],
    },
    {
      key: 'press_rights',
      category: 'political',
      name: 'Press Rights',
      options: [
        { key: 'state_press', name: 'State Press', effects: ['Low pluralism and strong censorship'] },
        { key: 'censored_press', name: 'Censored Press', effects: ['Limited criticism tolerated'] },
        { key: 'licensed_press', name: 'Licensed Press', effects: ['Opposition papers can circulate'] },
        { key: 'free_press', name: 'Free Press', effects: ['Rapid consciousness and issue diffusion'] },
      ],
    },
    {
      key: 'school_system',
      category: 'social',
      name: 'School System',
      options: [
        { key: 'none', name: 'No Schools', effects: ['Literacy rises only through clergy effort'] },
        { key: 'parish', name: 'Parish Schools', effects: ['Religious schooling raises basic literacy'] },
        { key: 'public', name: 'Public Schools', effects: ['State-funded mass education'] },
        { key: 'compulsory', name: 'Compulsory Schools', effects: ['Fast literacy and consciousness growth'] },
      ],
    },
    {
      key: 'healthcare',
      category: 'social',
      name: 'Healthcare',
      options: [
        { key: 'none', name: 'No Healthcare', effects: ['Base pop growth'] },
        { key: 'charity', name: 'Charity Hospitals', effects: ['Lower mortality for urban poor'] },
        { key: 'regional', name: 'Regional Clinics', effects: ['Nationwide lower mortality'] },
        { key: 'state', name: 'State Healthcare', effects: ['Highest sustained pop growth'] },
      ],
    },
    {
      key: 'pension_system',
      category: 'social',
      name: 'Pension System',
      options: [
        { key: 'none', name: 'No Pensions', effects: ['No monthly militancy relief for workers'] },
        { key: 'guild', name: 'Guild Pensions', effects: ['−0.018 mil/mo for farmer/laborer/craftsman'] },
        { key: 'state', name: 'State Pensions', effects: ['−0.035 mil/mo for farmer/laborer/craftsman'] },
        { key: 'comprehensive', name: 'Comprehensive Pensions', effects: ['−0.055 mil/mo for farmer/laborer/craftsman'] },
      ],
    },
    {
      key: 'labor_safety',
      category: 'social',
      name: 'Labor Safety',
      options: [
        { key: 'none', name: 'No Safety Code', effects: ['No workplace militancy relief'] },
        { key: 'basic', name: 'Basic Safety Code', effects: ['−0.012 mil/mo laborer/craftsman (−0.004 farmer)'] },
        { key: 'inspectorate', name: 'Inspectorate', effects: ['−0.028 mil/mo laborer/craftsman (−0.010 farmer)'] },
        { key: 'modern_code', name: 'Modern Safety Code', effects: ['−0.045 mil/mo laborer/craftsman (−0.016 farmer)'] },
      ],
    },
    {
      key: 'conscription_level',
      category: 'military',
      name: 'Conscription Level',
      options: [
        { key: 'volunteer_only', name: 'Volunteer Army', effects: ['Small standing cap, tiny mobilization pool'] },
        { key: 'short_service', name: 'Short Service', effects: ['Moderate regiment support and reserve pool'] },
        { key: 'national_service', name: 'National Service', effects: ['Large reserve mobilization potential'] },
        { key: 'mass_conscription', name: 'Mass Conscription', effects: ['Maximum regiment support and mobilization'] },
      ],
    },
    {
      key: 'army_professionalism',
      category: 'military',
      name: 'Army Professionalism',
      options: [
        { key: 'levy_army', name: 'Levy Army', effects: ['Low organization and morale baseline'] },
        { key: 'standing_army', name: 'Standing Army', effects: ['Balanced regular training'] },
        { key: 'professional_army', name: 'Professional Army', effects: ['High organization and discipline'] },
        { key: 'general_staff', name: 'General Staff Doctrine', effects: ['Top-tier organization and morale'] },
      ],
    },
  ],
  techs: TECHS,
  inventions: INVENTIONS,
  provinceCount: PROVINCE_COUNT,
  nationCores: NATION_CORES,
  formables: FORMABLES,
};
