import type { Factory, GameData, Pop, Recipe, State, World } from '../../shared/types';
import type { Rng } from '../rng';
import { buyFromMarket, computeSaleRevenue, registerSupply } from './market';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function recipeByKey(data: GameData): Record<string, Recipe> {
  const map: Record<string, Recipe> = {};
  for (const recipe of data.recipes) map[recipe.key] = recipe;
  return map;
}

function distributeMoney(world: World, popIds: number[], totalWeight: number, amount: number): void {
  const safeAmount = Math.max(0, finite(amount));
  if (safeAmount <= 0 || totalWeight <= 0) return;
  for (const popId of popIds) {
    const pop = world.pops[popId];
    if (!pop || pop.size <= 0) continue;
    const weight = Math.max(0, pop.size);
    const share = safeAmount * (weight / totalWeight);
    pop.money = Math.max(0, finite(pop.money) + share);
  }
}

function getProvincePops(world: World, provinceId: number): Pop[] {
  const province = world.provinces[provinceId];
  if (!province) return [];
  return province.popIds.map((popId) => world.pops[popId]).filter(Boolean);
}

function ruralOwnerIds(world: World, provinceId: number): number[] {
  return getProvincePops(world, provinceId)
    .filter((pop) => pop.type === 'aristocrat' || pop.type === 'capitalist')
    .map((pop) => pop.id);
}

function buildStatePopBuckets(world: World): Map<number, Record<string, number[]>> {
  const map = new Map<number, Record<string, number[]>>();
  for (const state of world.states) {
    const buckets: Record<string, number[]> = {
      craftsman: [],
      clerk: [],
      capitalist: [],
      farmer: [],
      laborer: [],
    };
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop) continue;
        if (buckets[pop.type]) buckets[pop.type].push(popId);
      }
    }
    map.set(state.id, buckets);
  }
  return map;
}

function totalPopSize(world: World, popIds: number[]): number {
  let total = 0;
  for (const popId of popIds) total += Math.max(0, finite(world.pops[popId]?.size));
  return total;
}

function runRgoProduction(world: World, recipes: Record<string, Recipe>): void {
  for (const province of world.provinces) {
    const recipe = recipes[province.rgo.recipe];
    if (!recipe || recipe.building !== 'rgo') continue;

    const eligible = province.popIds.filter((popId) => {
      const pop = world.pops[popId];
      return pop && (pop.type === 'farmer' || pop.type === 'laborer') && pop.size > 0;
    });
    const totalEligible = totalPopSize(world, eligible);
    const capacity = Math.max(0, finite(province.rgo.level, 1)) * 2600;
    const employed = Math.min(totalEligible, capacity);
    province.rgo.employed = employed;
    if (employed <= 0 || totalEligible <= 0) continue;

    const laborUnits = employed / 1000;
    const throughput = recipe.output.amount * laborUnits * (1 + province.rgo.level * 0.1);
    const outputAmount = registerSupply(world, recipe.output.good, throughput);
    if (outputAmount <= 0) continue;

    const nationId = province.owner;
    const grossRevenue = computeSaleRevenue(world, recipe.output.good, nationId, outputAmount);
    const wagePool = grossRevenue * 0.72;
    const ownerPool = grossRevenue * 0.15;
    const statePool = Math.max(0, grossRevenue - wagePool - ownerPool);
    world.nations[nationId].monthlyProductionIncome += statePool;

    const employedShare = employed / totalEligible;
    const wageEligible = eligible.filter((popId) => {
      const pop = world.pops[popId];
      return pop && pop.size > 0;
    });
    let wageWeight = 0;
    for (const popId of wageEligible) {
      const pop = world.pops[popId];
      if (!pop) continue;
      wageWeight += pop.size * employedShare;
    }
    distributeMoney(world, wageEligible, wageWeight, wagePool);

    const owners = ruralOwnerIds(world, province.id);
    const ownerWeight = totalPopSize(world, owners);
    if (ownerWeight > 0) distributeMoney(world, owners, ownerWeight, ownerPool);
    else world.nations[nationId].monthlyProductionIncome += ownerPool;
  }
}

function processFactory(
  world: World,
  state: State,
  factory: Factory,
  buckets: Record<string, number[]>,
  recipes: Record<string, Recipe>,
): number {
  const recipe = recipes[factory.recipe];
  if (!recipe || recipe.building !== 'factory') return 0;

  const owner = world.nations[state.owner];
  const craftsmanIds = buckets.craftsman;
  const clerkIds = buckets.clerk;
  const capitalistIds = buckets.capitalist;
  const totalCrafts = totalPopSize(world, craftsmanIds);
  const totalClerks = totalPopSize(world, clerkIds);

  const capacity = Math.max(1, factory.level) * 2300;
  const employedClerks = Math.min(totalClerks, capacity * 0.2);
  const employedCrafts = Math.min(totalCrafts, capacity - employedClerks);
  const employed = employedCrafts + employedClerks;
  factory.employed = employed;
  factory.workerShare = employedCrafts;
  factory.clerkShare = employedClerks;

  if (employed <= 0) {
    factory.weeklyProfit = -4;
    factory.lastOutput = 0;
    factory.profitTrend = finite(factory.profitTrend) * 0.78 - 0.3;
    factory.lossWeeks += 1;
    factory.profitableWeeks = 0;
    return factory.weeklyProfit;
  }

  let unitTarget = (employed / 1000) * (1 + factory.level * 0.11);
  let inputCost = 0;
  for (const input of recipe.inputs) {
    if (unitTarget <= 0) break;
    const needed = input.amount * unitTarget;
    const purchase = buyFromMarket(world, state.owner, input.good, needed, Number.POSITIVE_INFINITY);
    inputCost += purchase.spent;
    const ratio = needed > 0 ? purchase.bought / needed : 1;
    if (ratio < 1) unitTarget *= ratio;
  }
  unitTarget = Math.max(0, unitTarget);

  const outputAmount = registerSupply(world, recipe.output.good, recipe.output.amount * unitTarget);
  factory.lastOutput = outputAmount;
  const revenue = computeSaleRevenue(world, recipe.output.good, state.owner, outputAmount);

  const wagePool = revenue * 0.55;
  const clerkWages = wagePool * 0.36;
  const craftWages = wagePool - clerkWages;
  const craftWeight = totalCrafts > 0 ? totalCrafts : 1;
  const clerkWeight = totalClerks > 0 ? totalClerks : 1;
  distributeMoney(world, craftsmanIds, craftWeight, craftWages);
  distributeMoney(world, clerkIds, clerkWeight, clerkWages);

  const operating = 4 + factory.level * 1.2;
  const netBeforeCapital = revenue - inputCost - wagePool - operating;
  const capitalistCut = Math.max(0, netBeforeCapital) * 0.18;
  const capitalistWeight = totalPopSize(world, capitalistIds);
  if (capitalistWeight > 0) distributeMoney(world, capitalistIds, capitalistWeight, capitalistCut);
  else owner.monthlyProductionIncome += capitalistCut;

  const weeklyProfit = netBeforeCapital - capitalistCut;
  factory.weeklyProfit = weeklyProfit;
  factory.cashReserve = Math.max(-400, finite(factory.cashReserve) + weeklyProfit);
  factory.profitTrend = finite(factory.profitTrend) * 0.72 + weeklyProfit * 0.28;

  if (weeklyProfit >= 0) {
    factory.profitableWeeks += 1;
    factory.lossWeeks = 0;
  } else {
    factory.lossWeeks += 1;
    factory.profitableWeeks = 0;
  }

  owner.monthlyProductionIncome += Math.max(0, weeklyProfit * 0.55);
  return weeklyProfit;
}

function rebalanceFactoryLevels(state: State): void {
  const survivors: Factory[] = [];
  for (const factory of state.factories) {
    if (factory.profitableWeeks >= 14 && factory.cashReserve > 120) {
      factory.level = clamp(factory.level + 1, 1, 10);
      factory.cashReserve -= 100;
      factory.profitableWeeks = 0;
    }
    if (factory.lossWeeks >= 16 && factory.level > 1) {
      factory.level -= 1;
      factory.lossWeeks = 0;
    }
    if (factory.lossWeeks >= 24 && factory.level <= 1 && factory.cashReserve < -90) {
      continue;
    }
    survivors.push(factory);
  }
  state.factories = survivors;
}

export function runProductionWeekly(world: World, data: GameData, _rng: Rng): void {
  const recipes = recipeByKey(data);
  const bucketsByState = buildStatePopBuckets(world);
  runRgoProduction(world, recipes);
  for (const state of world.states) {
    const buckets = bucketsByState.get(state.id) ?? {
      craftsman: [],
      clerk: [],
      capitalist: [],
      farmer: [],
      laborer: [],
    };
    let stateProfit = 0;
    for (const factory of state.factories) {
      stateProfit += processFactory(world, state, factory, buckets, recipes);
    }
    world.nations[state.owner].monthlyProductionIncome += Math.max(0, stateProfit * 0.2);
    rebalanceFactoryLevels(state);
  }
}
