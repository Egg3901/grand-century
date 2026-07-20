import type { GameData, Pop, PopType, ProvinceId, World } from '../../shared/types';
import type { Rng } from '../rng';
import { buyFromMarket } from './market';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function passiveIncome(popType: PopType, size: number): number {
  const units = Math.max(0, finite(size)) / 1000;
  switch (popType) {
    case 'aristocrat':
      return units * 3.2;
    case 'capitalist':
      return units * 2.4;
    case 'clergy':
    case 'officer':
      return units * 1.8;
    case 'clerk':
      return units * 1.5;
    case 'soldier':
      return units * 1.1;
    case 'slave':
      return units * 0.4;
    default:
      return units * 0.4;
  }
}

function provinceOwner(world: World, provinceId: ProvinceId): number {
  const province = world.provinces[provinceId];
  if (!province) return 0;
  return province.owner;
}

function popUrbanization(world: World, pop: Pop): number {
  const province = world.provinces[pop.provinceId];
  if (!province) return 0;
  const state = world.states[province.stateId];
  if (!state) return 0;
  const factoryLevel = state.factories.reduce((sum, factory) => sum + factory.level, 0);
  return clamp(factoryLevel / Math.max(1, state.provinceIds.length * 10), 0, 1);
}

function createPop(world: World, source: Pop, provinceId: number, targetType: PopType, size: number, money: number): Pop {
  const newPop: Pop = {
    id: world.nextPopId++,
    type: targetType,
    provinceId,
    size,
    culture: source.culture,
    religion: source.religion,
    money,
    militancy: source.militancy,
    consciousness: source.consciousness,
    needsMet: source.needsMet,
    lastGrowth: 0,
    ideology: source.ideology,
  };
  world.pops.push(newPop);
  const province = world.provinces[provinceId];
  if (province) province.popIds.push(newPop.id);
  return newPop;
}

function mergeOrCreatePop(world: World, source: Pop, provinceId: number, targetType: PopType, size: number, money: number): void {
  if (size <= 0) return;
  const province = world.provinces[provinceId];
  if (!province) return;
  const mergeId = province.popIds.find((popId) => {
    const candidate = world.pops[popId];
    return candidate
      && candidate.type === targetType
      && candidate.culture === source.culture
      && candidate.religion === source.religion;
  });
  if (mergeId !== undefined) {
    const target = world.pops[mergeId];
    target.size += size;
    target.money += money;
    target.needsMet = clamp((target.needsMet + source.needsMet) * 0.5, 0, 1);
    return;
  }
  createPop(world, source, provinceId, targetType, size, money);
}

function convertPopPortion(world: World, pop: Pop, targetType: PopType, amount: number): number {
  const converted = Math.max(0, Math.floor(Math.min(pop.size, finite(amount))));
  if (converted <= 0 || targetType === pop.type) return 0;
  const sourceSize = Math.max(1, pop.size);
  const moneyShare = pop.money * (converted / sourceSize);
  pop.size -= converted;
  pop.money = Math.max(0, pop.money - moneyShare);
  mergeOrCreatePop(world, pop, pop.provinceId, targetType, converted, moneyShare);
  return converted;
}

function migratePop(world: World, pop: Pop, destination: number, amount: number): number {
  const moved = Math.max(0, Math.floor(Math.min(pop.size, finite(amount))));
  if (moved <= 0 || destination === pop.provinceId) return 0;
  const sourceSize = Math.max(1, pop.size);
  const moneyShare = pop.money * (moved / sourceSize);
  pop.size -= moved;
  pop.money = Math.max(0, pop.money - moneyShare);
  mergeOrCreatePop(world, pop, destination, pop.type, moved, moneyShare);
  return moved;
}

function cleanupPop(pop: Pop): void {
  pop.size = Math.max(0, Number.isFinite(pop.size) ? pop.size : 0);
  pop.money = Math.max(0, Number.isFinite(pop.money) ? pop.money : 0);
  pop.needsMet = clamp(finite(pop.needsMet), 0, 1);
  pop.militancy = clamp(finite(pop.militancy), 0, 10);
  pop.consciousness = clamp(finite(pop.consciousness), 0, 10);
}

export function runPopsWeekly(world: World, data: GameData, _rng: Rng): void {
  for (const pop of world.pops) {
    if (pop.size <= 0) {
      pop.size = 0;
      pop.needsMet = 0;
      continue;
    }

    pop.money = Math.max(0, finite(pop.money) + passiveIncome(pop.type, pop.size));
    const nationId = provinceOwner(world, pop.provinceId);
    const needs = data.popNeeds[pop.type];
    if (!needs) continue;

    const units = pop.size / 1000;
    let lifeNeed = 0;
    let lifeMet = 0;
    let everydayNeed = 0;
    let everydayMet = 0;
    let luxuryNeed = 0;
    let luxuryMet = 0;

    for (const need of needs.life) {
      const desired = Math.max(0, need.amount * units);
      lifeNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      lifeMet += purchase.bought;
    }
    for (const need of needs.everyday) {
      const desired = Math.max(0, need.amount * units);
      everydayNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      everydayMet += purchase.bought;
    }
    for (const need of needs.luxury) {
      const desired = Math.max(0, need.amount * units);
      luxuryNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      luxuryMet += purchase.bought;
    }

    const lifeFrac = lifeNeed > 0 ? lifeMet / lifeNeed : 1;
    const everydayFrac = everydayNeed > 0 ? everydayMet / everydayNeed : 1;
    const luxuryFrac = luxuryNeed > 0 ? luxuryMet / luxuryNeed : 1;
    const combinedNeeds = clamp(lifeFrac * 0.72 + everydayFrac * 0.28, 0, 1);
    pop.needsMet = clamp(pop.needsMet * 0.45 + combinedNeeds * 0.55, 0, 1);

    const unmet = 1 - pop.needsMet;
    pop.militancy = clamp(pop.militancy + unmet * 0.16 - pop.needsMet * 0.05, 0, 10);
    const literacy = world.nations[nationId]?.literacy ?? 0;
    const urbanization = popUrbanization(world, pop);
    pop.consciousness = clamp(
      pop.consciousness
      + literacy * 0.03
      + urbanization * 0.02
      + luxuryFrac * 0.01
      - unmet * 0.01,
      0,
      10,
    );
    cleanupPop(pop);
  }
}

function provinceScores(world: World): { score: number; openings: number }[] {
  const scores = world.provinces.map(() => ({ score: 0, openings: 0 }));
  for (const province of world.provinces) {
    const state = world.states[province.stateId];
    let avgNeeds = 0;
    let count = 0;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      avgNeeds += pop.needsMet;
      count += 1;
    }
    avgNeeds = count > 0 ? avgNeeds / count : 0;

    const rgoCapacity = province.rgo.level * 2600;
    const rgoOpenings = Math.max(0, rgoCapacity - province.rgo.employed);
    const factoryOpenings = state
      ? Math.max(0, state.factories.reduce((sum, f) => sum + f.level * 2300, 0) - state.factories.reduce((sum, f) => sum + f.employed, 0))
      : 0;
    const openings = rgoOpenings + factoryOpenings;
    const score = avgNeeds + clamp(openings / 5000, 0, 0.45);
    scores[province.id] = { score, openings };
  }
  return scores;
}

function nationSoldierDemand(world: World): Map<number, number> {
  const result = new Map<number, number>();
  const populationByNation = new Map<number, number>();
  const soldiersByNation = new Map<number, number>();
  for (const pop of world.pops) {
    if (pop.size <= 0) continue;
    const nationId = provinceOwner(world, pop.provinceId);
    populationByNation.set(nationId, (populationByNation.get(nationId) ?? 0) + pop.size);
    if (pop.type === 'soldier') soldiersByNation.set(nationId, (soldiersByNation.get(nationId) ?? 0) + pop.size);
  }
  for (const nation of world.nations) {
    const total = populationByNation.get(nation.id) ?? 0;
    const soldier = soldiersByNation.get(nation.id) ?? 0;
    const reform = nation.reforms.army_professionalism ?? 0;
    const targetShare = 0.045 + reform * 0.015;
    const desired = total * targetShare;
    result.set(nation.id, Math.max(0, desired - soldier));
  }
  return result;
}

function isAcceptedCulture(world: World, pop: Pop): boolean {
  const nationId = provinceOwner(world, pop.provinceId);
  const nation = world.nations[nationId];
  if (!nation) return false;
  return pop.culture === nation.primaryCulture || nation.acceptedCultures.includes(pop.culture);
}

export function runPopsMonthly(world: World, _data: GameData, rng: Rng): void {
  const scores = provinceScores(world);
  const bestDestination = new Map<number, number>();
  const bestScore = new Map<number, number>();
  for (const province of world.provinces) {
    const owner = province.owner;
    const entry = scores[province.id];
    if (entry.openings <= 50) continue;
    if ((bestScore.get(owner) ?? -Infinity) < entry.score) {
      bestScore.set(owner, entry.score);
      bestDestination.set(owner, province.id);
    }
  }

  const stateFactoryOpenings = new Map<number, number>();
  for (const state of world.states) {
    const capacity = state.factories.reduce((sum, f) => sum + f.level * 2300, 0);
    const employed = state.factories.reduce((sum, f) => sum + f.employed, 0);
    stateFactoryOpenings.set(state.id, Math.max(0, capacity - employed));
  }
  const soldierDemand = nationSoldierDemand(world);

  for (const pop of world.pops) {
    if (pop.size <= 0) {
      cleanupPop(pop);
      continue;
    }
    const nationId = provinceOwner(world, pop.provinceId);
    const nation = world.nations[nationId];
    const literacy = nation?.literacy ?? 0;
    const healthcareLevel = nation?.reforms.healthcare ?? 0;

    const noise = (rng.next() - 0.5) * 0.001;
    const growthRate = clamp(-0.004 + pop.needsMet * 0.010 + healthcareLevel * 0.0008 + noise, -0.008, 0.01);
    const growthDelta = Math.floor(pop.size * growthRate);
    pop.size = Math.max(0, pop.size + growthDelta);
    pop.lastGrowth = growthDelta;

    const urban = popUrbanization(world, pop);
    pop.consciousness = clamp(pop.consciousness + literacy * 0.16 + urban * 0.05 - (1 - pop.needsMet) * 0.04, 0, 10);
    pop.militancy = clamp(pop.militancy + (0.55 - pop.needsMet) * 0.35, 0, 10);

    if ((pop.type === 'farmer' || pop.type === 'laborer') && pop.size > 250) {
      const destination = bestDestination.get(nationId);
      const targetScore = bestScore.get(nationId) ?? 0;
      const currentScore = scores[pop.provinceId]?.score ?? 0;
      if (destination !== undefined && destination !== pop.provinceId && targetScore > currentScore + 0.08) {
        const moving = Math.floor(pop.size * clamp(0.012 + (targetScore - currentScore) * 0.02, 0.008, 0.04));
        migratePop(world, pop, destination, moving);
      }
    }

    const province = world.provinces[pop.provinceId];
    const stateId = province?.stateId ?? -1;
    const openings = stateFactoryOpenings.get(stateId) ?? 0;
    if ((pop.type === 'farmer' || pop.type === 'laborer') && pop.needsMet > 0.62 && literacy > 0.2 && openings > 10) {
      const promoted = convertPopPortion(world, pop, 'craftsman', pop.size * 0.012);
      stateFactoryOpenings.set(stateId, Math.max(0, openings - promoted));
    } else if (pop.type === 'craftsman' && (pop.needsMet < 0.34 || openings < 5)) {
      convertPopPortion(world, pop, 'laborer', pop.size * 0.014);
    }

    if ((pop.type === 'farmer' || pop.type === 'laborer' || pop.type === 'craftsman') && isAcceptedCulture(world, pop)) {
      const demand = soldierDemand.get(nationId) ?? 0;
      if (demand > 20 && pop.needsMet > 0.45) {
        const converted = convertPopPortion(world, pop, 'soldier', Math.min(demand, pop.size * 0.008));
        soldierDemand.set(nationId, Math.max(0, demand - converted));
      }
    } else if (pop.type === 'soldier' && pop.needsMet < 0.35) {
      convertPopPortion(world, pop, 'laborer', pop.size * 0.01);
    }

    cleanupPop(pop);
  }
}
