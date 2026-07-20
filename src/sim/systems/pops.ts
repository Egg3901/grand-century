import type { GameData, PopType, World } from '../../shared/types';
import type { Rng } from '../rng';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addDemand(world: World, good: number, amount: number): void {
  const marketGood = world.market[good];
  if (!marketGood) return;
  marketGood.demand += Math.max(0, finite(amount));
}

function popIncome(popType: PopType, size: number): number {
  const units = Math.max(0, finite(size)) / 1000;
  switch (popType) {
    case 'aristocrat':
    case 'capitalist':
      return units * 3.1;
    case 'officer':
    case 'clergy':
    case 'clerk':
      return units * 2.0;
    case 'craftsman':
    case 'soldier':
      return units * 1.6;
    case 'slave':
      return units * 0.6;
    default:
      return units * 1.3;
  }
}

export function runPopsWeekly(world: World, data: GameData, _rng: Rng): void {
  const goodByKey = Object.fromEntries(data.goods.map((good) => [good.key, good.id])) as Record<string, number>;
  const grain = goodByKey.grain ?? 0;
  const cattle = goodByKey.cattle ?? grain;
  const fish = goodByKey.fish ?? grain;
  const clothes = goodByKey.clothes ?? grain;
  const liquor = goodByKey.liquor ?? grain;

  const grainPrice = Math.max(0.1, finite(world.market[grain]?.price, 2));
  const cattlePrice = Math.max(0.1, finite(world.market[cattle]?.price, grainPrice));
  const fishPrice = Math.max(0.1, finite(world.market[fish]?.price, grainPrice));
  const clothesPrice = Math.max(0.1, finite(world.market[clothes]?.price, grainPrice * 2));
  const liquorPrice = Math.max(0.1, finite(world.market[liquor]?.price, grainPrice * 2));

  for (const pop of world.pops) {
    if (pop.size <= 0) {
      pop.size = 0;
      pop.needsMet = 0;
      continue;
    }

    pop.money = Math.max(0, finite(pop.money) + popIncome(pop.type, pop.size));

    const units = pop.size / 1000;
    const grainNeed = units * 0.6;
    const proteinNeed = units * 0.35;
    const clothesNeed = units * 0.08;
    const liquorNeed = units * 0.04;
    const lifeCost = grainNeed * grainPrice + proteinNeed * ((cattlePrice + fishPrice) * 0.5);
    const everydayCost = clothesNeed * clothesPrice + liquorNeed * liquorPrice;
    const totalCost = Math.max(0.1, lifeCost + everydayCost);
    const affordable = clamp(pop.money / totalCost, 0, 1);
    const spend = totalCost * affordable;
    pop.money = Math.max(0, pop.money - spend);

    addDemand(world, grain, grainNeed * affordable);
    addDemand(world, cattle, proteinNeed * 0.5 * affordable);
    addDemand(world, fish, proteinNeed * 0.5 * affordable);
    addDemand(world, clothes, clothesNeed * affordable);
    addDemand(world, liquor, liquorNeed * affordable);

    pop.needsMet = clamp(pop.needsMet * 0.65 + affordable * 0.35, 0, 1);
    const militancyDrift = pop.needsMet < 0.5 ? 0.03 : -0.015;
    pop.militancy = clamp(finite(pop.militancy) + militancyDrift, 0, 10);
    pop.consciousness = clamp(finite(pop.consciousness) + (pop.needsMet < 0.4 ? -0.005 : 0.004), 0, 10);
  }
}

export function runPopsMonthly(world: World, _data: GameData, rng: Rng): void {
  for (const pop of world.pops) {
    const size = Math.max(0, finite(pop.size));
    const growthBase = 0.0006 + (pop.needsMet - 0.5) * 0.0012;
    const growthNoise = (rng.next() - 0.5) * 0.0002;
    const growthRate = clamp(growthBase + growthNoise, -0.002, 0.004);
    const nextSize = Math.max(0, Math.floor(size * (1 + growthRate)));

    pop.size = Number.isFinite(nextSize) ? nextSize : size;
    if (pop.needsMet < 0.35) pop.militancy = clamp(pop.militancy + 0.08, 0, 10);
    if (pop.needsMet > 0.75) pop.militancy = clamp(pop.militancy - 0.05, 0, 10);
  }
}
