/**
 * #41 probe: where does needs-met decay between year 30 and 60?
 * Runs seed 6602 for 60 years, AI-only, and prints a 5-year checkpoint table:
 * needs-met + money-cover + size share by pop type, factory count/levels,
 * world fill, price index, population.
 * Throwaway instrumentation, not part of the suite.
 */
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import type { PopType, World } from '../src/shared/types';

const seed = Number(process.argv[2] ?? 6602);
const years = Number(process.argv[3] ?? 60);
const data = GAME_DATA;
const world = createWorld(data, seed);
for (const nation of world.nations) nation.isPlayer = false;

const TYPES: PopType[] = ['farmer', 'laborer', 'craftsman', 'clerk', 'aristocrat', 'capitalist'];

function basketCostPer1000(type: PopType): number {
  const needs = data.popNeeds[type];
  if (!needs) return 0;
  let cost = 0;
  for (const need of [...needs.life, ...needs.everyday, ...needs.luxury]) {
    cost += need.amount * (world.market[need.good]?.price ?? 0);
  }
  return cost;
}

function checkpoint(w: World, year: number): void {
  const byType: Record<string, { size: number; needs: number; money: number }> = {};
  for (const t of TYPES) byType[t] = { size: 0, needs: 0, money: 0 };
  let totalSize = 0;
  for (const pop of w.pops) {
    const bucket = byType[pop.type];
    if (!bucket) continue;
    const size = Math.max(0, pop.size);
    bucket.size += size;
    bucket.needs += pop.needsMet * size;
    bucket.money += Math.max(0, pop.money);
    totalSize += size;
  }
  let factories = 0;
  let levels = 0;
  for (const state of w.states) {
    factories += state.factories.length;
    for (const f of state.factories) levels += f.level;
  }
  let sold = 0;
  let demand = 0;
  let shortGoods = 0;
  for (const g of w.market) {
    sold += g.sold;
    demand += g.demand;
    if (g.unmet > 0.5) shortGoods++;
  }
  let priceIdx = 0;
  for (const g of w.market) {
    const base = data.goods[g.good]?.basePrice ?? 1;
    priceIdx += g.price / base;
  }
  priceIdx /= w.market.length;

  const parts = TYPES.map((t) => {
    const b = byType[t]!;
    const nm = b.size > 0 ? b.needs / b.size : 0;
    const cover = b.size > 0 ? b.money / Math.max(1e-9, basketCostPer1000(t) * (b.size / 1000)) : 0;
    return `${t}: nm=${nm.toFixed(3)} share=${(100 * b.size / Math.max(1, totalSize)).toFixed(1)}% cover=${cover.toFixed(1)}x`;
  });
  console.log(`\n== year ${year} == pop=${Math.round(totalSize / 1e6)}M factories=${factories} (lvl sum ${levels}) fill=${demand > 0 ? (100 * sold / demand).toFixed(1) : '-'}% shortGoods=${shortGoods}/30 priceIdx=${priceIdx.toFixed(2)}`);
  for (const p of parts) console.log('   ' + p);
}

checkpoint(world, 1820);
for (let year = 1; year <= years; year++) {
  for (let day = 0; day < 365; day++) advanceDay(world, data);
  if (year % 5 === 0) checkpoint(world, 1820 + year);
}
