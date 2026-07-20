import type { GameData, GoodId, NationId, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';

const MIN_PRICE = BALANCE.economy.minPrice;
const MAX_PRICE = BALANCE.economy.maxPrice;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function importMultiplier(rate: number): number {
  const positive = Math.max(0, finite(rate));
  return 1 + positive * 0.5;
}

function exportMultiplier(rate: number): number {
  const positive = Math.max(0, finite(rate));
  return Math.max(0.75, 1 - positive * 0.2);
}

export function beginMarketWeek(world: World): void {
  for (let i = 0; i < world.market.length; i++) {
    const marketGood = world.market[i];
    const runtime = world.marketRuntime[i];
    runtime.good = marketGood.good;
    runtime.stockpileStart = Math.max(0, finite(marketGood.worldStockpile));
    runtime.remainingProducer = 0;
    runtime.remainingStockpile = runtime.stockpileStart;
    runtime.producerSupply = 0;
    runtime.requestedDemand = 0;
    runtime.consumerBought = 0;
    runtime.stockpileBuy = 0;
    runtime.stockpileSell = 0;
  }
}

export function registerSupply(world: World, good: GoodId, amount: number): number {
  const runtime = world.marketRuntime[good];
  if (!runtime) return 0;
  const safeAmount = Math.max(0, finite(amount));
  runtime.producerSupply += safeAmount;
  runtime.remainingProducer += safeAmount;
  return safeAmount;
}

export function computeSaleRevenue(world: World, good: GoodId, nationId: NationId, amount: number): number {
  const nation = world.nations[nationId];
  const marketGood = world.market[good];
  if (!nation || !marketGood) return 0;

  const safeAmount = Math.max(0, finite(amount));
  const baseUnit = Math.max(MIN_PRICE, finite(marketGood.price));
  const mult = exportMultiplier(nation.tariffRate);
  const receivedPerUnit = baseUnit * mult;
  const tariffCut = baseUnit * safeAmount - receivedPerUnit * safeAmount;
  if (tariffCut > 0) nation.monthlyTariffIncome += tariffCut;
  return receivedPerUnit * safeAmount;
}

export interface MarketPurchaseResult {
  bought: number;
  spent: number;
  unmet: number;
  unitPrice: number;
}

export function buyFromMarket(
  world: World,
  nationId: NationId,
  good: GoodId,
  desiredAmount: number,
  availableBudget: number,
): MarketPurchaseResult {
  const runtime = world.marketRuntime[good];
  const marketGood = world.market[good];
  const nation = world.nations[nationId];
  if (!runtime || !marketGood || !nation) {
    return { bought: 0, spent: 0, unmet: Math.max(0, finite(desiredAmount)), unitPrice: 0 };
  }

  const desired = Math.max(0, finite(desiredAmount));
  runtime.requestedDemand += desired;

  const baseUnit = Math.max(MIN_PRICE, finite(marketGood.price));
  const buyMult = importMultiplier(nation.tariffRate);
  const unitPrice = baseUnit * buyMult;

  const available = Math.max(0, runtime.remainingProducer + runtime.remainingStockpile);
  const budgetLimited = unitPrice > 0 ? Math.max(0, finite(availableBudget)) / unitPrice : desired;
  const bought = Math.min(desired, available, budgetLimited);
  const fromProducer = Math.min(bought, runtime.remainingProducer);
  const fromStockpile = Math.max(0, bought - fromProducer);
  runtime.remainingProducer -= fromProducer;
  runtime.remainingStockpile -= fromStockpile;
  runtime.stockpileSell += fromStockpile;
  runtime.consumerBought += bought;

  const spent = bought * unitPrice;
  const tariffIncome = bought * baseUnit * Math.max(0, buyMult - 1);
  if (tariffIncome > 0) nation.monthlyTariffIncome += tariffIncome;

  return {
    bought,
    spent,
    unmet: Math.max(0, desired - bought),
    unitPrice,
  };
}

export function runMarketDaily(world: World, data: GameData, _rng: Rng): void {
  for (let i = 0; i < world.market.length; i++) {
    const marketGood = world.market[i];
    const def = data.goods[marketGood.good];
    if (!def) continue;
    marketGood.price = clamp(finite(marketGood.price, def.basePrice), MIN_PRICE, MAX_PRICE);
    marketGood.worldStockpile = Math.max(0, finite(marketGood.worldStockpile));
    marketGood.supply = Math.max(0, finite(marketGood.supply));
    marketGood.demand = Math.max(0, finite(marketGood.demand));
    marketGood.sold = Math.max(0, finite(marketGood.sold));
  }
}

export function runMarketWeekly(world: World, data: GameData, _rng: Rng): void {
  for (let i = 0; i < world.market.length; i++) {
    const marketGood = world.market[i];
    const runtime = world.marketRuntime[i];
    const def = data.goods[marketGood.good];
    if (!runtime || !def) continue;

    const stockpileBuy = Math.max(0, runtime.remainingProducer);
    runtime.stockpileBuy = stockpileBuy;
    runtime.remainingProducer = 0;
    runtime.remainingStockpile += stockpileBuy;

    const supply = runtime.producerSupply + runtime.stockpileSell;
    const sold = runtime.consumerBought + runtime.stockpileBuy;
    const demand = runtime.requestedDemand + runtime.stockpileBuy;
    const stockpileEnd = Math.max(0, runtime.remainingStockpile);
    const residual = (runtime.producerSupply + runtime.stockpileStart) - (runtime.consumerBought + stockpileEnd);

    const effectiveSupply = runtime.producerSupply + runtime.stockpileStart * 0.35;
    const ratio = (runtime.requestedDemand + 1) / (effectiveSupply + 1);
    const pressure = clamp(Math.log(ratio), -1.15, 1.15);
    const damping = 0.16;
    const currentPrice = clamp(finite(marketGood.price, def.basePrice), MIN_PRICE, MAX_PRICE);
    const targetPrice = clamp(currentPrice * Math.exp(pressure * damping), MIN_PRICE, MAX_PRICE);
    const nextPrice = clamp(currentPrice + (targetPrice - currentPrice) * 0.45, MIN_PRICE, MAX_PRICE);

    marketGood.price = nextPrice;
    marketGood.supply = Math.max(0, finite(supply));
    marketGood.demand = Math.max(0, finite(demand));
    marketGood.sold = Math.max(0, finite(sold));
    marketGood.worldStockpile = stockpileEnd;
    marketGood.trend = [...marketGood.trend.slice(-7), nextPrice];
    marketGood.priceTrace = {
      basePrice: def.basePrice,
      ratio,
      damping,
      requestedDemand: runtime.requestedDemand,
      effectiveSupply,
      stockpileStart: runtime.stockpileStart,
      stockpileEnd,
    };

    world.marketInvariants[i] = {
      good: marketGood.good,
      supply: marketGood.supply,
      sold: marketGood.sold,
      stockpileStart: runtime.stockpileStart,
      stockpileEnd,
      residual,
      ok: Math.abs(residual) <= 1e-6 && Number.isFinite(residual),
    };
  }
}
