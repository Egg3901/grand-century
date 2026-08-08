/**
 * Wall-clock perf budgets. Lives in the BALANCE project, not the unit project.
 *
 * These measure elapsed time, and the unit project runs files in parallel on a
 * box with 12 cores and a resting load average near 28. The same buildSnapshot
 * call measured 6.11ms standalone and blew a 20ms ceiling inside the parallel
 * suite — the code was identical; the machine was not. Raising the ceiling
 * until the noise fits is how a budget rots into decoration, so the benchmark
 * moved to where it can be timed fairly instead.
 *
 * Static, allocation-free budgets (subscriber counts, block sizes) stay in
 * tests/perf.budgets.test.ts and keep running in the fast unit gate.
 */
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { buildSnapshot } from '../src/sim/snapshot';
import { buildCultureLedger } from '../src/sim/systems/culture';
import { advanceDay } from '../src/sim/world';

/**
 * H5 — the budgets that the perf-floor milestone is measured against.
 *
 * These are RECORDINGS, not aspirations. Each ceiling is today's measured cost
 * with headroom, so the numbers can only be argued down. Their job is to make
 * "we made it faster" a claim with a number attached, and to stop the cost
 * silently growing before the fix lands.
 *
 * Deliberately loose: this box has 12 cores and a resting load average near 28,
 * so a tight ceiling would fail on scheduling noise rather than on regressions.
 * A 3x headroom still catches an order-of-magnitude mistake, which is the class
 * of regression that actually matters here.
 *
 * F2 (issue #9 remainder) recorded on this box:
 *  - buildSnapshot: 7.83ms/call → 5.37–5.78ms/call cold-ish median; ~2.70ms/call
 *    once the culture ledger cache is warm (62.7 → ~43 ms of every 1000ms at 8Hz;
 *    ~22 ms/1000ms warm).
 *  - buildCultureLedger: still ~0.5–0.6ms when it runs, but getCultureLedger no
 *    longer invokes it on every snapshot (monthly / dirty / nation switch only).
 */

/** Snapshots are posted at SNAPSHOT_HZ = 8 in src/worker/sim.worker.ts. */
const SNAPSHOT_HZ = 8;

function warmWorld() {
  const world = createWorld(GAME_DATA, 1836);
  // Let the world leave its bootstrap state — pops merge, factories appear,
  // relations accumulate — so we measure a realistic snapshot, not an empty one.
  for (let day = 0; day < 365; day++) advanceDay(world, GAME_DATA);
  return world;
}

function medianMs(runs: number, fn: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('H5 perf budgets', () => {
  it('records buildSnapshot cost per call', () => {
    const world = warmWorld();
    const ms = medianMs(15, () => buildSnapshot(world, GAME_DATA));
    // Pre-F2 on this box: 7.83ms. Post-F2: 5.37ms. Ceiling tracks the new median
    // with ~3× scheduling headroom (was 60ms before the collapse).
    const budgetMs = 20;
    console.log(
      `[budget] buildSnapshot median ${ms.toFixed(2)}ms/call `
      + `(${(ms * SNAPSHOT_HZ).toFixed(1)}ms of every 1000ms at ${SNAPSHOT_HZ}Hz), ceiling ${budgetMs}ms`,
    );
    expect(ms).toBeLessThan(budgetMs);
  }, 60_000);

  it('records buildCultureLedger cost — gated, not every snapshot', () => {
    const world = warmWorld();
    const ms = medianMs(15, () => buildCultureLedger(world, GAME_DATA, world.playerNation));
    const budgetMs = 20;
    // Raw rebuild cost when the ledger IS computed. Snapshot builds go through
    // getCultureLedger, which calls this on the WEEKLY pop pass (where militancy
    // is written), the monthly culture pass, the culture commands, or a
    // player-nation switch — not SNAPSHOT_HZ times a second. The weekly trigger
    // matters: gating on the month alone left the Cultures panel up to a month
    // stale. See issue #9 / F2.
    console.log(
      `[budget] buildCultureLedger median ${ms.toFixed(2)}ms/call `
      + `(paid on month/dirty/nation-switch, not ×${SNAPSHOT_HZ}/sec), ceiling ${budgetMs}ms`,
    );
    expect(ms).toBeLessThan(budgetMs);
  }, 60_000);

  it('records sim throughput as ms per province-year (#30)', () => {
    const world = warmWorld();
    const years = 3;
    const t0 = performance.now();
    for (let day = 0; day < years * 365; day++) advanceDay(world, GAME_DATA);
    const elapsed = performance.now() - t0;
    const provinceYears = world.provinces.length * years;
    const msPerProvinceYear = elapsed / provinceYears;
    // Recording, not aspiration (issue #30): survives a change in province
    // count, and gives "the game feels slow at speed 5" a number. Measured
    // 2026-08-01 on this box after the tick-perf pass: ~0.85-0.95 ms per
    // province-year early-century (1450 provinces, ~1.3s per sim-year).
    // Ceiling has ~3x scheduling headroom. Raised 3 -> 4 for the 67-nation
    // moonshot world: +40% nations grows AI cost per year, and under full-suite
    // worker contention the old ceiling left no margin (still ~4x solo).
    const budgetMsPerProvinceYear = 4;
    console.log(
      `[budget] sim throughput ${msPerProvinceYear.toFixed(3)}ms per province-year `
      + `(${(years / (elapsed / 1000)).toFixed(2)} years/sec at ${world.provinces.length} provinces), `
      + `ceiling ${budgetMsPerProvinceYear}ms`,
    );
    expect(msPerProvinceYear).toBeLessThan(budgetMsPerProvinceYear);
  }, 120_000);

  it('records amortized culture-ledger cost inside repeated snapshot builds', () => {
    const world = warmWorld();
    // First call may rebuild; subsequent calls in the same month hit the cache.
    buildSnapshot(world, GAME_DATA);
    const snap = medianMs(10, () => buildSnapshot(world, GAME_DATA));
    const culture = medianMs(10, () => buildCultureLedger(world, GAME_DATA, world.playerNation));
    const shareIfUngated = culture / Math.max(snap, 1e-6);
    console.log(
      `[budget] warm buildSnapshot median ${snap.toFixed(2)}ms/call; `
      + `raw culture rebuild ${culture.toFixed(2)}ms `
      + `(would be ${(shareIfUngated * 100).toFixed(1)}% if still ungated)`,
    );
    expect(shareIfUngated).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

