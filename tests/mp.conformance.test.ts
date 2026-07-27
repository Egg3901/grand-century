/**
 * H7 — multiplayer conformance + bandwidth gates.
 *
 * 1. Same seed + command log → GameSession (server) and worker-style
 *    createWorld/applyCommand/advanceDay/snapshot must agree.
 * 2. Representative multi-client session stays under a measured byte budget.
 * 3. Expose snapshot-build counts per broadcast (issue #28 baseline).
 */
import { describe, expect, it } from 'vitest';
import type { Command, WorldSnapshot } from '../src/shared/types';
import type { ServerToClient } from '../src/net/sessionProtocol';
import { extractShared } from '../src/net/snapshotCodec';
import { GameSession, SPEED_DAYS_PER_SEC } from '../server/session';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { advanceDay, snapshot } from '../src/sim/world';
import { GAME_DATA } from '../src/data/gameData';

/** Default gate: ~3 months — enough for weekly + monthly systems. */
const CONFORMANCE_DAYS = 90;
/** Opt-in longer run (like PACING=1). */
const LONG_DAYS = 365;
const RUN_LONG = process.env.MP_CONFORMANCE_LONG === '1';

/**
 * Measured 2026-07-27 on this worktree (2 clients ENG+FRA, speed 5 = 90 days/sec,
 * exactly 60 sim days of tick advance after join, plus scripted tax/tariff/stockpile
 * commands; JSON-estimate bytes via takeBandwidthStats — not gzip wireBytes, which
 * stay 0 without a WS framing path):
 *
 *   totalJsonBytes = 1_735_708  (sharedFull + sharedDiff + playerView)
 *   broadcasts     = 8
 *   snapshotBuildsPerBroadcast = 1  (= 1 shared; player views are separate, issue #28 fixed)
 *
 * Budget = measured × 1.35 (~35% headroom) so a silent wholesale-array growth
 * (e.g. per-nation markets shipping all goods) trips the gate before prod.
 *
 * Re-measure and update MEASURED_BANDWIDTH_JSON_BYTES if the harness shape changes.
 */
const MEASURED_BANDWIDTH_JSON_BYTES = 1_735_708;
const BANDWIDTH_HEADROOM = 1.35;
const BANDWIDTH_BUDGET_JSON_BYTES = Math.ceil(MEASURED_BANDWIDTH_JSON_BYTES * BANDWIDTH_HEADROOM);
const BANDWIDTH_SIM_DAYS = 60;
const BANDWIDTH_CLIENTS = 2;
const BANDWIDTH_SPEED = 5;

type ScriptStep = { atDay: number; cmd: Command };

function collect(): { send: (m: ServerToClient) => void; messages: ServerToClient[] } {
  const messages: ServerToClient[] = [];
  return {
    messages,
    send: (m) => { messages.push(m); },
  };
}

function noopPost(): void {
  // command sink
}

/** First differing JSON path, or null if deeply equal. */
function firstDiffPath(a: unknown, b: unknown, path = '$'): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b) {
    return `${path}: typeof ${typeof a} !== ${typeof b} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
  }
  if (a === null || b === null || typeof a !== 'object') {
    return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return `${path}: array-ness differs`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return `${path}.length: ${a.length} !== ${b.length}`;
    }
    for (let i = 0; i < a.length; i++) {
      const hit = firstDiffPath(a[i], b[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort();
  for (const key of keys) {
    if (!(key in ao)) return `${path}.${key}: missing on left`;
    if (!(key in bo)) return `${path}.${key}: missing on right`;
    const hit = firstDiffPath(ao[key], bo[key], `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
}

function buildScript(): ScriptStep[] {
  return [
    { atDay: 0, cmd: { t: 'setSpeed', speed: 3 } },
    { atDay: 0, cmd: { t: 'setTax', bracket: 'poor', rate: 0.22 } },
    { atDay: 0, cmd: { t: 'setTax', bracket: 'middle', rate: 0.18 } },
    { atDay: 0, cmd: { t: 'setTariff', rate: 0.12 } },
    { atDay: 7, cmd: { t: 'setStockpileOrder', good: 0, mode: 'buy', dailyAmount: 5 } },
    { atDay: 14, cmd: { t: 'setTax', bracket: 'rich', rate: 0.25 } },
    { atDay: 21, cmd: { t: 'setResearch', tech: null } },
    { atDay: 30, cmd: { t: 'setTariff', rate: 0.08 } },
    { atDay: 45, cmd: { t: 'setStockpileOrder', good: 1, mode: 'sell', dailyAmount: 2 } },
    { atDay: 60, cmd: { t: 'setTax', bracket: 'poor', rate: 0.2 } },
    { atDay: 75, cmd: { t: 'setSpeed', speed: 4 } },
  ];
}

function applyDue(script: ScriptStep[], day: number, apply: (cmd: Command) => void): void {
  for (const step of script) {
    if (step.atDay === day) apply(step.cmd);
  }
}

/** Single-player worker path — mirrors sim.worker.ts startWorld + tick/command. */
function runWorkerPath(seed: number, days: number, script: ScriptStep[]): WorldSnapshot {
  const world = createWorld(GAME_DATA, seed);
  const eng = world.nations.find((n) => n.tag === 'ENG');
  if (!eng) throw new Error('ENG missing from world');
  world.playerNation = eng.id;
  for (const nation of world.nations) {
    nation.isPlayer = nation.id === eng.id;
  }
  // Match GameSession.ensureWorld initial pause until script sets speed.
  world.speed = 0;

  applyDue(script, world.day, (cmd) => applyCommand(world, GAME_DATA, cmd, noopPost));
  for (let i = 0; i < days; i++) {
    advanceDay(world, GAME_DATA);
    applyDue(script, world.day, (cmd) => applyCommand(world, GAME_DATA, cmd, noopPost));
  }
  return snapshot(world, GAME_DATA);
}

/** Authoritative GameSession path — commands via handleMessage, days via advanceDay. */
function runServerPath(seed: number, days: number, script: ScriptStep[]): WorldSnapshot {
  const session = new GameSession({ id: `conf-${seed}`, seed, phase: 'running' });
  const client = collect();
  const joined = session.join('a', 'ENG', client.send);
  expect(joined.ok).toBe(true);
  const world = session.world!;
  const engId = joined.nationId;

  applyDue(script, world.day, (cmd) => {
    session.handleMessage('a', { t: 'command', cmd });
  });
  for (let i = 0; i < days; i++) {
    advanceDay(world, session.data);
    applyDue(script, world.day, (cmd) => {
      session.handleMessage('a', { t: 'command', cmd });
    });
  }

  world.playerNation = engId;
  return snapshot(world, session.data);
}

describe('H7 MP sim conformance', () => {
  it(`server GameSession and worker path agree after ${CONFORMANCE_DAYS} days + scripted commands`, () => {
    const seed = 1836;
    const script = buildScript();
    const serverSnap = runServerPath(seed, CONFORMANCE_DAYS, script);
    const workerSnap = runWorkerPath(seed, CONFORMANCE_DAYS, script);

    expect(serverSnap.day).toBe(CONFORMANCE_DAYS);
    expect(workerSnap.day).toBe(CONFORMANCE_DAYS);

    // Shared world must match; player-private fields compared with same playerNation.
    const sharedDiff = firstDiffPath(extractShared(serverSnap), extractShared(workerSnap), '$.shared');
    expect(sharedDiff, sharedDiff ?? 'shared snapshots equal').toBeNull();

    const fullDiff = firstDiffPath(serverSnap, workerSnap, '$');
    expect(fullDiff, fullDiff ?? 'full snapshots equal').toBeNull();
  });

  it.skipIf(!RUN_LONG)(
    `long conformance (${LONG_DAYS} days) — set MP_CONFORMANCE_LONG=1`,
    () => {
      const seed = 1836;
      const script = buildScript();
      const serverSnap = runServerPath(seed, LONG_DAYS, script);
      const workerSnap = runWorkerPath(seed, LONG_DAYS, script);
      const diff = firstDiffPath(serverSnap, workerSnap, '$');
      expect(diff, diff ?? 'equal').toBeNull();
    },
    120_000,
  );
});

describe('H7 MP bandwidth budget', () => {
  it(`2-client session over ${BANDWIDTH_SIM_DAYS} sim days stays under measured budget`, () => {
    const session = new GameSession({ id: 'bw-gate', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    expect(session.join('a', 'ENG', a.send).ok).toBe(true);
    expect(session.join('b', 'FRA', b.send).ok).toBe(true);

    // Drop join traffic out of the window.
    session.takeBandwidthStats();
    const buildsAtStart = session.snapshotBuildCount;

    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: BANDWIDTH_SPEED } });
    session.handleMessage('a', { t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.21 } });
    session.handleMessage('b', { t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.19 } });
    session.handleMessage('a', { t: 'command', cmd: { t: 'setTariff', rate: 0.1 } });
    session.handleMessage('b', {
      t: 'command',
      cmd: { t: 'setStockpileOrder', good: 0, mode: 'buy', dailyAmount: 3 },
    });

    // Advance via tick at BANDWIDTH_SPEED so cadence matches production.
    const daysPerSec = SPEED_DAYS_PER_SEC[BANDWIDTH_SPEED]!;
    expect(daysPerSec).toBeGreaterThan(0);
    const dayBeforeTick = session.world!.day;
    const totalTickSeconds = BANDWIDTH_SIM_DAYS / daysPerSec;
    const dt = 1 / 30;
    const ticks = Math.ceil(totalTickSeconds / dt);
    for (let i = 0; i < ticks; i++) session.tick(dt);
    expect(session.world!.day - dayBeforeTick).toBeGreaterThanOrEqual(BANDWIDTH_SIM_DAYS);

    // Mid-run command flush (forces an immediate broadcast, like live play).
    session.handleMessage('a', { t: 'command', cmd: { t: 'setTax', bracket: 'middle', rate: 0.17 } });

    const stats = session.takeBandwidthStats();
    const totalJsonBytes =
      stats.sharedFullBytes + stats.sharedDiffBytes + stats.playerViewBytes;
    const buildsInWindow = session.snapshotBuildCount - buildsAtStart;
    const buildsPerBroadcast =
      stats.broadcasts > 0 ? buildsInWindow / stats.broadcasts : 0;

    console.log(
      JSON.stringify({
        gate: 'H7-bandwidth',
        measuredJsonBytes: totalJsonBytes,
        budgetJsonBytes: BANDWIDTH_BUDGET_JSON_BYTES,
        priorMeasurement: MEASURED_BANDWIDTH_JSON_BYTES,
        headroom: BANDWIDTH_HEADROOM,
        simDayEnd: session.world!.day,
        simDaysAdvanced: session.world!.day - dayBeforeTick,
        clients: BANDWIDTH_CLIENTS,
        broadcasts: stats.broadcasts,
        sharedFullBytes: stats.sharedFullBytes,
        sharedDiffBytes: stats.sharedDiffBytes,
        playerViewBytes: stats.playerViewBytes,
        bytesPerSecWallClock: stats.bytesPerSec,
        snapshotBuildsInWindow: buildsInWindow,
        snapshotBuildsPerBroadcast: buildsPerBroadcast,
        note: 'issue #28: expect exactly 1 shared build per broadcast (player views uncounted)',
      }),
    );

    expect(session.world!.day).toBeGreaterThanOrEqual(BANDWIDTH_SIM_DAYS);
    expect(stats.broadcasts).toBeGreaterThan(0);
    expect(totalJsonBytes).toBeLessThanOrEqual(BANDWIDTH_BUDGET_JSON_BYTES);

    // issue #28 fix: shared snapshot built exactly once per broadcast, regardless of clients.
    expect(buildsPerBroadcast).toBeGreaterThanOrEqual(1 - 0.05);
    expect(buildsPerBroadcast).toBeLessThanOrEqual(1 + 0.05);
  });
});
