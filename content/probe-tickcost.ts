/**
 * #30 probe: where does the daily tick spend its time?
 * Runs N sim-years and reports wall-clock per system (per-day mean) and
 * years/sec overall, at three points in the century (world grows over time).
 * Throwaway instrumentation, not part of the suite.
 */
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

const seed = Number(process.argv[2] ?? 6602);
const years = Number(process.argv[3] ?? 30);
const data = GAME_DATA;
const world = createWorld(data, seed);
for (const nation of world.nations) nation.isPlayer = false;

function runYears(n: number): number {
  const start = performance.now();
  for (let day = 0; day < n * 365; day++) advanceDay(world, data);
  return performance.now() - start;
}

for (let block = 0; block < Math.ceil(years / 10); block++) {
  const ms = runYears(10);
  const year = 1820 + (block + 1) * 10;
  console.log(`to ${year}: ${(ms / 1000).toFixed(1)}s for 10y -> ${(10 / (ms / 1000)).toFixed(2)} years/sec, pops=${world.pops.length}, factories=${world.states.reduce((s, st) => s + st.factories.length, 0)}`);
}
