import type { Factory, GameData, Pop, Recipe, State, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { buyFromMarket, computeSaleRevenue, registerSupply } from './market';
import { techModifiersFor } from './research';

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
      aristocrat: [],
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

function runRgoProduction(world: World, recipes: Record<string, Recipe>, rgoTechBoost: number[]): void {
  for (const province of world.provinces) {
    const recipe = recipes[province.rgo.recipe];
    if (!recipe || recipe.building !== 'rgo') continue;

    const eligible = province.popIds.filter((popId) => {
      const pop = world.pops[popId];
      return pop && (pop.type === 'farmer' || pop.type === 'laborer') && pop.size > 0;
    });
    const totalEligible = totalPopSize(world, eligible);
    const capacity = Math.max(0, finite(province.rgo.level, 1)) * BALANCE.economy.rgoEmploymentPerLevel;
    const employed = Math.min(totalEligible, capacity);
    province.rgo.employed = employed;
    if (employed <= 0 || totalEligible <= 0) continue;

    const laborUnits = employed / 1000;
    // 0.6.0: industry-tech multiplier (practical steam engine, sawmills, ...).
    const techBoost = rgoTechBoost[province.owner] ?? 1;
    const throughput = recipe.output.amount * laborUnits * (1 + province.rgo.level * 0.1) * BALANCE.economy.rgoOutputBoost * techBoost;
    const outputAmount = registerSupply(world, recipe.output.good, throughput);
    if (outputAmount <= 0) continue;

    const nationId = province.owner;
    const grossRevenue = computeSaleRevenue(world, recipe.output.good, nationId, outputAmount);
    const wagePool = grossRevenue * BALANCE.economy.rgoWageShare;
    const ownerPool = grossRevenue * BALANCE.economy.rgoOwnerShare;
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
  factoryTechBoost: number,
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
    factory.weeklyProfit = -BALANCE.economy.factoryIdleLoss;
    factory.lastOutput = 0;
    factory.profitTrend = finite(factory.profitTrend) * 0.78 - 0.3;
    factory.lossWeeks += 1;
    factory.profitableWeeks = 0;
    return factory.weeklyProfit;
  }

  // 0.6.0: industry/commerce-tech multiplier (mechanical production, machine
  // tooling, electrification, inventions...). Scales output per worker; input
  // demand scales with it too, so tech-lead industry pulls more raw goods.
  let unitTarget = (employed / 1000) * (1 + factory.level * 0.16) * factoryTechBoost;
  let inputCost = 0;
  for (const input of recipe.inputs) {
    if (unitTarget <= 0) break;
    // Balance pass: factories consume fewer inputs per output unit so they can
    // survive normal market swings and not collapse into permanent losses.
    const needed = input.amount * unitTarget * BALANCE.economy.factoryInputIntensity;
    const purchase = buyFromMarket(world, state.owner, input.good, needed, Number.POSITIVE_INFINITY);
    inputCost += purchase.spent;
    const ratio = needed > 0 ? purchase.bought / needed : 1;
    if (ratio < 1) unitTarget *= ratio;
  }
  unitTarget = Math.max(0, unitTarget);

  const outputAmount = registerSupply(
    world,
    recipe.output.good,
    recipe.output.amount * unitTarget * BALANCE.economy.factoryOutputBoost,
  );
  factory.lastOutput = outputAmount;
  // Balance pass: industrial value-add should beat raw extraction in the long run.
  const revenue = computeSaleRevenue(world, recipe.output.good, state.owner, outputAmount)
    * BALANCE.economy.factoryRevenueMultiplier;

  const wagePool = revenue * BALANCE.economy.factoryWageShare;
  const clerkWages = wagePool * 0.36;
  const craftWages = wagePool - clerkWages;
  const craftWeight = totalCrafts > 0 ? totalCrafts : 1;
  const clerkWeight = totalClerks > 0 ? totalClerks : 1;
  distributeMoney(world, craftsmanIds, craftWeight, craftWages);
  distributeMoney(world, clerkIds, clerkWeight, clerkWages);

  const operating = BALANCE.economy.factoryOperatingBase + factory.level * BALANCE.economy.factoryOperatingPerLevel;
  const netBeforeCapital = revenue - inputCost - wagePool - operating;
  // 0.6.0: with the input-purchase bug fixed, factories actually profit. Route
  // most of that profit to capitalist POPS (taxable — taxes stay the state's
  // lever) instead of the old 18%; the state keeps a small direct share below.
  const capitalistCut = Math.max(0, netBeforeCapital) * 0.55;
  const capitalistWeight = totalPopSize(world, capitalistIds);
  if (capitalistWeight > 0) {
    distributeMoney(world, capitalistIds, capitalistWeight, capitalistCut);
  } else {
    // No capitalists yet (they emerge via promotion): profits accrue to the
    // landed investor class — taxable rich pops — not straight to the state.
    const aristocratIds = buckets.aristocrat ?? [];
    const aristocratWeight = totalPopSize(world, aristocratIds);
    if (aristocratWeight > 0) distributeMoney(world, aristocratIds, aristocratWeight, capitalistCut);
    else owner.monthlyProductionIncome += capitalistCut;
  }

  let weeklyProfit = netBeforeCapital - capitalistCut;
  // Keep active industry from collapsing into a permanent loss trap; this acts
  // like a light industrial-policy floor that maintains a minimal profit signal.
  if (weeklyProfit < BALANCE.economy.factoryProfitFloor && employed > 0 && !owner.isBankrupt) {
    weeklyProfit = BALANCE.economy.factoryProfitFloor;
  }
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

  // 0.6.0: state share of live factory profits trimmed (0.55 -> 0.15); the
  // pre-fix 55% skim was tuned against dead factories and became a
  // tax-independent money fountain once production woke up.
  owner.monthlyProductionIncome += Math.max(0, weeklyProfit * 0.15);
  return weeklyProfit;
}

function rebalanceFactoryLevels(state: State): void {
  const survivors: Factory[] = [];
  for (const factory of state.factories) {
    if (factory.profitableWeeks >= 10 && factory.cashReserve > 70) {
      factory.level = clamp(factory.level + 1, 1, 10);
      factory.cashReserve -= 60;
      factory.profitableWeeks = 0;
    }
    if (factory.lossWeeks >= 8 && factory.level > 1) {
      factory.level -= 1;
      factory.lossWeeks = 0;
    }
    if (
      factory.lossWeeks >= 10
      && factory.level <= 1
      && (factory.cashReserve < 0 || factory.employed < 120)
    ) {
      continue;
    }
    survivors.push(factory);
  }
  state.factories = survivors;
}

export function runProductionWeekly(world: World, data: GameData, _rng: Rng): void {
  const recipes = recipeByKey(data);
  const bucketsByState = buildStatePopBuckets(world);
  // 0.6.0: per-nation tech throughput multipliers, computed once per weekly run.
  const rgoTechBoost = world.nations.map((nation) => 1 + Math.max(0, techModifiersFor(nation, data).rgoThroughput));
  const factoryTechBoost = world.nations.map((nation) => 1 + Math.max(0, techModifiersFor(nation, data).factoryThroughput));
  runRgoProduction(world, recipes, rgoTechBoost);
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
      stateProfit += processFactory(world, state, factory, buckets, recipes, factoryTechBoost[state.owner] ?? 1);
    }
    // 0.6.0: trimmed 0.2 -> 0.05 alongside the per-factory state share above.
    world.nations[state.owner].monthlyProductionIncome += Math.max(0, stateProfit * 0.05);
    rebalanceFactoryLevels(state);
  }
}
