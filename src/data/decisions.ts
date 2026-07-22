/**
 * Player-initiated decisions (E4). Distinct from events: the player chooses when.
 */
import type { DecisionDef } from '../shared/types';

export const DECISION_DEFS: DecisionDef[] = [
  {
    id: 'encourage_industrialization',
    title: 'Encourage Industrialization',
    description: 'Direct subsidies and preferential contracts to expand factories in core states.',
    prerequisites: [
      { t: 'isCivilized' },
      { t: 'minTreasury', value: 450 },
      { t: 'yearAtLeast', value: 1838 },
      { t: 'minFactoryCount', value: 1 },
    ],
    cost: { treasury: 420, prestige: 4 },
    effects: [
      { t: 'boostFactories', levels: 1 },
      { t: 'researchPoints', amount: 3 },
      { t: 'militancy', amount: -0.1 },
      { t: 'modifyGoodStockpile', goodKey: 'machine_parts', amount: 12 },
    ],
    cooldownMonths: 84,
  },
  {
    id: 'national_rearmament',
    title: 'National Rearmament',
    description: 'Expand arsenals, raise professionalism standards, and stockpile small arms.',
    prerequisites: [
      { t: 'isCivilized' },
      { t: 'minTreasury', value: 250 },
      { t: 'reformAtLeast', reform: 'conscription_level', level: 1 },
    ],
    cost: { treasury: 320, prestige: 0 },
    effects: [
      { t: 'reformLevel', reform: 'army_professionalism', delta: 1 },
      { t: 'modifyGoodStockpile', goodKey: 'small_arms', amount: 35 },
      { t: 'prestige', amount: 8 },
      { t: 'militancy', amount: 0.25 },
    ],
    cooldownMonths: 60,
  },
  {
    id: 'grant_amnesty',
    title: 'Grant Amnesty',
    description: 'Pardon political prisoners and invite exiles home to cool the streets.',
    prerequisites: [
      { t: 'isCivilized' },
      { t: 'minPrestige', value: 5 },
    ],
    cost: { treasury: 40, prestige: 6 },
    effects: [
      { t: 'militancy', amount: -1.2 },
      { t: 'unrest', amount: -0.15 },
      { t: 'consciousness', amount: 0.25 },
    ],
    cooldownMonths: 36,
  },
  {
    id: 'proclaim_national_mission',
    title: 'Proclaim National Mission',
    description: 'Rally the public behind national unification or greatness — a formation-adjacent gambit.',
    prerequisites: [
      { t: 'hasFormableCandidate' },
      { t: 'isCivilized' },
      { t: 'minLiteracy', value: 0.22 },
    ],
    cost: { treasury: 100, prestige: 0 },
    effects: [
      { t: 'prestige', amount: 15 },
      { t: 'consciousness', amount: 0.6 },
      { t: 'militancy', amount: 0.2 },
      { t: 'researchPoints', amount: 4 },
    ],
    cooldownMonths: 72,
  },
  {
    id: 'colonial_office_expansion',
    title: 'Expand the Colonial Office',
    description: 'Hire surveyors, lobbyists, and gunboat captains to accelerate overseas claims.',
    prerequisites: [
      { t: 'isGreatPower' },
      { t: 'minTreasury', value: 200 },
      { t: 'yearAtLeast', value: 1840 },
    ],
    cost: { treasury: 180 },
    effects: [
      { t: 'colonialPoints', amount: 30 },
      { t: 'prestige', amount: 5 },
      { t: 'infamy', amount: 0.8 },
    ],
    cooldownMonths: 48,
  },
  {
    id: 'grain_board',
    title: 'Establish a Grain Board',
    description: 'Stabilize bread prices with a state purchasing board — expensive but calming.',
    prerequisites: [
      { t: 'isCivilized' },
      { t: 'minTreasury', value: 150 },
    ],
    cost: { treasury: 160 },
    effects: [
      { t: 'modifyGoodPrice', goodKey: 'grain', factor: 0.9 },
      { t: 'modifyGoodStockpile', goodKey: 'grain', amount: 40 },
      { t: 'militancy', amount: -0.55 },
    ],
    cooldownMonths: 40,
  },

  // ---- 1.0-U1: the Prussian unification arc -------------------------------
  {
    id: 'zollverein',
    title: 'Found the Zollverein',
    description: 'Bind the German states into a Prussian-led customs union. Trade flows through Berlin — and with it, influence.',
    prerequisites: [
      { t: 'tagIn', tags: ['PRU'] },
      { t: 'yearAtLeast', value: 1828 },
      { t: 'isGreatPower' },
    ],
    cost: { treasury: 250 },
    effects: [
      { t: 'prestige', amount: 12 },
      { t: 'opinionWithTags', tags: ['BAV', 'SAX', 'HAN', 'BAD', 'WUR', 'HES'], amount: 45 },
      { t: 'researchPoints', amount: 6 },
    ],
    once: true,
  },
  {
    id: 'german_question',
    title: 'Raise the German Question',
    description: 'Klein- or Grossdeutschland? Berlin declares that the age of a united Germany has come. Vienna disagrees — permanently.',
    prerequisites: [
      { t: 'tagIn', tags: ['PRU', 'NGF'] },
      { t: 'decisionTaken', id: 'zollverein' },
      { t: 'formableCoreShareAtLeast', key: 'GERMANY', share: 0.33 },
    ],
    cost: { prestige: 10 },
    effects: [
      { t: 'prestige', amount: 8 },
      { t: 'consciousness', amount: 0.5 },
      { t: 'opinionWithTags', tags: ['AUS'], amount: -50 },
      { t: 'forceRivalry', tag: 'AUS' },
    ],
    once: true,
  },
  {
    id: 'brothers_war',
    title: "Force the Brothers' War",
    description: 'Settle German leadership on the battlefield. A free casus belli to humble Austria and break her hold over the minor courts.',
    prerequisites: [
      { t: 'tagIn', tags: ['PRU', 'NGF'] },
      { t: 'decisionTaken', id: 'german_question' },
      { t: 'isGreatPower' },
    ],
    cost: { prestige: 5 },
    effects: [
      { t: 'grantCasusBelli', targetTag: 'AUS', goal: 'humiliate', monthsValid: 48 },
      { t: 'grantCasusBelli', targetTag: 'AUS', goal: 'cut_down_to_size', monthsValid: 48 },
      { t: 'infamy', amount: 2 },
    ],
    cooldownMonths: 120,
  },

  // ---- 1.0-U2: the Risorgimento (Piedmont arc) ------------------------------
  {
    id: 'il_risorgimento',
    title: 'Champion the Risorgimento',
    description: 'Turin declares itself the sword of Italian unity. Pamphlets, salons, and very pointed operas follow.',
    prerequisites: [
      { t: 'tagIn', tags: ['SAR'] },
      { t: 'yearAtLeast', value: 1840 },
      { t: 'isGreatPower' },
    ],
    cost: { treasury: 200 },
    effects: [
      { t: 'prestige', amount: 10 },
      { t: 'consciousness', amount: 0.5 },
      { t: 'opinionWithTags', tags: ['TSC', 'PAP', 'MOD', 'PAR', 'TUS'], amount: 40 },
      { t: 'opinionWithTags', tags: ['AUS'], amount: -35 },
    ],
    once: true,
  },
  {
    id: 'french_entente',
    title: 'Court the French Entente',
    description: 'Plombières in spirit: Paris fears Vienna more than Turin. Buy her friendship — Lombardy will cost blood either way.',
    prerequisites: [
      { t: 'tagIn', tags: ['SAR'] },
      { t: 'decisionTaken', id: 'il_risorgimento' },
    ],
    cost: { treasury: 300, prestige: 5 },
    effects: [
      { t: 'opinionWithTags', tags: ['FRA'], amount: 70 },
      { t: 'grantCasusBelli', targetTag: 'AUS', goal: 'humiliate', monthsValid: 48 },
      { t: 'infamy', amount: 1.5 },
    ],
    once: true,
  },
  {
    id: 'expedition_of_the_thousand',
    title: 'Sail the Expedition of the Thousand',
    description: 'A thousand red shirts for Sicily. Officially, Turin knows nothing about it.',
    prerequisites: [
      { t: 'tagIn', tags: ['SAR'] },
      { t: 'decisionTaken', id: 'il_risorgimento' },
      { t: 'formableCoreShareAtLeast', key: 'ITALY', share: 0.28 },
    ],
    cost: { prestige: 5 },
    effects: [
      { t: 'grantCasusBelli', targetTag: 'TSC', goal: 'add_to_sphere', monthsValid: 36 },
      { t: 'grantCasusBelli', targetTag: 'TSC', goal: 'humiliate', monthsValid: 36 },
      { t: 'prestige', amount: 8 },
      { t: 'infamy', amount: 1 },
    ],
    once: true,
  },
  {
    id: 'rome_question',
    title: 'Pose the Roman Question',
    description: 'Italy without Rome is a body without a head — but France garrisons the Holy City, and Paris will not smile on this.',
    prerequisites: [
      { t: 'tagIn', tags: ['SAR', 'ITA'] },
      { t: 'decisionTaken', id: 'expedition_of_the_thousand' },
      { t: 'formableCoreShareAtLeast', key: 'ITALY', share: 0.5 },
    ],
    cost: { prestige: 10 },
    effects: [
      { t: 'grantCasusBelli', targetTag: 'PAP', goal: 'add_to_sphere', monthsValid: 36 },
      { t: 'opinionWithTags', tags: ['FRA'], amount: -45 },
      { t: 'infamy', amount: 2 },
    ],
    once: true,
  },
];
