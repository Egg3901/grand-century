import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

/**
 * F6 — the simulation throughput budget, expressed per province-year.
 *
 * This used to assert an absolute wall clock: median 5-year run under 14 s,
 * worst under 22 s. That number is only meaningful at exactly 620 provinces. A
 * planned density rework raises the province count, at which point an absolute
 * ceiling fails automatically while telling you nothing about whether
 * per-province cost got worse — the only question that actually matters.
 *
 * Stated per province-year the budget survives a change in world size: if
 * doubling the provinces doubles the wall clock, per-province cost is flat and
 * the sim did not regress. If it more than doubles, something is superlinear in
 * province count, and that is worth failing over.
 *
 * See also issue #30 — sim throughput is well below what the browser e2e suite
 * once assumed. This is the honest home for that budget.
 */

/** Sim years per measured run. */
const YEARS = 5;
/** Independent runs; the median is the reported figure. */
const RUNS = 3;

/**
 * Ceiling in microseconds per province-year.
 *
 * This is the OLD ceiling translated, not a new one. The previous gate allowed a
 * median of 14 s for a 5-year run at 620 provinces, i.e.
 * 14_000_000 µs / (620 x 5) = 4_516 µs per province-year. Rounding to 4_500
 * keeps this change a pure restatement: same strictness, now independent of
 * world size. Tightening the budget is what the perf-floor work EARNS; it is not
 * something to smuggle in while changing the units.
 *
 * Measured on the production box at the time of writing: **1_558 µs per
 * province-year** (median 4.83 s for 5 years at 620 provinces), so there is
 * roughly 2.9x headroom — deliberately, because this box has 12 cores against a
 * resting load average near 28 and a tight bound would fail on scheduling noise
 * rather than on regressions.
 *
 * This number should only ever go DOWN.
 */
const CEILING_US_PER_PROVINCE_YEAR = 4_500;

/**
 * Absolute backstop so a pathological run cannot hang the suite silently.
 * Carried over from the old `worst < 22_000` assertion.
 */
const WORST_RUN_CEILING_MS = 22_000;

describe('M6 headless performance guardrail', () => {
  it('keeps simulation cost per province-year under budget', () => {
    const provinces = GAME_DATA.provinceCount;
    const days = 365 * YEARS;
    const runs: number[] = [];

    for (let run = 0; run < RUNS; run++) {
      const world = createWorld(GAME_DATA, 6603 + run);
      // The budget is normalised by province count, so that count had better be
      // the one we think it is.
      expect(world.provinces.length).toBe(provinces);
      const started = performance.now();
      for (let i = 0; i < days; i++) advanceDay(world, GAME_DATA);
      runs.push(performance.now() - started);
    }

    const sorted = runs.slice().sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? 0;
    const worstMs = sorted[sorted.length - 1] ?? medianMs;

    const usPerProvinceYear = (medianMs * 1000) / (provinces * YEARS);

    console.log(
      `[budget] sim ${usPerProvinceYear.toFixed(0)} µs per province-year `
      + `(median ${(medianMs / 1000).toFixed(2)}s for ${YEARS}y at ${provinces} provinces), `
      + `ceiling ${CEILING_US_PER_PROVINCE_YEAR} µs`,
    );

    expect(usPerProvinceYear).toBeLessThan(CEILING_US_PER_PROVINCE_YEAR);
    expect(worstMs).toBeLessThan(WORST_RUN_CEILING_MS);
  }, 120_000);
});
