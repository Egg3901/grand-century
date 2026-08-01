/**
 * #30 probe: wall-clock per sim system. Replicates advanceDay's dispatch with
 * timers around each system call. Throwaway instrumentation.
 */
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { Rng } from '../src/sim/rng';
import { dayToDate } from '../src/sim/world';
import { beginMarketWeek, runMarketDaily, runMarketWeekly, runStockpileOrders } from '../src/sim/systems/market';
import { runProductionWeekly, settleProductionWeekly } from '../src/sim/systems/economy';
import { runPopsWeekly, runPopsMonthly } from '../src/sim/systems/pops';
import { runPoliticsMonthly } from '../src/sim/systems/politics';
import { runDiplomacyMonthly } from '../src/sim/systems/diplomacy';
import { runWarDaily } from '../src/sim/systems/war';
import { runBudgetMonthly } from '../src/sim/systems/budget';
import { runAiMonthly } from '../src/sim/systems/ai';
import { runEventsMonthly } from '../src/sim/systems/events';
import { runResearchMonthly } from '../src/sim/systems/research';
import { runCrisisMonthly } from '../src/sim/systems/crisis';
import { runCultureMonthly } from '../src/sim/systems/culture';

const seed = Number(process.argv[2] ?? 6602);
const years = Number(process.argv[3] ?? 15);
const data = GAME_DATA;
const world = createWorld(data, seed);
for (const nation of world.nations) nation.isPlayer = false;

const totals = new Map<string, number>();
function timed(name: string, fn: () => void): void {
  const start = performance.now();
  fn();
  totals.set(name, (totals.get(name) ?? 0) + (performance.now() - start));
}

const start = performance.now();
for (let d = 0; d < years * 365; d++) {
  world.day += 1;
  const rng = new Rng(world.rngState);
  const date = dayToDate(world.day);
  timed('marketDaily', () => runMarketDaily(world, data, rng));
  timed('warDaily', () => runWarDaily(world, data, rng));
  if (world.day % 7 === 0) {
    timed('beginMarketWeek', () => beginMarketWeek(world));
    timed('productionWeekly', () => runProductionWeekly(world, data, rng));
    timed('popsWeekly', () => runPopsWeekly(world, data, rng));
    timed('stockpileOrders', () => runStockpileOrders(world, data, rng));
    timed('settleWeekly', () => settleProductionWeekly(world, data, rng));
    timed('marketWeekly', () => runMarketWeekly(world, data, rng));
  }
  if (date.day === 1) {
    timed('budgetMonthly', () => runBudgetMonthly(world, data, rng));
    timed('popsMonthly', () => runPopsMonthly(world, data, rng));
    timed('cultureMonthly', () => runCultureMonthly(world, data, rng));
    timed('politicsMonthly', () => runPoliticsMonthly(world, data, rng));
    timed('researchMonthly', () => runResearchMonthly(world, data, rng));
    timed('diplomacyMonthly', () => runDiplomacyMonthly(world, data, rng));
    timed('crisisMonthly', () => runCrisisMonthly(world, data, rng));
    timed('eventsMonthly', () => runEventsMonthly(world, data, rng));
    timed('aiMonthly', () => runAiMonthly(world, data, rng));
  }
  world.rngState = rng.state;
}
const totalMs = performance.now() - start;
console.log(`total ${(totalMs / 1000).toFixed(1)}s for ${years}y (${(years / (totalMs / 1000)).toFixed(2)} y/s)`);
for (const [name, ms] of [...totals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(18)} ${(ms / 1000).toFixed(1)}s  ${(100 * ms / totalMs).toFixed(1)}%`);
}
