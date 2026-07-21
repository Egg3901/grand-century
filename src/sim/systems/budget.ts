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

function nationPopulation(world: World, nationId: NationId): number {
  let total = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) total += Math.max(0, finite(world.pops[popId]?.size));
  }
  return total;
}

function nationProvinceIds(world: World, nationId: NationId): number[] {
  const ids: number[] = [];
  for (const province of world.provinces) {
    if (province.owner === nationId) ids.push(province.id);
  }
  return ids;
}

function nationFactorySubsidies(world: World, nationId: NationId): number {
  let subsidies = 0;
  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    for (const factory of state.factories) {
      const weeklyLoss = Math.max(0, -finite(factory.weeklyProfit));
      subsidies += weeklyLoss * 3.6;
    }
  }
  return subsidies;
}

function computeNationBudget(world: World, data: GameData, nationId: NationId, mutatePopMoney: boolean): BudgetLine {
  const nation = world.nations[nationId];
  if (!nation) return zeroBudget();

  const provinceIds = nationProvinceIds(world, nationId);
  const provinceIdSet = new Set(provinceIds);
  // 0.6.0: commerce tech raises how much of the assessed tax is captured. The
  // extra is deducted from pops like the base tax — no money is minted.
  const taxEfficiency = 1 + Math.max(0, techModifiersFor(nation, data).taxEfficiency);

  let poorBase = 0;
  let middleBase = 0;
  let richBase = 0;
  let poorTax = 0;
  let middleTax = 0;
  let richTax = 0;

  for (const pop of world.pops) {
    if (!provinceIdSet.has(pop.provinceId)) continue;
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
  const tariffIncome = Math.max(0, finite(nation.monthlyTariffIncome));
  const productionIncome = Math.max(0, finite(nation.monthlyProductionIncome));
  const armyUpkeep = world.armies
    .filter((army) => army.owner === nationId)
    .reduce((total, army) => total + army.regiments.length * BALANCE.economy.armyUpkeepPerRegiment, 0)
    + world.fleets
      .filter((fleet) => fleet.owner === nationId)
      .reduce((total, fleet) => total + fleet.ships.length * BALANCE.economy.navyUpkeepPerShip, 0);
  const subsidySpend = nationFactorySubsidies(world, nationId);
  const constructionSpend = nation.constructionBlocked ? 0 : provinceIds.length * BALANCE.economy.constructionSpendPerProvince;
  const adminSpend = nationPopulation(world, nationId) * BALANCE.economy.adminSpendPerPopulation
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
      ],
      productionIncome: [
        { label: 'State-owned profits', value: productionIncome },
      ],
      armyUpkeep: [
        { label: 'Army + navy upkeep base', value: armyUpkeep },
        { label: 'Bankruptcy multiplier', value: bankruptcyCut },
      ],
      subsidySpend: [
        { label: 'Factory losses', value: subsidySpend },
      ],
      constructionSpend: [
        { label: 'Province count', value: provinceIds.length },
      ],
      adminSpend: [
        { label: 'Population', value: nationPopulation(world, nationId) },
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
  for (const nation of world.nations) {
    const budget = computeNationBudget(world, data, nation.id, true);
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
  const nation = world.nations[nationId];
  if (!nation) return zeroBudget();
  if (nation.lastBudget && Number.isFinite(nation.lastBudget.net)) {
    return {
      ...nation.lastBudget,
      trace: { ...nation.lastBudget.trace },
    };
  }
  return computeNationBudget(world, data, nationId, false);
}
