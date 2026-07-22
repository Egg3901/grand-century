/**
 * Curated narrative events for E4. Pure data — evaluated by src/sim/systems/events.ts.
 */
import type { EventDef } from '../shared/types';

export const EVENT_DEFS: EventDef[] = [
  // --- Historical / thematic setpiece ---
  {
    id: 'springtime_of_nations',
    title: 'Springtime of Nations',
    description:
      'Liberal and national agitators fill the streets. Pamphlets demand constitutions, suffrage, and national rebirth. The cabinet awaits your word.',
    trigger: {
      yearAtLeast: 1848,
      yearAtMost: 1852,
      minMilitancy: 3.2,
      isCivilized: true,
    },
    mtthMonths: 4,
    weight: 2.4,
    once: true,
    choices: [
      {
        id: 'suppress',
        label: 'Crush the demonstrations',
        description: 'Deploy troops and censors. Order at a price.',
        effects: [
          { t: 'treasury', amount: -180 },
          { t: 'prestige', amount: -8 },
          { t: 'militancy', amount: 1.4 },
          { t: 'consciousness', amount: -0.4 },
          { t: 'unrest', amount: 0.18 },
        ],
        aiWeight: 35,
      },
      {
        id: 'concede',
        label: 'Concede liberal reforms',
        description: 'Expand the franchise and ease the press.',
        effects: [
          { t: 'reformLevel', reform: 'voting_franchise', delta: 1 },
          { t: 'reformLevel', reform: 'press_rights', delta: 1 },
          { t: 'prestige', amount: -12 },
          { t: 'militancy', amount: -1.8 },
          { t: 'consciousness', amount: 0.8 },
          { t: 'treasury', amount: -90 },
        ],
        aiWeight: 55,
      },
      {
        id: 'bargain',
        label: 'Bargain with notables',
        description: 'Buy calm with pensions and limited press liberties.',
        effects: [
          { t: 'treasury', amount: -240 },
          { t: 'reformLevel', reform: 'press_rights', delta: 1 },
          { t: 'militancy', amount: -0.9 },
          { t: 'prestige', amount: 4 },
        ],
        aiWeight: 45,
      },
    ],
  },

  // --- Economic panics ---
  {
    id: 'market_panic',
    title: 'Market Panic',
    description:
      'Credit freezes and brokers flee the exchange. Grain and cotton prices swing wildly as confidence collapses.',
    trigger: { isCivilized: true, minTreasury: 80 },
    mtthMonths: 160,
    once: false,
    cooldownMonths: 96,
    choices: [
      {
        id: 'bailout',
        label: 'Bail out the houses',
        description: 'Treasury guarantees restore liquidity.',
        effects: [
          { t: 'treasury', amount: -280 },
          { t: 'prestige', amount: 6 },
          { t: 'militancy', amount: -0.3 },
          { t: 'modifyGoodPrice', goodKey: 'cotton', factor: 0.92 },
        ],
        requirements: [{ t: 'minTreasury', value: 200 }],
        aiWeight: 50,
      },
      {
        id: 'let_fail',
        label: 'Let the weak fail',
        description: 'Creative destruction — and ruined depositors.',
        effects: [
          { t: 'prestige', amount: -10 },
          { t: 'militancy', amount: 0.9 },
          { t: 'modifyGoodPrice', goodKey: 'cotton', factor: 0.7 },
          { t: 'modifyGoodPrice', goodKey: 'grain', factor: 0.85 },
          { t: 'unrest', amount: 0.12 },
        ],
        aiWeight: 30,
      },
      {
        id: 'tariffs',
        label: 'Raise emergency tariffs',
        description: 'Shield domestic industry while the storm passes.',
        effects: [
          { t: 'treasury', amount: 60 },
          { t: 'relationsWithGps', amount: -12 },
          { t: 'militancy', amount: 0.35 },
          { t: 'modifyGoodPrice', goodKey: 'fabric', factor: 1.15 },
        ],
        aiWeight: 40,
      },
    ],
  },
  {
    id: 'great_depression_scare',
    title: 'Industrial Depression',
    description:
      'Factory orders dry up. Coal yards and steel mills idle while craftsmen gather outside closed gates.',
    trigger: { isCivilized: true, minFactoryCount: 2, maxAvgNeedsMet: 0.72 },
    mtthMonths: 180,
    once: false,
    cooldownMonths: 120,
    choices: [
      {
        id: 'public_works',
        label: 'Fund public works',
        effects: [
          { t: 'treasury', amount: -220 },
          { t: 'militancy', amount: -0.7 },
          { t: 'boostFactories', levels: 1 },
          { t: 'prestige', amount: 5 },
        ],
        requirements: [{ t: 'minTreasury', value: 200 }],
        aiWeight: 55,
      },
      {
        id: 'austerity',
        label: 'Impose austerity',
        effects: [
          { t: 'treasury', amount: 80 },
          { t: 'militancy', amount: 1.1 },
          { t: 'prestige', amount: -6 },
          { t: 'unrest', amount: 0.15 },
        ],
        aiWeight: 25,
      },
      {
        id: 'subsidize',
        label: 'Subsidize key mills',
        effects: [
          { t: 'treasury', amount: -120 },
          { t: 'modifyGoodStockpile', goodKey: 'steel', amount: 40 },
          { t: 'militancy', amount: -0.25 },
        ],
        aiWeight: 45,
      },
    ],
  },

  // --- Colonial scramble ---
  {
    id: 'colonial_scramble',
    title: 'Colonial Opportunity',
    description:
      'Explorers and merchants press for a flag to follow into unclaimed hinterlands. A timely claim could reshape the map.',
    trigger: {
      yearAtLeast: 1840,
      isGreatPower: true,
      hasUncolonizedAdjacent: true,
      isCivilized: true,
    },
    mtthMonths: 72,
    once: false,
    cooldownMonths: 48,
    choices: [
      {
        id: 'plant_flag',
        label: 'Authorize an expedition',
        effects: [
          { t: 'treasury', amount: -200 },
          { t: 'colonialPoints', amount: 25 },
          { t: 'grantColonialClaim' },
          { t: 'prestige', amount: 8 },
          { t: 'infamy', amount: 1.5 },
        ],
        requirements: [{ t: 'minTreasury', value: 150 }],
        aiWeight: 60,
      },
      {
        id: 'charter_company',
        label: 'Charter a trading company',
        effects: [
          { t: 'treasury', amount: -80 },
          { t: 'colonialPoints', amount: 12 },
          { t: 'prestige', amount: 3 },
        ],
        aiWeight: 45,
      },
      {
        id: 'decline',
        label: 'Decline the venture',
        effects: [
          { t: 'prestige', amount: -4 },
          { t: 'relationsWithGps', amount: 4 },
        ],
        aiWeight: 20,
      },
    ],
  },
  {
    id: 'colonial_rivalry_flare',
    title: 'Colonial Rivalry',
    description:
      'A rival power contests your coastal stations. Gunboats idle while diplomats sharpen their notes.',
    trigger: { yearAtLeast: 1845, isGreatPower: true, isCivilized: true },
    mtthMonths: 100,
    once: false,
    cooldownMonths: 60,
    choices: [
      {
        id: 'stand_firm',
        label: 'Stand firm',
        effects: [
          { t: 'prestige', amount: 10 },
          { t: 'infamy', amount: 2 },
          { t: 'relationsWithGps', amount: -15 },
          { t: 'treasury', amount: -60 },
        ],
        aiWeight: 50,
      },
      {
        id: 'compromise',
        label: 'Seek a compromise',
        effects: [
          { t: 'prestige', amount: -3 },
          { t: 'relationsWithGps', amount: 8 },
          { t: 'colonialPoints', amount: -5 },
        ],
        aiWeight: 45,
      },
    ],
  },

  // --- Subsistence crisis ---
  {
    id: 'potato_famine',
    title: 'Subsistence Crisis',
    description:
      'Blight and failed harvests empty the granaries. Rural laboring classes starve while landlords demand rents.',
    trigger: { maxAvgNeedsMet: 0.55, isCivilized: true },
    mtthMonths: 80,
    once: false,
    cooldownMonths: 72,
    choices: [
      {
        id: 'relief',
        label: 'Organize grain relief',
        effects: [
          { t: 'treasury', amount: -280 },
          { t: 'militancy', amount: -1.2 },
          { t: 'modifyGoodStockpile', goodKey: 'grain', amount: -30 },
          { t: 'prestige', amount: 4 },
        ],
        requirements: [{ t: 'minTreasury', value: 120 }],
        aiWeight: 55,
      },
      {
        id: 'export_ban',
        label: 'Ban food exports',
        effects: [
          { t: 'modifyGoodPrice', goodKey: 'grain', factor: 0.8 },
          { t: 'relationsWithGps', amount: -8 },
          { t: 'militancy', amount: -0.5 },
          { t: 'treasury', amount: -40 },
        ],
        aiWeight: 40,
      },
      {
        id: 'laissez_faire',
        label: 'Trust the market',
        effects: [
          { t: 'militancy', amount: 1.6 },
          { t: 'unrest', amount: 0.22 },
          { t: 'prestige', amount: -8 },
          { t: 'spawnRebels' },
        ],
        aiWeight: 15,
      },
    ],
  },

  // --- Succession / leadership ---
  {
    id: 'succession_crisis',
    title: 'Succession Question',
    description:
      'The throne\'s next heir is contested. Court factions, foreign courts, and the army all watch for weakness.',
    trigger: {
      isCivilized: true,
      yearAtLeast: 1837,
    },
    mtthMonths: 140,
    once: false,
    cooldownMonths: 120,
    choices: [
      {
        id: 'named_heir',
        label: 'Proclaim a clear heir',
        effects: [
          { t: 'prestige', amount: 8 },
          { t: 'militancy', amount: -0.4 },
          { t: 'treasury', amount: -50 },
        ],
        aiWeight: 55,
      },
      {
        id: 'regency',
        label: 'Install a cautious regency',
        effects: [
          { t: 'prestige', amount: -2 },
          { t: 'consciousness', amount: 0.3 },
          { t: 'researchPoints', amount: 4 },
        ],
        aiWeight: 40,
      },
      {
        id: 'purge',
        label: 'Purge rival claimants',
        effects: [
          { t: 'infamy', amount: 3 },
          { t: 'militancy', amount: 0.8 },
          { t: 'prestige', amount: 5 },
          { t: 'unrest', amount: 0.1 },
        ],
        aiWeight: 25,
      },
    ],
  },
  {
    id: 'brilliant_minister',
    title: 'A Brilliant Minister',
    description:
      'A gifted administrator offers to overhaul the ministries — if granted a free hand and a generous stipend.',
    trigger: { isCivilized: true },
    mtthMonths: 110,
    once: false,
    cooldownMonths: 90,
    choices: [
      {
        id: 'appoint',
        label: 'Appoint with full powers',
        effects: [
          { t: 'treasury', amount: -100 },
          { t: 'researchPoints', amount: 12 },
          { t: 'literacy', amount: 0.015 },
          { t: 'prestige', amount: 6 },
        ],
        aiWeight: 60,
      },
      {
        id: 'restrain',
        label: 'Keep him on a short leash',
        effects: [
          { t: 'researchPoints', amount: 4 },
          { t: 'prestige', amount: 2 },
        ],
        aiWeight: 40,
      },
      {
        id: 'refuse',
        label: 'Refuse the upstart',
        effects: [{ t: 'prestige', amount: -3 }],
        aiWeight: 15,
      },
    ],
  },

  // --- Resource discoveries ---
  {
    id: 'coal_discovery',
    title: 'Coal Seam Discovered',
    description: 'Surveyors report a rich coal seam beneath provincial hills. Capitalists already form syndicates.',
    trigger: { isCivilized: true },
    mtthMonths: 100,
    once: false,
    cooldownMonths: 80,
    choices: [
      {
        id: 'develop',
        label: 'Fund development',
        effects: [
          { t: 'treasury', amount: -160 },
          { t: 'boostRgo', goodKey: 'coal', levels: 2 },
          { t: 'modifyGoodStockpile', goodKey: 'coal', amount: 50 },
          { t: 'prestige', amount: 4 },
        ],
        requirements: [{ t: 'minTreasury', value: 80 }],
        aiWeight: 65,
      },
      {
        id: 'lease',
        label: 'Lease to private interests',
        effects: [
          { t: 'treasury', amount: 90 },
          { t: 'boostRgo', goodKey: 'coal', levels: 1 },
          { t: 'militancy', amount: 0.2 },
        ],
        aiWeight: 45,
      },
    ],
  },
  {
    id: 'iron_discovery',
    title: 'Iron Ore Strike',
    description: 'Deep iron deposits promise steel for rails and rifles — if the crown invests.',
    trigger: { isCivilized: true },
    mtthMonths: 110,
    once: false,
    cooldownMonths: 90,
    choices: [
      {
        id: 'state_mines',
        label: 'Open state mines',
        effects: [
          { t: 'treasury', amount: -200 },
          { t: 'boostRgo', goodKey: 'iron', levels: 2 },
          { t: 'researchPoints', amount: 3 },
        ],
        requirements: [{ t: 'minTreasury', value: 100 }],
        aiWeight: 55,
      },
      {
        id: 'ignore',
        label: 'Leave it buried',
        effects: [{ t: 'prestige', amount: -2 }],
        aiWeight: 10,
      },
    ],
  },
  {
    id: 'gold_rush',
    title: 'Gold Rush',
    description: 'Prospectors flood a distant district. Instant fortune — and instant disorder.',
    trigger: { yearAtLeast: 1849 },
    mtthMonths: 130,
    once: false,
    cooldownMonths: 100,
    choices: [
      {
        id: 'regulate',
        label: 'Regulate the diggings',
        effects: [
          { t: 'treasury', amount: 180 },
          { t: 'militancy', amount: 0.5 },
          { t: 'unrest', amount: 0.08 },
          { t: 'prestige', amount: 5 },
        ],
        aiWeight: 50,
      },
      {
        id: 'free_for_all',
        label: 'Let the rush run wild',
        effects: [
          { t: 'treasury', amount: 320 },
          { t: 'militancy', amount: 1.2 },
          { t: 'spawnRebels' },
        ],
        aiWeight: 30,
      },
    ],
  },

  // --- Labor unrest ---
  {
    id: 'labor_unrest',
    title: 'Labor Unrest',
    description:
      'Factory hands strike for shorter hours and safer machines. Owners demand bayonets; clergy urge mediation.',
    trigger: { minFactoryCount: 1, minMilitancy: 2.5, isCivilized: true },
    mtthMonths: 70,
    once: false,
    cooldownMonths: 48,
    choices: [
      {
        id: 'break_strike',
        label: 'Break the strike',
        effects: [
          { t: 'militancy', amount: 1.0 },
          { t: 'prestige', amount: -4 },
          { t: 'unrest', amount: 0.14 },
          { t: 'treasury', amount: 40 },
        ],
        aiWeight: 30,
      },
      {
        id: 'safety_code',
        label: 'Enact a safety code',
        effects: [
          { t: 'reformLevel', reform: 'labor_safety', delta: 1 },
          { t: 'treasury', amount: -120 },
          { t: 'militancy', amount: -1.0 },
          { t: 'prestige', amount: 3 },
        ],
        aiWeight: 60,
      },
      {
        id: 'negotiate',
        label: 'Negotiate quietly',
        effects: [
          { t: 'treasury', amount: -70 },
          { t: 'militancy', amount: -0.45 },
          { t: 'consciousness', amount: 0.35 },
        ],
        aiWeight: 50,
      },
    ],
  },

  // --- Nationalism / formables ---
  {
    id: 'national_awakening',
    title: 'National Awakening',
    description:
      'Poets, professors, and officers speak of a greater nation. Core provinces stir with maps of a future union.',
    trigger: { hasFormableCandidate: true, minLiteracy: 0.25, isCivilized: true },
    mtthMonths: 90,
    once: false,
    cooldownMonths: 60,
    choices: [
      {
        id: 'embrace',
        label: 'Embrace the national cause',
        effects: [
          { t: 'prestige', amount: 12 },
          { t: 'consciousness', amount: 0.7 },
          { t: 'militancy', amount: 0.35 },
          { t: 'researchPoints', amount: 5 },
        ],
        aiWeight: 60,
      },
      {
        id: 'suppress_nationalism',
        label: 'Suppress national societies',
        effects: [
          { t: 'militancy', amount: 0.9 },
          { t: 'prestige', amount: -6 },
          { t: 'consciousness', amount: -0.3 },
          { t: 'unrest', amount: 0.1 },
        ],
        aiWeight: 25,
      },
      {
        id: 'cultural_patronage',
        label: 'Patronize cultural societies',
        effects: [
          { t: 'treasury', amount: -90 },
          { t: 'prestige', amount: 7 },
          { t: 'literacy', amount: 0.01 },
          { t: 'militancy', amount: -0.2 },
        ],
        aiWeight: 50,
      },
    ],
  },
  {
    id: 'irredentist_agitation',
    title: 'Irredentist Agitation',
    description:
      'Agitators demand recovery of "unredeemed" core lands. Border garrisons report restless volunteers.',
    trigger: { hasFormableCandidate: true, minMilitancy: 2.0 },
    mtthMonths: 100,
    once: false,
    cooldownMonths: 70,
    choices: [
      {
        id: 'fund_propaganda',
        label: 'Fund propaganda abroad',
        effects: [
          { t: 'treasury', amount: -110 },
          { t: 'prestige', amount: 6 },
          { t: 'infamy', amount: 1 },
          { t: 'relationsWithGps', amount: -6 },
        ],
        aiWeight: 45,
      },
      {
        id: 'calm_rhetoric',
        label: 'Calm the rhetoric',
        effects: [
          { t: 'militancy', amount: -0.5 },
          { t: 'prestige', amount: -4 },
        ],
        aiWeight: 40,
      },
    ],
  },

  // --- Reform agitation ---
  {
    id: 'reform_petition',
    title: 'Great Reform Petition',
    description:
      'A petition with tens of thousands of signatures demands political modernization. Ignoring it risks the streets.',
    trigger: { minMilitancy: 2.8, isCivilized: true, yearAtLeast: 1838 },
    mtthMonths: 85,
    once: false,
    cooldownMonths: 55,
    choices: [
      {
        id: 'accept_petition',
        label: 'Accept key demands',
        effects: [
          { t: 'reformLevel', reform: 'upper_house_composition', delta: 1 },
          { t: 'militancy', amount: -1.1 },
          { t: 'prestige', amount: -5 },
          { t: 'treasury', amount: -60 },
        ],
        aiWeight: 50,
      },
      {
        id: 'table_it',
        label: 'Table the petition',
        effects: [
          { t: 'militancy', amount: 0.7 },
          { t: 'consciousness', amount: 0.5 },
          { t: 'unrest', amount: 0.08 },
        ],
        aiWeight: 30,
      },
      {
        id: 'arrest_leaders',
        label: 'Arrest the organizers',
        effects: [
          { t: 'militancy', amount: 1.3 },
          { t: 'spawnRebels' },
          { t: 'prestige', amount: -3 },
        ],
        aiWeight: 20,
      },
    ],
  },
  {
    id: 'education_drive',
    title: 'Education Reform Drive',
    description: 'Clergy and liberals clash over who should teach the nation\'s children.',
    trigger: { isCivilized: true, maxLiteracy: 0.55 },
    mtthMonths: 95,
    once: false,
    cooldownMonths: 70,
    choices: [
      {
        id: 'public_schools',
        label: 'Expand public schools',
        effects: [
          { t: 'reformLevel', reform: 'school_system', delta: 1 },
          { t: 'treasury', amount: -150 },
          { t: 'literacy', amount: 0.025 },
          { t: 'consciousness', amount: 0.4 },
        ],
        aiWeight: 55,
      },
      {
        id: 'parish_only',
        label: 'Leave schooling to the parish',
        effects: [
          { t: 'literacy', amount: 0.008 },
          { t: 'militancy', amount: -0.15 },
          { t: 'prestige', amount: -2 },
        ],
        aiWeight: 35,
      },
    ],
  },

  // --- Misc flavor with teeth ---
  {
    id: 'naval_review',
    title: 'Grand Naval Review',
    description: 'Admirals propose a glittering review to awe rivals — and justify a new construction slate.',
    trigger: { isGreatPower: true, isCivilized: true },
    mtthMonths: 120,
    once: false,
    cooldownMonths: 90,
    choices: [
      {
        id: 'splendid',
        label: 'Host a splendid review',
        effects: [
          { t: 'treasury', amount: -220 },
          { t: 'prestige', amount: 14 },
          { t: 'relationsWithGps', amount: 5 },
        ],
        requirements: [{ t: 'minTreasury', value: 150 }],
        aiWeight: 55,
      },
      {
        id: 'modest',
        label: 'A modest parade',
        effects: [
          { t: 'treasury', amount: -60 },
          { t: 'prestige', amount: 5 },
        ],
        aiWeight: 40,
      },
      {
        id: 'cancel',
        label: 'Cancel as wasteful',
        effects: [
          { t: 'prestige', amount: -6 },
          { t: 'militancy', amount: -0.1 },
        ],
        aiWeight: 20,
      },
    ],
  },
  {
    id: 'border_incident',
    title: 'Border Incident',
    description: 'Shots exchanged along a disputed frontier. Newspapers demand satisfaction.',
    trigger: { isCivilized: true, yearAtLeast: 1820 },
    mtthMonths: 90,
    once: false,
    cooldownMonths: 60,
    choices: [
      {
        id: 'mobilize_reply',
        label: 'Mobilize a reply',
        effects: [
          { t: 'treasury', amount: -140 },
          { t: 'prestige', amount: 8 },
          { t: 'infamy', amount: 1.5 },
          { t: 'relationsWithGps', amount: -10 },
        ],
        aiWeight: 40,
      },
      {
        id: 'diplomatic_note',
        label: 'Send a stiff note',
        effects: [
          { t: 'prestige', amount: 2 },
          { t: 'relationsWithGps', amount: -3 },
        ],
        aiWeight: 55,
      },
      {
        id: 'climb_down',
        label: 'Climb down quietly',
        effects: [
          { t: 'prestige', amount: -8 },
          { t: 'militancy', amount: 0.3 },
          { t: 'relationsWithGps', amount: 6 },
        ],
        aiWeight: 25,
      },
    ],
  },
  {
    id: 'scientific_expedition',
    title: 'Scientific Expedition',
    description: 'Scholars seek crown patronage for a voyage of discovery and cataloguing.',
    trigger: { isCivilized: true, minLiteracy: 0.2 },
    mtthMonths: 100,
    once: false,
    cooldownMonths: 80,
    choices: [
      {
        id: 'fund',
        label: 'Fund the expedition',
        effects: [
          { t: 'treasury', amount: -130 },
          { t: 'researchPoints', amount: 10 },
          { t: 'prestige', amount: 7 },
          { t: 'literacy', amount: 0.008 },
        ],
        requirements: [{ t: 'minTreasury', value: 80 }],
        aiWeight: 55,
      },
      {
        id: 'decline_science',
        label: 'Decline politely',
        effects: [{ t: 'prestige', amount: -2 }],
        aiWeight: 20,
      },
    ],
  },
  {
    id: 'religious_revival',
    title: 'Religious Revival',
    description: 'Itinerant preachers draw huge crowds. Some preach obedience; others, justice for the poor.',
    trigger: { isCivilized: true },
    mtthMonths: 105,
    once: false,
    cooldownMonths: 75,
    choices: [
      {
        id: 'endorse',
        label: 'Endorse the revival',
        effects: [
          { t: 'militancy', amount: -0.6 },
          { t: 'consciousness', amount: -0.2 },
          { t: 'prestige', amount: 3 },
        ],
        aiWeight: 50,
      },
      {
        id: 'tax_tithes',
        label: 'Tax revival collections',
        effects: [
          { t: 'treasury', amount: 70 },
          { t: 'militancy', amount: 0.55 },
        ],
        aiWeight: 30,
      },
      {
        id: 'secular_push',
        label: 'Push secular schooling',
        effects: [
          { t: 'reformLevel', reform: 'school_system', delta: 1 },
          { t: 'consciousness', amount: 0.55 },
          { t: 'militancy', amount: 0.25 },
          { t: 'treasury', amount: -80 },
        ],
        aiWeight: 40,
      },
    ],
  },
  {
    id: 'railway_mania',
    title: 'Railway Mania',
    description: 'Speculators float endless railway schemes. Fortunes and ruin travel on the same line.',
    trigger: { yearAtLeast: 1840, isCivilized: true, minFactoryCount: 1 },
    mtthMonths: 88,
    once: false,
    cooldownMonths: 65,
    choices: [
      {
        id: 'state_lines',
        label: 'Guarantee state lines',
        effects: [
          { t: 'treasury', amount: -260 },
          { t: 'boostFactories', levels: 1 },
          { t: 'prestige', amount: 6 },
          { t: 'researchPoints', amount: 4 },
        ],
        requirements: [{ t: 'minTreasury', value: 150 }],
        aiWeight: 55,
      },
      {
        id: 'bubble',
        label: 'Let the bubble inflate',
        effects: [
          { t: 'treasury', amount: 150 },
          { t: 'militancy', amount: 0.4 },
          { t: 'modifyGoodPrice', goodKey: 'iron', factor: 1.2 },
        ],
        aiWeight: 35,
      },
      {
        id: 'regulate_rails',
        label: 'Regulate speculation',
        effects: [
          { t: 'prestige', amount: 2 },
          { t: 'militancy', amount: -0.2 },
          { t: 'treasury', amount: -40 },
        ],
        aiWeight: 45,
      },
    ],
  },
  {
    id: 'aristocratic_ball',
    title: 'Court Ball Scandal',
    description: 'A lavish ball ends in a duel and a diplomatic slight. The salon hums with intrigue.',
    trigger: { isCivilized: true, minTreasury: 50 },
    mtthMonths: 115,
    once: false,
    cooldownMonths: 80,
    choices: [
      {
        id: 'apologize',
        label: 'Issue formal apologies',
        effects: [
          { t: 'prestige', amount: -5 },
          { t: 'relationsWithGps', amount: 8 },
          { t: 'treasury', amount: -30 },
        ],
        aiWeight: 45,
      },
      {
        id: 'double_down',
        label: 'Defend the honour',
        effects: [
          { t: 'prestige', amount: 6 },
          { t: 'relationsWithGps', amount: -10 },
          { t: 'infamy', amount: 0.5 },
        ],
        aiWeight: 40,
      },
    ],
  },
  {
    id: 'pension_riots',
    title: 'Pension Riots',
    description: 'Veterans and widows demand pensions after hard years of service and empty purses.',
    trigger: { minMilitancy: 2.0, isCivilized: true },
    mtthMonths: 95,
    once: false,
    cooldownMonths: 70,
    choices: [
      {
        id: 'grant_pensions',
        label: 'Expand pensions',
        effects: [
          { t: 'reformLevel', reform: 'pension_system', delta: 1 },
          { t: 'treasury', amount: -200 },
          { t: 'militancy', amount: -1.0 },
          { t: 'prestige', amount: 4 },
        ],
        aiWeight: 55,
      },
      {
        id: 'token_relief',
        label: 'Token relief only',
        effects: [
          { t: 'treasury', amount: -50 },
          { t: 'militancy', amount: 0.35 },
        ],
        aiWeight: 35,
      },
      {
        id: 'refuse_pensions',
        label: 'Refuse the demands',
        effects: [
          { t: 'militancy', amount: 1.1 },
          { t: 'unrest', amount: 0.12 },
          { t: 'spawnRebels' },
        ],
        aiWeight: 15,
      },
    ],
  },

  // ---- 1.0-U1: unification arc flavor --------------------------------------
  {
    id: 'zollverein_dividend',
    title: 'The Customs Union Pays',
    description: 'Toll houses come down along the German roads. Trade — and tax receipts — surge through the union.',
    trigger: { tags: ['PRU', 'NGF'], decisionTaken: 'zollverein' },
    mtthMonths: 30,
    once: true,
    choices: [
      {
        id: 'invest',
        label: 'Reinvest in the roads',
        effects: [
          { t: 'treasury', amount: 180 },
          { t: 'literacy', amount: 0.01 },
          { t: 'prestige', amount: 4 },
        ],
      },
      {
        id: 'pocket',
        label: 'Fill the war chest',
        effects: [{ t: 'treasury', amount: 320 }],
        aiWeight: 1,
      },
    ],
  },
  {
    id: 'pan_german_sentiment',
    title: 'Pan-German Sentiment',
    description: 'Student unions sing of one Germany; pamphlets cross every border. The nation exists — it merely lacks a state.',
    trigger: { tags: ['PRU', 'NGF', 'AUS'], yearAtLeast: 1840, hasFormableCandidate: true },
    mtthMonths: 96,
    once: false,
    cooldownMonths: 120,
    choices: [
      {
        id: 'fan',
        label: 'Fan the flames',
        effects: [
          { t: 'consciousness', amount: 0.6 },
          { t: 'prestige', amount: 6 },
          { t: 'militancy', amount: 0.3 },
        ],
        aiWeight: 2,
      },
      {
        id: 'suppress',
        label: 'Suppress the radicals',
        effects: [
          { t: 'militancy', amount: -0.2 },
          { t: 'consciousness', amount: -0.2 },
          { t: 'prestige', amount: -3 },
        ],
      },
    ],
  },

  // ---- 1.0-U2: Risorgimento flavor ------------------------------------------
  {
    id: 'viva_verdi',
    title: 'Viva V.E.R.D.I.',
    description: 'The opera crowds chant the composer\'s name — and everyone understands the acrostic: Vittorio Emanuele Re D\'Italia.',
    trigger: { tags: ['SAR', 'ITA'], decisionTaken: 'il_risorgimento' },
    mtthMonths: 40,
    once: true,
    choices: [
      {
        id: 'embrace',
        label: 'Let them sing',
        effects: [
          { t: 'consciousness', amount: 0.5 },
          { t: 'prestige', amount: 5 },
        ],
        aiWeight: 2,
      },
      {
        id: 'hush',
        label: 'Quiet the theatres',
        effects: [
          { t: 'militancy', amount: -0.2 },
          { t: 'prestige', amount: -2 },
        ],
      },
    ],
  },
];
