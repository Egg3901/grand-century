import type { GameData, World } from '../../shared/types';
import type { Rng } from '../rng';

const MIN_PRICE = 0.05;
const MAX_PRICE = 1_000_000;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function runMarketDaily(world: World, data: GameData, _rng: Rng): void {
  for (let i = 0; i < world.market.length; i++) {
    const marketGood = world.market[i];
    const def = data.goods[marketGood.good];
    if (!def) continue;

    const supply = Math.max(0, finite(marketGood.supply));
    const demand = Math.max(0, finite(marketGood.demand));
    const currentPrice = clamp(finite(marketGood.price, def.basePrice), MIN_PRICE, MAX_PRICE);
    const targetPrice = clamp(def.basePrice * ((demand + 1) / (supply + 1)), MIN_PRICE, MAX_PRICE);
    const nextPrice = currentPrice + (targetPrice - currentPrice) * 0.025;

    marketGood.price = clamp(finite(nextPrice, def.basePrice), MIN_PRICE, MAX_PRICE);
    marketGood.supply = supply;
    marketGood.demand = demand;
    marketGood.worldStockpile = Math.max(0, finite(marketGood.worldStockpile));
  }
}

export function runMarketWeekly(world: World, _data: GameData, _rng: Rng): void {
  for (let i = 0; i < world.market.length; i++) {
    const marketGood = world.market[i];
    const delta = marketGood.supply - marketGood.demand;
    const stockpileStep = clamp(delta * 0.3, -2000, 2000);
    marketGood.worldStockpile = Math.max(0, finite(marketGood.worldStockpile) + stockpileStep);

    // Keep momentum from the last week but prevent unlimited growth.
    marketGood.supply = Math.max(0, finite(marketGood.supply) * 0.35);
    marketGood.demand = Math.max(0, finite(marketGood.demand) * 0.35);
  }
}
