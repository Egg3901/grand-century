import type { GameData, Pop, PopMobilityLedger, PopType, ProvinceId, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { buyFromMarket } from './market';
import { techModifiersFor } from './research';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyMobilityLedger(day: number): PopMobilityLedger {
  return { day, migrated: 0, migrations: [], conversions: [] };
}

function recordMigration(world: World, pop: Pop, amount: number): void {
  if (amount <= 0 || !world.popMobilityLedger) return;
  if (provinceOwner(world, pop.provinceId) !== world.playerNation) return;
  const ledger = world.popMobilityLedger;
  ledger.migrated += amount;
  const row = ledger.migrations.find((entry) => entry.type === pop.type);
  if (row) row.amount += amount;
  else ledger.migrations.push({ type: pop.type, amount });
}

function recordConversion(world: World, pop: Pop, targetType: PopType, amount: number): void {
  if (amount <= 0 || !world.popMobilityLedger || targetType === pop.type) return;
  if (provinceOwner(world, pop.provinceId) !== world.playerNation) return;
  const ledger = world.popMobilityLedger;
  const row = ledger.conversions.find((entry) => entry.from === pop.type && entry.to === targetType);
  if (row) row.amount += amount;
  else ledger.conversions.push({ from: pop.type, to: targetType, amount });
}

function passiveIncome(popType: PopType, size: number): number {
  const units = Math.max(0, finite(size)) / 1000;
  const scale = BALANCE.population.passiveIncomeScale;
  switch (popType) {
    case 'aristocrat':
      return units * 3.2 * scale;
    case 'capitalist':
      return units * 2.4 * scale;
    case 'clergy':
    case 'officer':
      return units * 1.8 * scale;
    case 'clerk':
      return units * 1.5 * scale;
    case 'soldier':
      return units * 1.1 * scale;
    case 'slave':
      return units * 0.4 * scale;
    default:
      return units * 0.4 * scale;
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
    lifeNeedsFrac: source.lifeNeedsFrac,
    everydayNeedsFrac: source.everydayNeedsFrac,
    luxuryNeedsFrac: source.luxuryNeedsFrac,
    scarceGoods: source.scarceGoods?.map((entry) => ({ ...entry })),
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
    const priorSize = Math.max(0, target.size);
    const incoming = Math.max(0, size);
    const totalSize = priorSize + incoming;
    target.size += size;
    target.money += money;
    if (totalSize > 0) {
      target.needsMet = clamp(
        (target.needsMet * priorSize + source.needsMet * incoming) / totalSize,
        0,
        1,
      );
      const targetLife = target.lifeNeedsFrac ?? target.needsMet;
      const sourceLife = source.lifeNeedsFrac ?? source.needsMet;
      target.lifeNeedsFrac = clamp((targetLife * priorSize + sourceLife * incoming) / totalSize, 0, 1);
      const targetEveryday = target.everydayNeedsFrac ?? target.needsMet;
      const sourceEveryday = source.everydayNeedsFrac ?? source.needsMet;
      target.everydayNeedsFrac = clamp((targetEveryday * priorSize + sourceEveryday * incoming) / totalSize, 0, 1);
      const targetLuxury = target.luxuryNeedsFrac ?? 1;
      const sourceLuxury = source.luxuryNeedsFrac ?? 1;
      target.luxuryNeedsFrac = clamp((targetLuxury * priorSize + sourceLuxury * incoming) / totalSize, 0, 1);
    }
    return;
  }
  createPop(world, source, provinceId, targetType, size, money);
}

function convertPopPortion(world: World, pop: Pop, targetType: PopType, amount: number): number {
  const converted = Math.max(0, Math.floor(Math.min(pop.size, finite(amount))));
  if (converted <= 0 || targetType === pop.type) return 0;
  recordConversion(world, pop, targetType, converted);
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
  recordMigration(world, pop, moved);
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
    const scarce: { good: number; fill: number }[] = [];

    for (const need of needs.life) {
      const desired = Math.max(0, need.amount * units);
      lifeNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      lifeMet += purchase.bought;
      if (desired > 0) {
        const fill = purchase.bought / desired;
        if (fill < 0.98) scarce.push({ good: need.good, fill });
      }
    }
    for (const need of needs.everyday) {
      const desired = Math.max(0, need.amount * units);
      everydayNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      everydayMet += purchase.bought;
      if (desired > 0) {
        const fill = purchase.bought / desired;
        if (fill < 0.98) scarce.push({ good: need.good, fill });
      }
    }
    for (const need of needs.luxury) {
      const desired = Math.max(0, need.amount * units);
      luxuryNeed += desired;
      const purchase = buyFromMarket(world, nationId, need.good, desired, pop.money);
      pop.money = Math.max(0, pop.money - purchase.spent);
      luxuryMet += purchase.bought;
      if (desired > 0) {
        const fill = purchase.bought / desired;
        if (fill < 0.98) scarce.push({ good: need.good, fill });
      }
    }

    const lifeFrac = lifeNeed > 0 ? lifeMet / lifeNeed : 1;
    const everydayFrac = everydayNeed > 0 ? everydayMet / everydayNeed : 1;
    const luxuryFrac = luxuryNeed > 0 ? luxuryMet / luxuryNeed : 1;
    pop.lifeNeedsFrac = clamp(lifeFrac, 0, 1);
    pop.everydayNeedsFrac = clamp(everydayFrac, 0, 1);
    pop.luxuryNeedsFrac = clamp(luxuryFrac, 0, 1);
    scarce.sort((a, b) => a.fill - b.fill);
    pop.scarceGoods = scarce.slice(0, 4);
    const combinedNeeds = clamp(lifeFrac * 0.72 + everydayFrac * 0.28, 0, 1);
    pop.needsMet = clamp(
      pop.needsMet * BALANCE.population.weeklyNeedsPreviousWeight
      + combinedNeeds * BALANCE.population.weeklyNeedsCurrentWeight,
      0,
      1,
    );

    const unmet = 1 - pop.needsMet;
    pop.militancy = clamp(
      pop.militancy
      + unmet * BALANCE.population.weeklyMilitancyFromUnmet
      - pop.needsMet * BALANCE.population.weeklyMilitancyFromMetRelief,
      0,
      10,
    );
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

    const rgoCapacity = province.rgo.level * BALANCE.economy.rgoEmploymentPerLevel;
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

export function runPopsMonthly(world: World, data: GameData, rng: Rng): void {
  world.popMobilityLedger = emptyMobilityLedger(world.day);
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
  // Clerk-specific openings (factory clerk capacity is 20% of total capacity,
  // see economy.ts processFactory) and a profitable-factory signal, so
  // craftsman->clerk->capitalist promotion tracks the same labor market that
  // actually employs them, instead of being a flat unconditional drip.
  const stateClerkOpenings = new Map<number, number>();
  const stateHasProfitableFactory = new Map<number, boolean>();
  for (const state of world.states) {
    const capacity = state.factories.reduce((sum, f) => sum + f.level * 2300, 0);
    const employed = state.factories.reduce((sum, f) => sum + f.employed, 0);
    stateFactoryOpenings.set(state.id, Math.max(0, capacity - employed));
    const clerkCapacity = state.factories.reduce((sum, f) => sum + (f.lastCapacity || f.level * 2300) * 0.2, 0);
    const clerkEmployed = state.factories.reduce((sum, f) => sum + f.clerkShare, 0);
    stateClerkOpenings.set(state.id, Math.max(0, clerkCapacity - clerkEmployed));
    stateHasProfitableFactory.set(state.id, state.factories.some((f) => f.weeklyProfit > 0));
  }
  const soldierDemand = nationSoldierDemand(world);

  // Process only cohorts present at month start so newly split/promoted pops
  // don't receive another full monthly growth/conversion pass immediately.
  const monthStartPopCount = world.pops.length;
  for (let popIndex = 0; popIndex < monthStartPopCount; popIndex++) {
    const pop = world.pops[popIndex];
    if (!pop) continue;
    if (pop.size <= 0) {
      cleanupPop(pop);
      continue;
    }
    const nationId = provinceOwner(world, pop.provinceId);
    const nation = world.nations[nationId];
    const literacy = nation?.literacy ?? 0;
    const healthcareLevel = nation?.reforms.healthcare ?? 0;
    // 0.7.0: medicine / hygiene techs add a small growth-rate bonus (still
    // clamped by maxGrowthRate so late-game pop doesn't explode).
    const techPopGrowth = nation ? Math.max(0, techModifiersFor(nation, data).popGrowth ?? 0) : 0;

    const noise = (rng.next() - 0.5) * 0.0001;
    const needsScaledGrowthCap = 0.00014 + pop.needsMet * 0.000035;
    const maxGrowthRate = Math.min(BALANCE.population.maxGrowthRate, needsScaledGrowthCap);
    const growthRate = clamp(
      -0.0009 + pop.needsMet * 0.0013 + healthcareLevel * 0.00012 + techPopGrowth + noise,
      BALANCE.population.minGrowthRate,
      maxGrowthRate,
    );
    const growthDelta = Math.floor(pop.size * growthRate);
    pop.size = Math.max(0, pop.size + growthDelta);
    pop.lastGrowth = growthDelta;

    const urban = popUrbanization(world, pop);
    pop.consciousness = clamp(
      pop.consciousness
      + literacy * BALANCE.population.monthlyConsciousnessLiteracy
      + urban * BALANCE.population.monthlyConsciousnessUrban
      - (1 - pop.needsMet) * BALANCE.population.monthlyConsciousnessNeedPenalty,
      0,
      10,
    );
    pop.militancy = clamp(
      pop.militancy
      + (BALANCE.population.monthlyMilitancyBaseline - pop.needsMet) * BALANCE.population.monthlyMilitancyPressure
      - pop.needsMet * BALANCE.population.monthlyMilitancyDecay,
      0,
      10,
    );

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
    if ((pop.type === 'farmer' || pop.type === 'laborer') && pop.needsMet > 0.35 && literacy > 0.12 && openings > 8) {
      const promoted = convertPopPortion(world, pop, 'craftsman', pop.size * 0.025);
      stateFactoryOpenings.set(stateId, Math.max(0, openings - promoted));
    } else if (pop.type === 'craftsman' && (pop.needsMet < 0.08 || openings < 2)) {
      convertPopPortion(world, pop, 'laborer', pop.size * 0.004);
    }

    // Clerk / capitalist ladder: bootstrap seeds these classes at 0 (they only
    // exist via promotion), and previously nothing ever promoted into them —
    // their wage/profit shares in processFactory were dead weight. Craftsmen
    // step into clerk roles where factory clerk capacity exists; well-off
    // clerks slowly become the capitalist/investor class once a state has
    // real profitable industry to invest in.
    const clerkOpenings = stateClerkOpenings.get(stateId) ?? 0;
    if (pop.type === 'craftsman' && pop.needsMet > 0.5 && literacy > 0.2 && clerkOpenings > 8) {
      const promoted = convertPopPortion(world, pop, 'clerk', pop.size * 0.01);
      stateClerkOpenings.set(stateId, Math.max(0, clerkOpenings - promoted));
    } else if (pop.type === 'clerk' && (pop.needsMet < 0.12 || clerkOpenings < 2)) {
      convertPopPortion(world, pop, 'craftsman', pop.size * 0.006);
    } else if (pop.type === 'clerk' && pop.needsMet > 0.6 && (stateHasProfitableFactory.get(stateId) ?? false)) {
      // Deliberately slow and one-way (no capitalist demotion, matching
      // aristocrat) — capitalist count feeds tax bracket/prestige, not job
      // capacity, so this is a treasury-balance lever, not a labor one.
      convertPopPortion(world, pop, 'capitalist', pop.size * 0.002);
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

  const ledger = world.popMobilityLedger;
  if (ledger) {
    ledger.migrations.sort((a, b) => b.amount - a.amount);
    ledger.conversions.sort((a, b) => b.amount - a.amount);
  }
}
