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
      { t: 'minTreasury', value: 300 },
      { t: 'yearAtLeast', value: 1838 },
    ],
    cost: { treasury: 280, prestige: 2 },
    effects: [
      { t: 'boostFactories', levels: 1 },
      { t: 'researchPoints', amount: 6 },
      { t: 'militancy', amount: -0.15 },
      { t: 'modifyGoodStockpile', goodKey: 'machine_parts', amount: 20 },
    ],
    cooldownMonths: 48,
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
];
