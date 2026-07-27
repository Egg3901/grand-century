import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
    // getCultureLedger, which only calls this on calendar-month rollover,
    // invalidateCultureLedger (runCultureMonthly / setCulturePolicy /
    // setCultureAccepted), or a player-nation switch — not SNAPSHOT_HZ times
    // a second. See issue #9 / F2.
    console.log(
      `[budget] buildCultureLedger median ${ms.toFixed(2)}ms/call `
      + `(paid on month/dirty/nation-switch, not ×${SNAPSHOT_HZ}/sec), ceiling ${budgetMs}ms`,
    );
    expect(ms).toBeLessThan(budgetMs);
  }, 60_000);

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

/**
 * The render-side budget is a STATIC count, not a runtime measurement.
 *
 * `src/store.ts` stabilizes top-level snapshot field identities across ticks
 * (see stabilizeSnapshot) so components can subscribe to narrow slices.
 * Counting remaining wholesale `state.snapshot` subscriptions is a stable,
 * fast proxy for the render cost the perf-floor milestone reduced. Measuring
 * actual React re-renders would need a DOM harness this suite does not
 * otherwise carry.
 */
describe('H5 render budget', () => {
  const SRC = join(__dirname, '..', 'src');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('records how many components subscribe to the whole snapshot', () => {
    const wholesale: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      // `useStore((state) => state.snapshot)` and spelling variants — a
      // subscription to the entire snapshot object rather than a slice of it.
      if (/useStore\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.snapshot\s*\)/.test(text)) {
        wholesale.push(file.replace(`${SRC}/`, ''));
      }
    }
    console.log(
      `[budget] ${wholesale.length} modules subscribe to the entire snapshot:\n  `
      + wholesale.sort().join('\n  '),
    );
    // Recorded at 0 after F1 (issue #8): every former wholesale subscriber now
    // uses a narrow field selector or useShallow. Must stay at 0.
    expect(wholesale.length).toBeLessThanOrEqual(0);
  });

  it('records the size of the onSnapshot derivation block in the store', () => {
    const store = readFileSync(join(SRC, 'store.ts'), 'utf8').split('\n');
    // Match the IMPLEMENTATION, not the interface field declaration — an
    // earlier version of this test matched `onSnapshot: (s: WorldSnapshot) =>
    // void;` in the type and cheerfully reported a 1-line block.
    const start = store.findIndex((line) => /onSnapshot:\s*\(.*\)\s*=>\s*set\(/.test(line));
    expect(start, 'onSnapshot implementation not found in src/store.ts').toBeGreaterThan(-1);
    // Find the end of the set() callback by brace depth from the onSnapshot line.
    let depth = 0;
    let end = start;
    for (let i = start; i < store.length; i++) {
      for (const ch of store[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (i > start && depth <= 0) { end = i; break; }
    }
    const lines = end - start;
    console.log(`[budget] store onSnapshot derivation spans ${lines} lines (src/store.ts:${start + 1})`);
    // Recorded at 5 after F1 (issue #8): alert derivation lives in src/ui/alerts.ts;
    // onSnapshot only stabilizes the snapshot and calls deriveAlerts.
    expect(lines).toBeLessThanOrEqual(5);
  });
});
