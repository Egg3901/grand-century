import type { GameData, Recipe, World } from '../../shared/types';
import type { Rng } from '../rng';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function recipeByKey(data: GameData): Record<string, Recipe> {
  const map: Record<string, Recipe> = {};
  for (const recipe of data.recipes) map[recipe.key] = recipe;
  return map;
}

function addSupply(world: World, good: number, amount: number): void {
  const marketGood = world.market[good];
  if (!marketGood) return;
  const safeAmount = Math.max(0, finite(amount));
  marketGood.supply += safeAmount;
}

function consumeStockpile(world: World, good: number, amount: number): number {
  const marketGood = world.market[good];
  if (!marketGood) return 0;
  const available = Math.max(0, finite(marketGood.worldStockpile));
  const consumed = Math.min(available, Math.max(0, finite(amount)));
  marketGood.worldStockpile = available - consumed;
  return consumed;
}

function employmentUnits(employed: number, level: number): number {
  const safeEmployed = Math.max(0, finite(employed));
  const safeLevel = Math.max(1, finite(level, 1));
  return (safeEmployed / 1000) * safeLevel;
}

export function runProductionWeekly(world: World, data: GameData, _rng: Rng): void {
  const recipes = recipeByKey(data);

  for (const province of world.provinces) {
    const recipe = recipes[province.rgo.recipe];
    if (!recipe || recipe.building !== 'rgo') continue;
    const units = employmentUnits(province.rgo.employed, province.rgo.level);
    addSupply(world, recipe.output.good, recipe.output.amount * units);
  }

  for (const state of world.states) {
    for (const factory of state.factories) {
      const recipe = recipes[factory.recipe];
      if (!recipe || recipe.building !== 'factory') continue;

      const maxUnits = employmentUnits(factory.employed, factory.level);
      let units = maxUnits;
      for (const input of recipe.inputs) {
        const marketGood = world.market[input.good];
        const available = Math.max(0, finite(marketGood?.worldStockpile ?? 0));
        const possible = input.amount > 0 ? available / input.amount : maxUnits;
        units = Math.min(units, possible);
      }
      units = Math.max(0, finite(units));
      if (units <= 0) {
        factory.profitTrend = finite(factory.profitTrend) * 0.85 - 0.2;
        continue;
      }

      for (const input of recipe.inputs) {
        consumeStockpile(world, input.good, input.amount * units);
      }

      const outputAmount = recipe.output.amount * units;
      addSupply(world, recipe.output.good, outputAmount);
      factory.profitTrend = finite(factory.profitTrend) * 0.8 + outputAmount * 0.005;
      factory.stockpileIn = Math.max(0, finite(factory.stockpileIn) * 0.5 + units * 0.1);
    }
  }
}
