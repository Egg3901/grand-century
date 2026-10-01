import type { BudgetLine, GameData, NationId, Pop, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { techModifiersFor } from './research';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyTrace() {
  return [];
}

function zeroBudget(bankrupt = false): BudgetLine {
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
    bankrupt,
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

function popBracket(pop: Pop): 'poor' | 'middle' | 'rich' {
  switch (pop.type) {
    case 'aristocrat':
    case 'capitalist':
      return 'rich';
    case 'clergy':
    case 'clerk':
    case 'officer':
      return 'middle';
    default:
      return 'poor';
  }
}

/**
 * Per-owner index built once per monthly pass. Without it every nation scanned
 * every pop, province and state in the world: nations x pops per month, which
 * grew with the square of map size.
 */
interface OwnershipIndex {
  provinces: number[][];
  pops: World['pops'][];
  states: World['states'][];
}

function ownershipIndex(world: World): OwnershipIndex {
  const n = world.nations.length;
  const index: OwnershipIndex = {
    provinces: Array.from({ length: n }, () => []),
    pops: Array.from({ length: n }, () => []),
    states: Array.from({ length: n }, () => []),
  };
  for (const province of world.provinces) {
    const list = index.provinces[province.owner];
    if (!list) continue;
    list.push(province.id);
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (pop) index.pops[province.owner].push(pop);
    }
  }
  for (const state of world.states) index.states[state.owner]?.push(state);
  return index;
}

function nationPopulation(world: World, nationId: NationId, index?: OwnershipIndex): number {
  if (index) {
    let total = 0;
    for (const pop of index.pops[nationId] ?? []) total += Math.max(0, finite(pop.size));
    return total;
  }
  let total = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) total += Math.max(0, finite(world.pops[popId]?.size));
  }
  return total;
}

function nationProvinceIds(world: World, nationId: NationId, index?: OwnershipIndex): number[] {
  if (index) return index.provinces[nationId] ?? [];
  const ids: number[] = [];
  for (const province of world.provinces) {
    if (province.owner === nationId) ids.push(province.id);
  }
  return ids;
}

function nationFactorySubsidies(world: World, nationId: NationId, index?: OwnershipIndex): number {
  let subsidies = 0;
  for (const state of index ? index.states[nationId] ?? [] : world.states) {
    if (state.owner !== nationId) continue;
    for (const factory of state.factories) {
      const weeklyLoss = Math.max(0, -finite(factory.weeklyProfit));
      subsidies += weeklyLoss * 3.6;
    }
  }
  return subsidies;
}

/** Credit loss-making factories with the subsidy amount billed to the treasury. */
function creditFactorySubsidies(world: World, nationId: NationId, multiplier: number, index?: OwnershipIndex): void {
  for (const state of index ? index.states[nationId] ?? [] : world.states) {
    if (state.owner !== nationId) continue;
    for (const factory of state.factories) {
      const weeklyLoss = Math.max(0, -finite(factory.weeklyProfit));
      const subsidy = weeklyLoss * 3.6 * multiplier;
      if (subsidy <= 0) continue;
      factory.cashReserve = Math.max(-400, finite(factory.cashReserve) + subsidy);
    }
  }
}

function computeNationBudget(
  world: World,
  data: GameData,
  nationId: NationId,
  mutatePopMoney: boolean,
  index: OwnershipIndex = ownershipIndex(world),
): BudgetLine {
  const nation = world.nations[nationId];
  if (!nation) return zeroBudget();

  const provinceIds = nationProvinceIds(world, nationId, index);
  // 0.6.0: commerce tech raises how much of the assessed tax is captured. The
  // extra is deducted from pops like the base tax — no money is minted.
  const taxEfficiency = 1 + Math.max(0, techModifiersFor(nation, data).taxEfficiency);

  let poorBase = 0;
  let middleBase = 0;
  let richBase = 0;
  let poorTax = 0;
  let middleTax = 0;
  let richTax = 0;

  for (const pop of index.pops[nationId] ?? []) {
    const money = Math.max(0, finite(pop.money));
    const bracket = popBracket(pop);
    const rate = bracket === 'poor' ? nation.taxRatePoor : bracket === 'middle' ? nation.taxRateMiddle : nation.taxRateRich;
    const tax = clamp(money * clamp(rate, 0, 1) * 0.11 * taxEfficiency, 0, money);
    if (bracket === 'poor') {
      poorBase += money;
      poorTax += tax;
    } else if (bracket === 'middle') {
      middleBase += money;
      middleTax += tax;
    } else {
      richBase += money;
      richTax += tax;
    }
    if (mutatePopMoney) pop.money = Math.max(0, money - tax);
  }

  const taxIncome = poorTax + middleTax + richTax;
  // Signed: positive customs duties, negative import-subsidy outlays.
  const tariffIncome = finite(nation.monthlyTariffIncome);
  const productionIncome = Math.max(0, finite(nation.monthlyProductionIncome));
  const armyOnlyUpkeep = world.armies
    .filter((army) => army.owner === nationId)
    .reduce((total, army) => total + army.regiments.length * BALANCE.economy.armyUpkeepPerRegiment, 0);
  const navyOnlyUpkeep = world.fleets
    .filter((fleet) => fleet.owner === nationId)
    .reduce((total, fleet) => total + fleet.ships.length * BALANCE.economy.navyUpkeepPerShip, 0);
  const armyUpkeep = armyOnlyUpkeep + navyOnlyUpkeep;
  const subsidySpend = nationFactorySubsidies(world, nationId, index);
  const constructionSpend = nation.constructionBlocked ? 0 : provinceIds.length * BALANCE.economy.constructionSpendPerProvince;
  const population = nationPopulation(world, nationId, index);
  const adminSpend = population * BALANCE.economy.adminSpendPerPopulation
    + provinceIds.length * BALANCE.economy.adminSpendPerProvince;
  const reformUpkeep = Object.values(nation.reforms).reduce((sum, level) => (
    sum + Math.max(0, level) * BALANCE.economy.reformUpkeepPerLevel
  ), 0);

  const bankruptcyCut = nation.isBankrupt ? 0.45 : 1;
  const adjustedArmyUpkeep = armyUpkeep * bankruptcyCut;
  const adjustedSubsidy = subsidySpend * (nation.isBankrupt ? 0.3 : 1);
  const adjustedAdmin = adminSpend * (nation.isBankrupt ? 0.6 : 1);
  const adjustedConstruction = constructionSpend * (nation.isBankrupt ? 0 : 1);
  const adjustedReform = reformUpkeep * (nation.isBankrupt ? 0.55 : 1);
  const net = taxIncome + tariffIncome + productionIncome
    - adjustedArmyUpkeep
    - adjustedSubsidy
    - adjustedConstruction
    - adjustedAdmin
    - adjustedReform;

  return {
    taxIncome: finite(taxIncome),
    tariffIncome: finite(tariffIncome),
    productionIncome: finite(productionIncome),
    armyUpkeep: finite(adjustedArmyUpkeep),
    subsidySpend: finite(adjustedSubsidy),
    constructionSpend: finite(adjustedConstruction),
    adminSpend: finite(adjustedAdmin),
    reformUpkeep: finite(adjustedReform),
    net: finite(net),
    bankrupt: nation.isBankrupt,
    trace: {
      taxIncome: [
        { label: 'Poor base', value: poorBase },
        { label: 'Poor tax', value: poorTax },
        { label: 'Middle base', value: middleBase },
        { label: 'Middle tax', value: middleTax },
        { label: 'Rich base', value: richBase },
        { label: 'Rich tax', value: richTax },
        { label: 'Tech tax efficiency', value: taxEfficiency },
      ],
      tariffIncome: [
        { label: 'Applied tariff flow', value: tariffIncome },
        { label: 'Tariff slider', value: nation.tariffRate },
        {
          label: 'Tech tariff yield',
          value: 1 + Math.max(0, techModifiersFor(nation, data).tradeEfficiency ?? 0),
        },
      ],
      productionIncome: [
        { label: 'State-owned profits', value: productionIncome },
      ],
      armyUpkeep: [
        { label: 'Army upkeep base', value: armyOnlyUpkeep },
        { label: 'Navy upkeep base', value: navyOnlyUpkeep },
        { label: 'Bankruptcy multiplier', value: bankruptcyCut },
      ],
      subsidySpend: [
        { label: 'Factory losses', value: subsidySpend },
      ],
      constructionSpend: [
        { label: 'Province count', value: provinceIds.length },
        { label: '£ per province', value: BALANCE.economy.constructionSpendPerProvince },
        { label: 'Formula', value: provinceIds.length * BALANCE.economy.constructionSpendPerProvince },
      ],
      adminSpend: [
        { label: 'Population', value: population },
        { label: 'Province count', value: provinceIds.length },
      ],
      reformUpkeep: [
        { label: 'Reform burden', value: reformUpkeep },
      ],
      net: [
        { label: 'Income total', value: taxIncome + tariffIncome + productionIncome },
        { label: 'Expense total', value: adjustedArmyUpkeep + adjustedSubsidy + adjustedConstruction + adjustedAdmin + adjustedReform },
      ],
    },
  };
}

export function runBudgetMonthly(world: World, data: GameData, _rng: Rng): void {
  // Ownership does not change during the budget pass, so one index serves all nations.
  const index = ownershipIndex(world);
  for (const nation of world.nations) {
    const budget = computeNationBudget(world, data, nation.id, true, index);
    // BALANCE: subsidies previously drained treasury without bailing plants.
    // Credit cashReserve with the same post-bankruptcy amount billed above.
    creditFactorySubsidies(world, nation.id, nation.isBankrupt ? 0.3 : 1, index);
    nation.treasury = finite(nation.treasury) + budget.net;
    if (!Number.isFinite(nation.treasury)) nation.treasury = 0;
    nation.monthlyTariffIncome = 0;
    nation.monthlyProductionIncome = 0;

    if (!nation.isBankrupt && nation.treasury <= BALANCE.economy.bankruptcyEnterTreasury) {
      nation.isBankrupt = true;
      nation.constructionBlocked = true;
      nation.bankruptcyMonths = 0;
      nation.prestige = Math.max(0, nation.prestige - 4);
    }
    if (nation.isBankrupt) {
      nation.bankruptcyMonths += 1;
      nation.prestige = Math.max(0, nation.prestige - 0.6);
      if (nation.treasury >= BALANCE.economy.bankruptcyExitTreasury) {
        nation.isBankrupt = false;
        nation.constructionBlocked = false;
      }
    }
    nation.lastBudget = { ...budget, trace: { ...budget.trace } };
  }
}

export function computePlayerBudget(world: World, data: GameData, nationId: NationId): BudgetLine {
  // Always recompute with mutatePopMoney:false so tax/tariff slider changes
  // project the ledger immediately instead of echoing stale lastBudget.
  return computeNationBudget(world, data, nationId, false);
}
