import type {
  GameData,
  GameDate,
  GovernmentType,
  Nation,
  Party,
  PartyIdeology,
  Pop,
  PopType,
  ReformDef,
  ReformCategory,
  State,
  World,
} from '../shared/types';

const IDEOLOGY_ORDER: PartyIdeology[] = ['reactionary', 'conservative', 'liberal', 'socialist'];
const ALL_IDEOLOGIES: PartyIdeology[] = ['reactionary', 'conservative', 'liberal', 'socialist', 'communist', 'fascist'];
const ELECTIVE_GOVERNMENTS = new Set<GovernmentType>(['democracy', 'constitutional_monarchy', 'hms_government']);
const AUTHORITARIAN_GOVERNMENTS = new Set<GovernmentType>([
  'absolute_monarchy',
  'presidential_dictatorship',
  'proletarian_dictatorship',
  'fascist_dictatorship',
  'uncivilized',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function houseTemplate(
  reactionary: number,
  conservative: number,
  liberal: number,
  socialist: number,
): Record<PartyIdeology, number> {
  const base: Record<PartyIdeology, number> = {
    reactionary,
    conservative,
    liberal,
    socialist,
    communist: 0,
    fascist: 0,
  };
  return normalizeUpperHouse(base);
}

export function normalizeUpperHouse(input: Record<PartyIdeology, number>): Record<PartyIdeology, number> {
  const total = ALL_IDEOLOGIES.reduce((sum, ideology) => sum + Math.max(0, input[ideology] ?? 0), 0);
  if (total <= 0) {
    return {
      reactionary: 0.1,
      conservative: 0.55,
      liberal: 0.25,
      socialist: 0.1,
      communist: 0,
      fascist: 0,
    };
  }
  return {
    reactionary: Math.max(0, input.reactionary ?? 0) / total,
    conservative: Math.max(0, input.conservative ?? 0) / total,
    liberal: Math.max(0, input.liberal ?? 0) / total,
    socialist: Math.max(0, input.socialist ?? 0) / total,
    communist: Math.max(0, input.communist ?? 0) / total,
    fascist: Math.max(0, input.fascist ?? 0) / total,
  };
}

export function isElectiveGovernment(government: GovernmentType): boolean {
  return ELECTIVE_GOVERNMENTS.has(government);
}

/**
 * Upper-house composition reform → election blend / monthly drift weights.
 * Level 0 appointed keeps the chamber sticky with authoritarian bias;
 * level 3 proportional tracks ideology votes and pop ideology faster.
 */
export function upperHouseCompositionWeights(level: number): {
  electionRetain: number;
  electionVote: number;
  driftElective: number;
  driftAuthoritarian: number;
  /** Extra reactionary/conservative pull on monthly drift (appointed seats). */
  authoritarianBias: number;
} {
  const clamped = clamp(Math.floor(level), 0, 3);
  const electionRetain = [0.72, 0.62, 0.55, 0.38][clamped] ?? 0.55;
  return {
    electionRetain,
    electionVote: 1 - electionRetain,
    driftElective: [0.1, 0.16, 0.22, 0.3][clamped] ?? 0.22,
    driftAuthoritarian: [0.05, 0.07, 0.09, 0.14][clamped] ?? 0.09,
    authoritarianBias: [0.07, 0.045, 0.02, 0][clamped] ?? 0.02,
  };
}

export function partyLabel(nation: Nation, partyKey: string): string {
  return nation.parties.find((party) => party.key === partyKey)?.name ?? partyKey;
}

export function ideologyFromPop(pop: Pop): PartyIdeology {
  return IDEOLOGY_ORDER[pop.ideology] ?? 'conservative';
}

export function popSupportsFranchise(popType: PopType, level: number): number {
  const clamped = clamp(level, 0, 3);
  if (clamped >= 3) return 1;
  if (clamped === 2) {
    if (popType === 'aristocrat' || popType === 'capitalist') return 1;
    if (popType === 'clergy' || popType === 'officer' || popType === 'clerk') return 0.8;
    if (popType === 'craftsman') return 0.6;
    return 0.35;
  }
  if (clamped === 1) {
    if (popType === 'aristocrat' || popType === 'capitalist') return 1;
    if (popType === 'clergy' || popType === 'officer') return 0.65;
    return 0.15;
  }
  if (popType === 'aristocrat' || popType === 'capitalist' || popType === 'officer') return 0.8;
  return 0;
}

function partyPosition(party: Party, reformKey: string): number {
  return Math.max(0, Math.floor(party.positions[reformKey] ?? 0));
}

function maxLevel(def: ReformDef): number {
  return Math.max(0, def.options.length - 1);
}

function nextLevel(nation: Nation, reformKey: string): number {
  return Math.max(0, Math.floor(nation.reforms[reformKey] ?? 0) + 1);
}

function governmentCategoryCap(government: GovernmentType, category: ReformCategory): number {
  if (government === 'democracy' || government === 'hms_government' || government === 'constitutional_monarchy') {
    return 3;
  }
  if (government === 'proletarian_dictatorship') {
    return category === 'political' ? 2 : 3;
  }
  if (government === 'uncivilized') {
    if (category === 'military' || category === 'economic') return 1;
    return 0;
  }
  if (government === 'absolute_monarchy' || government === 'presidential_dictatorship' || government === 'fascist_dictatorship') {
    if (category === 'political') return 1;
    if (category === 'social') return 2;
    return 3;
  }
  return 3;
}

function reformSupportThreshold(government: GovernmentType, category: ReformCategory): number {
  const base = category === 'political'
    ? 0.62
    : category === 'social'
      ? 0.5
      : category === 'military'
        ? 0.45
        : 0.48;
  if (government === 'absolute_monarchy' || government === 'presidential_dictatorship') return base + 0.12;
  if (government === 'fascist_dictatorship') return base + 0.08;
  if (government === 'democracy') return base - 0.04;
  return base;
}

function reformCost(category: ReformCategory, level: number): { money: number; prestige: number } {
  const moneyBase = category === 'economic'
    ? 420
    : category === 'political'
      ? 300
      : category === 'social'
        ? 360
        : 390;
  const prestigeBase = category === 'political' ? 1.3 : 0.9;
  const step = Math.max(0, level);
  return {
    money: Math.round(moneyBase + step * 165),
    prestige: Number((prestigeBase + step * 0.35).toFixed(2)),
  };
}

export function politicalSuppression(nation: Nation, data: GameData): number {
  const voting = data.reforms.find((reform) => reform.key === 'voting_franchise');
  const press = data.reforms.find((reform) => reform.key === 'press_rights');
  const votingMax = voting ? Math.max(1, maxLevel(voting)) : 1;
  const pressMax = press ? Math.max(1, maxLevel(press)) : 1;
  const votingFreedom = clamp((nation.reforms.voting_franchise ?? 0) / votingMax, 0, 1);
  const pressFreedom = clamp((nation.reforms.press_rights ?? 0) / pressMax, 0, 1);
  const electivePenalty = isElectiveGovernment(nation.government) ? 0.03 : 0.22;
  const authoritarianPenalty = AUTHORITARIAN_GOVERNMENTS.has(nation.government) ? 0.12 : 0;
  return clamp((1 - votingFreedom) * 0.45 + (1 - pressFreedom) * 0.35 + electivePenalty + authoritarianPenalty, 0, 1);
}

export function reformDemandForPop(pop: Pop, nation: Nation, data: GameData): string | null {
  const ideology = ideologyFromPop(pop);
  const unmet = 1 - clamp(pop.needsMet, 0, 1);
  const consciousness = clamp(pop.consciousness, 0, 10);
  const militancy = clamp(pop.militancy, 0, 10);
  const atMax = (reformKey: string) => {
    const def = data.reforms.find((reform) => reform.key === reformKey);
    if (!def) return true;
    return (nation.reforms[reformKey] ?? 0) >= maxLevel(def);
  };

  if ((pop.type === 'soldier' || pop.type === 'officer') && unmet > 0.22 && !atMax('conscription_level')) {
    return 'conscription_level';
  }
  if (unmet > 0.4 && !atMax('healthcare')) return 'healthcare';
  if (unmet > 0.33 && !atMax('pension_system')) return 'pension_system';
  if (unmet > 0.28 && !atMax('labor_safety')) return 'labor_safety';
  if (consciousness > 4.2 && !atMax('school_system')) return 'school_system';

  if ((ideology === 'liberal' || ideology === 'socialist') && consciousness > 4.8) {
    if (!atMax('voting_franchise')) return 'voting_franchise';
    if (!atMax('press_rights')) return 'press_rights';
    if (!atMax('upper_house_composition')) return 'upper_house_composition';
  }

  if ((ideology === 'reactionary' || ideology === 'conservative') && militancy > 5 && !atMax('army_professionalism')) {
    return 'army_professionalism';
  }

  if (ideology === 'liberal' && !atMax('economic_policy')) return 'economic_policy';
  if (ideology === 'socialist' && !atMax('trade_policy')) return 'trade_policy';
  return null;
}

export function aggregateReformDemand(world: World, data: GameData, nationId: number): Map<string, number> {
  const demand = new Map<string, number>();
  const provinceSet = new Set(world.provinces.filter((province) => province.owner === nationId).map((province) => province.id));
  const nation = world.nations[nationId];
  if (!nation || provinceSet.size === 0) return demand;

  let totalWeight = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0 || !provinceSet.has(pop.provinceId)) continue;
    const wanted = reformDemandForPop(pop, nation, data);
    if (!wanted) continue;
    const weight = pop.size * (0.45 + (1 - pop.needsMet) * 0.55);
    demand.set(wanted, (demand.get(wanted) ?? 0) + weight);
    totalWeight += weight;
  }

  if (totalWeight <= 0) return demand;
  for (const [key, value] of demand.entries()) demand.set(key, value / totalWeight);
  return demand;
}

export function topReformDemandEntries(world: World, data: GameData, nationId: number, maxEntries = 5): { reform: string; support: number }[] {
  const demand = aggregateReformDemand(world, data, nationId);
  return Array.from(demand.entries())
    .map(([reform, support]) => ({ reform, support }))
    .sort((a, b) => b.support - a.support)
    .slice(0, maxEntries);
}

export function createNationParties(): Party[] {
  return [
    {
      key: 'order_party',
      name: 'Party of Order',
      ideology: 'reactionary',
      positions: {
        economic_policy: 1,
        trade_policy: 1,
        voting_franchise: 0,
        upper_house_composition: 0,
        press_rights: 0,
        school_system: 1,
        healthcare: 1,
        pension_system: 0,
        labor_safety: 0,
        conscription_level: 2,
        army_professionalism: 2,
      },
    },
    {
      key: 'conservative_union',
      name: 'Conservative Union',
      ideology: 'conservative',
      positions: {
        economic_policy: 1,
        trade_policy: 2,
        voting_franchise: 1,
        upper_house_composition: 1,
        press_rights: 1,
        school_system: 1,
        healthcare: 1,
        pension_system: 1,
        labor_safety: 1,
        conscription_level: 2,
        army_professionalism: 2,
      },
    },
    {
      key: 'liberal_coalition',
      name: 'Liberal Coalition',
      ideology: 'liberal',
      positions: {
        economic_policy: 3,
        trade_policy: 3,
        voting_franchise: 3,
        upper_house_composition: 3,
        press_rights: 3,
        school_system: 2,
        healthcare: 2,
        pension_system: 1,
        labor_safety: 1,
        conscription_level: 1,
        army_professionalism: 2,
      },
    },
    {
      key: 'workers_front',
      name: 'Workers Front',
      ideology: 'socialist',
      positions: {
        economic_policy: 2,
        trade_policy: 1,
        voting_franchise: 3,
        upper_house_composition: 3,
        press_rights: 2,
        school_system: 3,
        healthcare: 3,
        pension_system: 3,
        labor_safety: 3,
        conscription_level: 2,
        army_professionalism: 1,
      },
    },
  ];
}

export function defaultUpperHouse(government: GovernmentType): Record<PartyIdeology, number> {
  if (government === 'democracy' || government === 'hms_government') return houseTemplate(0.08, 0.35, 0.4, 0.17);
  if (government === 'constitutional_monarchy') return houseTemplate(0.14, 0.45, 0.31, 0.1);
  if (government === 'proletarian_dictatorship') return houseTemplate(0.05, 0.2, 0.2, 0.55);
  if (government === 'fascist_dictatorship') return houseTemplate(0.1, 0.3, 0.1, 0.1);
  if (government === 'uncivilized') return houseTemplate(0.28, 0.54, 0.15, 0.03);
  return houseTemplate(0.22, 0.54, 0.2, 0.04);
}

export function defaultRulingParty(government: GovernmentType): string {
  if (government === 'democracy' || government === 'hms_government') return 'liberal_coalition';
  if (government === 'proletarian_dictatorship') return 'workers_front';
  return 'conservative_union';
}

export function reformSupportInUpperHouse(nation: Nation, reformKey: string, targetLevel: number): number {
  let support = 0;
  for (const party of nation.parties) {
    const share = nation.upperHouse[party.ideology] ?? 0;
    if (partyPosition(party, reformKey) >= targetLevel) support += share;
  }
  return clamp(support, 0, 1);
}

export function partyByKey(nation: Nation, key: string): Party | null {
  return nation.parties.find((party) => party.key === key) ?? null;
}

export function computeReformLegality(
  _world: World,
  _data: GameData,
  nation: Nation,
  reform: ReformDef,
  targetLevel: number,
): {
  legal: boolean;
  reason: string;
  support: number;
  requiredSupport: number;
  costMoney: number;
  costPrestige: number;
} {
  const current = nation.reforms[reform.key] ?? 0;
  const maxAllowedByDef = maxLevel(reform);
  const clampedTarget = clamp(Math.floor(targetLevel), 0, maxAllowedByDef);
  const next = nextLevel(nation, reform.key);
  const support = reformSupportInUpperHouse(nation, reform.key, clampedTarget);
  const requiredSupport = reformSupportThreshold(nation.government, reform.category);
  const costs = reformCost(reform.category, clampedTarget);

  if (clampedTarget <= current) {
    return {
      legal: false,
      reason: 'Already enacted at this level.',
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }
  if (clampedTarget !== next) {
    return {
      legal: false,
      reason: 'Reforms must be enacted in order.',
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }

  const cap = governmentCategoryCap(nation.government, reform.category);
  if (clampedTarget > cap) {
    return {
      legal: false,
      reason: `${nation.government.replaceAll('_', ' ')} blocks deeper ${reform.category} reform.`,
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }
  if (support + 1e-9 < requiredSupport) {
    return {
      legal: false,
      reason: `Upper house support too low (${(support * 100).toFixed(0)}% / ${(requiredSupport * 100).toFixed(0)}%).`,
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }
  if (nation.treasury < costs.money) {
    return {
      legal: false,
      reason: `Requires £${costs.money.toLocaleString()} treasury.`,
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }
  if (nation.prestige < costs.prestige) {
    return {
      legal: false,
      reason: `Requires ${costs.prestige.toFixed(1)} prestige.`,
      support,
      requiredSupport,
      costMoney: costs.money,
      costPrestige: costs.prestige,
    };
  }
  return {
    legal: true,
    reason: 'Legal to enact.',
    support,
    requiredSupport,
    costMoney: costs.money,
    costPrestige: costs.prestige,
  };
}

export function updateMilitaryDerivedForNation(world: World, nationId: number): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const conscription = clamp(Math.floor(nation.reforms.conscription_level ?? 0), 0, 3);
  const professionalism = clamp(Math.floor(nation.reforms.army_professionalism ?? 0), 0, 3);

  let soldierPopulation = 0;
  let nonSoldierPopulation = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      if (pop.type === 'soldier') soldierPopulation += pop.size;
      else nonSoldierPopulation += pop.size;
    }
  }

  const regimentsPerThousand = [0.8, 1.1, 1.55, 2.0][conscription] ?? 0.8;
  const mobilizationFactor = [0.02, 0.05, 0.1, 0.18][conscription] ?? 0.02;
  nation.regimentsPerSoldierPop = regimentsPerThousand;
  nation.standingRegimentCapacity = Math.max(0, Math.floor((soldierPopulation / 1000) * regimentsPerThousand));
  nation.mobilizationCapacity = Math.max(0, Math.floor((nonSoldierPopulation / 1000) * mobilizationFactor));
  nation.armyOrganization = [0.84, 1, 1.15, 1.3][professionalism] ?? 1;
  nation.armyMorale = [0.9, 1, 1.12, 1.25][professionalism] ?? 1;
}

export function updateNationalLiteracyAndConsciousness(world: World, nationId: number): void {
  const nation = world.nations[nationId];
  if (!nation) return;

  let totalPopulation = 0;
  let clergyPopulation = 0;
  let consciousnessWeighted = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      totalPopulation += pop.size;
      consciousnessWeighted += pop.size * clamp(pop.consciousness, 0, 10);
      if (pop.type === 'clergy') clergyPopulation += pop.size;
    }
  }
  const clergyShare = totalPopulation > 0 ? clergyPopulation / totalPopulation : 0;
  const school = clamp(Math.floor(nation.reforms.school_system ?? 0), 0, 3);
  const literacyGain = (0.0005 + school * 0.0012 + clergyShare * 0.05) * (1 - nation.literacy);
  nation.literacy = clamp(nation.literacy + literacyGain, 0, 1);
  nation.nationalConsciousness = totalPopulation > 0 ? consciousnessWeighted / totalPopulation : 0;
}

function countStateMilitancy(world: World, state: State): number {
  let total = 0;
  let count = 0;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      total += clamp(pop.militancy, 0, 10);
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

export function updateStateUnrest(world: World, data: GameData, nationId: number): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const suppression = politicalSuppression(nation, data);
  const demand = aggregateReformDemand(world, data, nationId);
  const blockedDemand = Array.from(demand.entries()).reduce((sum, [reformKey, support]) => {
    const reform = data.reforms.find((candidate) => candidate.key === reformKey);
    if (!reform) return sum;
    const legality = computeReformLegality(world, data, nation, reform, nextLevel(nation, reform.key));
    return sum + (legality.legal ? 0 : support);
  }, 0);

  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    let unmetNeed = 0;
    let popCount = 0;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        unmetNeed += 1 - clamp(pop.needsMet, 0, 1);
        popCount += 1;
      }
    }
    const unmet = popCount > 0 ? unmetNeed / popCount : 0;
    const militancy = countStateMilitancy(world, state);
    const pressure = clamp((militancy - 3.5) * 0.09 + unmet * 0.35 + suppression * 0.25 + blockedDemand * 0.45, 0, 1.4);
    state.unrestRisk = clamp(state.unrestRisk * 0.72 + pressure * 0.4, 0, 2);
  }
}

export function yearsToElection(date: GameDate, nation: Nation): number {
  return Math.max(0, nation.nextElectionYear - date.year);
}

/** Real sim effect for a reform level (null = flavor-only / demand gate). */
export function reformMechanicalEffect(reformKey: string, level: number): string | null {
  const lv = clamp(Math.floor(level), 0, 3);
  switch (reformKey) {
    case 'voting_franchise':
      return [
        'Estates only — most pops have no ballot',
        'Landed: aristocrats/capitalists/officers vote heavily',
        'Wealth: middle strata gain ballots; laborers weak',
        'Universal: full franchise weight for all pop types',
      ][lv] ?? null;
    case 'press_rights':
      return 'Lowers politicalSuppression (with franchise); no consciousness diffusion yet';
    case 'upper_house_composition':
      return [
        'Election retain 72%; slow drift; appointed authoritarian bias',
        'Election retain 62%; mild drift',
        'Election retain 55%; balanced drift',
        'Election retain 38%; fast ideology tracking',
      ][lv] ?? null;
    case 'school_system':
      return `Literacy gain ≈ ${(0.0005 + lv * 0.0012).toFixed(4)}/mo × (1−literacy)`;
    case 'healthcare':
      return lv === 0 ? 'No healthcare growth bonus' : `Pop growth bonus +${(0.00012 * lv).toFixed(5)}/mo`;
    case 'pension_system': {
      const relief = [0, 0.018, 0.035, 0.055][lv] ?? 0;
      return relief <= 0 ? 'No worker militancy relief' : `−${relief.toFixed(3)} mil/mo farmer/laborer/craftsman`;
    }
    case 'labor_safety': {
      const relief = [0, 0.012, 0.028, 0.045][lv] ?? 0;
      return relief <= 0 ? 'No workplace militancy relief' : `−${relief.toFixed(3)} mil/mo laborer/craftsman`;
    }
    case 'conscription_level':
      return [
        '0.8 regiments/1k soldiers · 2% mobilizable',
        '1.1 regiments/1k · 5% mobilizable',
        '1.55 regiments/1k · 10% mobilizable',
        '2.0 regiments/1k · 18% mobilizable',
      ][lv] ?? null;
    case 'army_professionalism':
      return [
        'Org ×0.84 · Morale ×0.90',
        'Org ×1.00 · Morale ×1.00',
        'Org ×1.15 · Morale ×1.12',
        'Org ×1.30 · Morale ×1.25',
      ][lv] ?? null;
    case 'economic_policy':
    case 'trade_policy':
      return 'Demand/party position only (no market hook yet)';
    default:
      return null;
  }
}
