import type { BudgetLine, GameData, NationId, Pop, World } from '../../shared/types';
import type { Rng } from '../rng';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function computeNationBudget(world: World, nationId: NationId, mutatePopMoney: boolean): BudgetLine {
  const nation = world.nations[nationId];
  if (!nation) {
    return {
      taxIncome: 0,
      tariffIncome: 0,
      productionIncome: 0,
      armyUpkeep: 0,
      constructionSpend: 0,
      adminSpend: 0,
      net: 0,
    };
  }

  const provinceIds = world.provinces.filter((province) => province.owner === nationId).map((province) => province.id);
  const provinceIdSet = new Set(provinceIds);

  let taxIncome = 0;
  let taxableBase = 0;
  for (const pop of world.pops) {
    if (!provinceIdSet.has(pop.provinceId)) continue;
    const money = Math.max(0, finite(pop.money));
    const bracket = popBracket(pop);
    const rate = bracket === 'poor' ? nation.taxRatePoor : bracket === 'middle' ? nation.taxRateMiddle : nation.taxRateRich;
    const tax = clamp(money * clamp(rate, 0, 1) * 0.08, 0, money);
    taxableBase += money;
    taxIncome += tax;
    if (mutatePopMoney) pop.money = Math.max(0, money - tax);
  }

  const tariffIncome = taxableBase * Math.max(-1, Math.min(1, finite(nation.tariffRate))) * 0.012;
  const productionIncome = world.states
    .filter((state) => state.owner === nationId)
    .reduce((total, state) => total + state.factories.reduce((sub, factory) => sub + Math.max(0, finite(factory.employed)) * 0.0018, 0), 0);
  const armyUpkeep = world.armies
    .filter((army) => army.owner === nationId)
    .reduce((total, army) => total + army.regiments.length * 3.6, 0)
    + world.fleets.filter((fleet) => fleet.owner === nationId).reduce((total, fleet) => total + fleet.ships.length * 2.4, 0);
  const constructionSpend = provinceIds.length * 0.9;
  const adminSpend = nationPopulation(world, nationId) * 0.00012;
  const net = taxIncome + tariffIncome + productionIncome - armyUpkeep - constructionSpend - adminSpend;

  return {
    taxIncome: finite(taxIncome),
    tariffIncome: finite(tariffIncome),
    productionIncome: finite(productionIncome),
    armyUpkeep: finite(armyUpkeep),
    constructionSpend: finite(constructionSpend),
    adminSpend: finite(adminSpend),
    net: finite(net),
  };
}

export function runBudgetMonthly(world: World, _data: GameData, _rng: Rng): void {
  for (const nation of world.nations) {
    const budget = computeNationBudget(world, nation.id, true);
    nation.treasury = finite(nation.treasury) + budget.net;
    if (!Number.isFinite(nation.treasury)) nation.treasury = 0;
  }
}

export function computePlayerBudget(world: World, _data: GameData, nationId: NationId): BudgetLine {
  return computeNationBudget(world, nationId, false);
}
