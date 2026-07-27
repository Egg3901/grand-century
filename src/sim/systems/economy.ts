import type { Factory, GameData, Pop, Recipe, State, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { buyFromMarket, computeSaleRevenue, priceSaleRevenue, registerSupply } from './market';
import { techModifiersFor } from './research';

/**
 * A producer's claim on this week's sales.
 *
 * Under `clearingMode: 'settle'` production does NOT pay itself. It registers
 * supply and records what it WOULD earn if everything sold, along with the pop
 * lists the money is owed to. After buyers have had their turn,
 * `settleProductionWeekly` scales every claim by the fraction of that good's
 * producer supply which actually sold, and only then moves money.
 *
 * This is the fix for the money fountain: money entering the economy each week
 * is bounded by money spent, instead of being minted for goods nobody bought.
 */
interface ProductionClaim {
  good: number;
  nationId: number;
  /** Units this producer put on the market this week. */
  supplied: number;
  /** Revenue if every supplied unit sold — scaled by the realized sell rate. */
  grossIfAllSold: number;
  wagePool: number;
  ownerPool: number;
  statePool: number;
  wageEligible: number[];
  wageWeight: number;
  owners: number[];
  ownerWeight: number;
  /** Where to record realized weekly profit once known. */
  onProfit: (profit: number) => void;
  /**
   * Factories settle differently from RGOs: their costs (inputs, operating) are
   * already sunk, so only revenue scales with the realized sell rate. This
   * closure performs the whole factory settlement and returns realized profit.
   */
  settleFactory?: (rate: number) => number;
}

const productionClaims = new WeakMap<World, ProductionClaim[]>();

function claimsFor(world: World): ProductionClaim[] {
  let list = productionClaims.get(world);
  if (!list) { list = []; productionClaims.set(world, list); }
  return list;
}

/** True when producers are paid after the market clears rather than on output. */
function settleMode(): boolean {
  return BALANCE.economy.clearingMode === 'settle';
}

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
    if (employed <= 0 || totalEligible <= 0) {
      province.rgo.weeklyProfit = 0;
      continue;
    }

    const laborUnits = employed / 1000;
    // 0.6.0: industry-tech multiplier (practical steam engine, sawmills, ...).
    const techBoost = rgoTechBoost[province.owner] ?? 1;
    const throughput = recipe.output.amount * laborUnits * (1 + province.rgo.level * 0.1) * BALANCE.economy.rgoOutputBoost * techBoost;
    const outputAmount = registerSupply(world, recipe.output.good, throughput);
    if (outputAmount <= 0) continue;

    const nationId = province.owner;
    // Under settle mode this prices the output but does NOT move money yet —
    // computeSaleRevenue is called once, at settle time, on the sold fraction.
    const grossRevenue = settleMode()
      ? priceSaleRevenue(world, recipe.output.good, nationId, outputAmount)
      : computeSaleRevenue(world, recipe.output.good, nationId, outputAmount);
    const wagePool = grossRevenue * BALANCE.economy.rgoWageShare;
    const ownerPool = grossRevenue * BALANCE.economy.rgoOwnerShare;
    const statePool = Math.max(0, grossRevenue - wagePool - ownerPool);

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
    const owners = ruralOwnerIds(world, province.id);
    const ownerWeight = totalPopSize(world, owners);

    if (settleMode()) {
      claimsFor(world).push({
        good: recipe.output.good,
        nationId,
        supplied: outputAmount,
        grossIfAllSold: grossRevenue,
        wagePool,
        ownerPool,
        statePool,
        wageEligible,
        wageWeight,
        owners,
        ownerWeight,
        onProfit: (profit) => { province.rgo.weeklyProfit = profit; },
      });
      continue;
    }

    // Ledger profit = residual after wages (owner rent + vestigial state share).
    province.rgo.weeklyProfit = ownerPool + statePool;
    world.nations[nationId].monthlyProductionIncome += statePool;
    distributeMoney(world, wageEligible, wageWeight, wagePool);
    if (ownerWeight > 0) distributeMoney(world, owners, ownerWeight, ownerPool);
    else world.nations[nationId].monthlyProductionIncome += ownerPool;
  }
}

/**
 * Settle every producer claim against what the market actually absorbed.
 *
 * Sell rate per good = units bought from producers / units producers supplied.
 * `consumerBought` counts purchases from both producer supply and the world
 * stockpile, so the producer-sourced portion is `consumerBought - stockpileSell`.
 * Anything left unsold rolls into the stockpile as before — but nobody is paid
 * for it, which is the whole point.
 */
export function settleProductionWeekly(world: World, _data: GameData, _rng: Rng): void {
  const claims = productionClaims.get(world);
  if (!claims || claims.length === 0) return;

  const sellRate: number[] = [];
  for (let good = 0; good < world.marketRuntime.length; good++) {
    const runtime = world.marketRuntime[good];
    if (!runtime) { sellRate[good] = 0; continue; }
    const supplied = Math.max(0, runtime.producerSupply);
    const soldFromProducers = Math.max(0, runtime.consumerBought - runtime.stockpileSell);
    sellRate[good] = supplied > 0 ? clamp(soldFromProducers / supplied, 0, 1) : 0;
  }

  for (const claim of claims) {
    const rate = sellRate[claim.good] ?? 0;
    if (claim.settleFactory) {
      // Book the tariff/trade-efficiency transfer on the sold units, then let
      // the factory closure distribute wages and profit against sunk costs.
      if (rate > 0) computeSaleRevenue(world, claim.good, claim.nationId, claim.supplied * rate);
      claim.settleFactory(rate);
      continue;
    }
    const sold = claim.supplied * rate;
    // One real transfer, on the sold units only. This books the export tariff
    // and the trade-efficiency cut exactly as a normal sale would.
    const gross = sold > 0 ? computeSaleRevenue(world, claim.good, claim.nationId, sold) : 0;
    const scale = claim.grossIfAllSold > 0 ? gross / claim.grossIfAllSold : 0;
    const wagePool = claim.wagePool * scale;
    const ownerPool = claim.ownerPool * scale;
    const statePool = claim.statePool * scale;

    claim.onProfit(ownerPool + statePool);
    const nation = world.nations[claim.nationId];
    if (nation) nation.monthlyProductionIncome += statePool;
    distributeMoney(world, claim.wageEligible, claim.wageWeight, wagePool);
    if (claim.ownerWeight > 0) distributeMoney(world, claim.owners, claim.ownerWeight, ownerPool);
    else if (nation) nation.monthlyProductionIncome += ownerPool;
  }

  claims.length = 0;
}

/**
 * Record a week's realized profit on a factory: the industrial-policy floor,
 * the cash reserve, the trend, and the streak counters that drive expansion,
 * downsizing and closure.
 *
 * This exists as one function because splitting it was a real bug. Under settle
 * clearing the factory's revenue is not known until after the market clears, so
 * processFactory computed an optimistic profit (as if everything sold), the
 * floor rewrote any loss to +0.15, and the counters recorded a profitable week.
 * The settle pass then corrected `weeklyProfit` — but the counters had already
 * been written from the optimistic figure.
 *
 * The result: no factory ever accumulated a loss week. Every plant expanded to
 * the level cap and none ever downsized or closed, while 61% of them were
 * genuinely losing money. Tuning the expansion thresholds had no effect at all,
 * because the thresholds were reading fiction.
 */
function applyFactoryProfit(factory: Factory, rawProfit: number, employed: number, ownerBankrupt: boolean): void {
  let weeklyProfit = rawProfit;
  if (weeklyProfit < BALANCE.economy.factoryProfitFloor && employed > 0 && !ownerBankrupt) {
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
}

/** Mutable state-wide labor pool, decremented as each factory in the state
 * claims its share — this is what makes employment exclusive across factories
 * instead of every factory independently claiming the full state population. */
interface StateLaborPool {
  craftsRemaining: number;
  clerksRemaining: number;
}

function processFactory(
  world: World,
  state: State,
  factory: Factory,
  buckets: Record<string, number[]>,
  recipes: Record<string, Recipe>,
  factoryTechBoost: number,
  factoryProfitBoost: number,
  pool: StateLaborPool,
): number {
  const recipe = recipes[factory.recipe];
  if (!recipe || recipe.building !== 'factory') return 0;

  const owner = world.nations[state.owner];
  const craftsmanIds = buckets.craftsman;
  const clerkIds = buckets.clerk;
  const capitalistIds = buckets.capitalist;
  // Wage distribution below spreads each factory's wage pool across the WHOLE
  // state craftsman/clerk cohort (unchanged behaviour — a factory's payroll is
  // shared income for the trade, not a per-worker wage). These totals are only
  // the distribution weight; how much a factory can actually EMPLOY (and thus
  // how much output/revenue it generates) is capped by the shared pool below.
  const totalCrafts = totalPopSize(world, craftsmanIds);
  const totalClerks = totalPopSize(world, clerkIds);

  const capacity = Math.max(1, factory.level) * 2300;
  const employedClerks = Math.min(Math.max(0, pool.clerksRemaining), capacity * 0.2);
  const employedCrafts = Math.min(Math.max(0, pool.craftsRemaining), capacity - employedClerks);
  pool.clerksRemaining -= employedClerks;
  pool.craftsRemaining -= employedCrafts;
  const employed = employedCrafts + employedClerks;
  factory.employed = employed;
  factory.workerShare = employedCrafts;
  factory.clerkShare = employedClerks;
  factory.lastCapacity = capacity;

  if (employed <= 0) {
    factory.weeklyProfit = -BALANCE.economy.factoryIdleLoss;
    factory.lastOutput = 0;
    factory.lastInputCost = 0;
    factory.lastWages = 0;
    factory.lastOperating = BALANCE.economy.factoryIdleLoss;
    factory.lastInputFill = 0;
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
  let inputFill = 1;
  for (const input of recipe.inputs) {
    if (unitTarget <= 0) break;
    // Balance pass: factories consume fewer inputs per output unit so they can
    // survive normal market swings and not collapse into permanent losses.
    const needed = input.amount * unitTarget * BALANCE.economy.factoryInputIntensity;
    const purchase = buyFromMarket(world, state.owner, input.good, needed, Number.POSITIVE_INFINITY);
    inputCost += purchase.spent;
    const ratio = needed > 0 ? purchase.bought / needed : 1;
    inputFill = Math.min(inputFill, ratio);
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
  // 0.7.0: commerce/finance tech (factoryProfit) scales realized revenue.
  const revenue = (settleMode()
    ? priceSaleRevenue(world, recipe.output.good, state.owner, outputAmount)
    : computeSaleRevenue(world, recipe.output.good, state.owner, outputAmount))
    * BALANCE.economy.factoryRevenueMultiplier
    * factoryProfitBoost;

  const wagePool = revenue * BALANCE.economy.factoryWageShare;
  const clerkWages = wagePool * 0.36;
  const craftWages = wagePool - clerkWages;
  const craftWeight = totalCrafts > 0 ? totalCrafts : 1;
  const clerkWeight = totalClerks > 0 ? totalClerks : 1;
  if (!settleMode()) {
    distributeMoney(world, craftsmanIds, craftWeight, craftWages);
    distributeMoney(world, clerkIds, clerkWeight, clerkWages);
  }

  const operating = BALANCE.economy.factoryOperatingBase + factory.level * BALANCE.economy.factoryOperatingPerLevel;
  factory.lastInputCost = inputCost;
  factory.lastWages = wagePool;
  factory.lastOperating = operating;
  factory.lastInputFill = inputFill;
  const netBeforeCapital = revenue - inputCost - wagePool - operating;
  // 0.6.0: with the input-purchase bug fixed, factories actually profit. Route
  // most of that profit to capitalist POPS (taxable — taxes stay the state's
  // lever) instead of the old 18%; the state keeps a small direct share below.
  const capitalistCut = Math.max(0, netBeforeCapital) * 0.55;
  const capitalistWeight = totalPopSize(world, capitalistIds);
  const aristocratIds = buckets.aristocrat ?? [];
  const aristocratWeight = totalPopSize(world, aristocratIds);
  const payCapitalists = (amount: number) => {
    if (capitalistWeight > 0) {
      distributeMoney(world, capitalistIds, capitalistWeight, amount);
    } else if (aristocratWeight > 0) {
      // No capitalists yet (they emerge via promotion): profits accrue to the
      // landed investor class — taxable rich pops — not straight to the state.
      distributeMoney(world, aristocratIds, aristocratWeight, amount);
    } else {
      owner.monthlyProductionIncome += amount;
    }
  };

  if (settleMode()) {
    // Defer every transfer to settle time. Note the asymmetry that makes this
    // economically honest: revenue scales with what actually sold, but inputCost
    // and operating are already sunk. A factory that cannot sell its output
    // books a real loss instead of being paid for goods nobody bought.
    claimsFor(world).push({
      good: recipe.output.good,
      nationId: state.owner,
      supplied: outputAmount,
      grossIfAllSold: revenue,
      wagePool: 0,
      ownerPool: 0,
      statePool: 0,
      wageEligible: [],
      wageWeight: 0,
      owners: [],
      ownerWeight: 0,
      onProfit: () => undefined,
      settleFactory: (rate: number) => {
        const soldRevenue = revenue * rate;
        const soldWagePool = soldRevenue * BALANCE.economy.factoryWageShare;
        const soldClerkWages = soldWagePool * 0.36;
        distributeMoney(world, craftsmanIds, craftWeight, soldWagePool - soldClerkWages);
        distributeMoney(world, clerkIds, clerkWeight, soldClerkWages);
        const net = soldRevenue - inputCost - soldWagePool - operating;
        const cut = Math.max(0, net) * 0.55;
        payCapitalists(cut);
        factory.lastWages = soldWagePool;
        const realized = net - cut;
        applyFactoryProfit(factory, realized, employed, owner.isBankrupt);
        return realized;
      },
    });
  } else {
    payCapitalists(capitalistCut);
  }

  let weeklyProfit = netBeforeCapital - capitalistCut;
  // Keep active industry from collapsing into a permanent loss trap; this acts
  // like a light industrial-policy floor that maintains a minimal profit signal.
  // Under settle clearing the real profit is not known until the market has
  // cleared, so recording is deferred to settleFactory. Recording here as well
  // would write the optimistic figure into the streak counters and the factory
  // would never see a loss.
  if (!settleMode()) applyFactoryProfit(factory, weeklyProfit, employed, owner.isBankrupt);

  // 0.6.0: the old 0.55 direct skim of factory profit into the treasury was
  // tuned against DEAD factories (the input-purchase bug meant output was always
  // 0). Once production woke up it became a tax-independent money fountain that
  // made a zero-tax overextended nation un-bankruptable. Factory value now flows
  // to POPS (wages + the capitalist/aristocrat cut above) and the state captures
  // it only through taxes — the intended lever. A vestigial skim keeps
  // state-capitalism flavour without swamping the budget.
  owner.monthlyProductionIncome += Math.max(0, weeklyProfit * 0.03);
  return weeklyProfit;
}

function rebalanceFactoryLevels(state: State): void {
  const survivors: Factory[] = [];
  const expand = BALANCE.economy.factoryExpansion;
  for (const factory of state.factories) {
    // Expansion must be EARNED, and each storey costs more than the last.
    //
    // Previously any factory with 10 profitable weeks and 70 in reserve added a
    // level, at a flat cost, up to a cap of 10. Every plant simply climbed to
    // the ceiling: the measured average level was ~9, at which point operating
    // cost is 3.7/week and 62% of factories were running at a persistent loss.
    // Growth was not funded by success, it was automatic.
    //
    // Now the bar scales with size, so a plant stops where its own profits stop
    // paying for the next storey. Industry compounds more slowly, which is also
    // truer to the century.
    const cashNeeded = expand.cashBase + (factory.level - 1) * expand.cashPerLevel;
    if (factory.profitableWeeks >= expand.profitableWeeks && factory.cashReserve > cashNeeded) {
      factory.level = clamp(factory.level + 1, 1, expand.maxLevel);
      factory.cashReserve -= cashNeeded * expand.cashSpentShare;
      factory.profitableWeeks = 0;
    }
    if (factory.lossWeeks >= expand.downsizeLossWeeks && factory.level > 1) {
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
  // 0.6.0 / 0.7.0: per-nation tech throughput + factory-profit multipliers.
  const rgoTechBoost = world.nations.map((nation) => 1 + Math.max(0, techModifiersFor(nation, data).rgoThroughput));
  const factoryTechBoost = world.nations.map((nation) => 1 + Math.max(0, techModifiersFor(nation, data).factoryThroughput));
  const factoryProfitBoost = world.nations.map((nation) => 1 + Math.max(0, techModifiersFor(nation, data).factoryProfit ?? 0));
  runRgoProduction(world, recipes, rgoTechBoost);
  for (const state of world.states) {
    const buckets = bucketsByState.get(state.id) ?? {
      craftsman: [],
      clerk: [],
      capitalist: [],
      farmer: [],
      laborer: [],
    };
    // Exclusive labor pool for this state's factories this week — each factory
    // claims from what's left rather than the whole cohort independently (was
    // an N-factories-=-N×-output bug: every factory computed its own capacity
    // against the FULL craftsman/clerk pool with no reservation between them).
    const pool: StateLaborPool = {
      craftsRemaining: totalPopSize(world, buckets.craftsman),
      clerksRemaining: totalPopSize(world, buckets.clerk),
    };
    // Higher-level (more established) factories claim labor first — this also
    // means spamming a brand-new factory can no longer steal an existing
    // factory's workforce; it only picks up whatever labor is left over.
    // state.factories itself is left in its original (build) order; only
    // processing order changes.
    const processingOrder = state.factories
      .map((factory, index) => ({ factory, index }))
      .sort((a, b) => b.factory.level - a.factory.level || a.index - b.index);
    let stateProfit = 0;
    for (const { factory } of processingOrder) {
      stateProfit += processFactory(
        world,
        state,
        factory,
        buckets,
        recipes,
        factoryTechBoost[state.owner] ?? 1,
        factoryProfitBoost[state.owner] ?? 1,
        pool,
      );
    }
    // 0.6.0: trimmed alongside the per-factory skim above (see processFactory).
    world.nations[state.owner].monthlyProductionIncome += Math.max(0, stateProfit * 0.02);
    rebalanceFactoryLevels(state);
  }
}
