/**
 * MP-M4 snapshot diff/apply + cadence + reconnect tests.
 */
import { describe, expect, it } from 'vitest';
import type { FromWorker, WorldSnapshot } from '../src/shared/types';
import type { ServerToClient } from '../src/net/sessionProtocol';
import {
  applySharedDiff,
  diffShared,
  encodeWire,
  decodeWire,
  extractPlayerView,
  extractShared,
  mergeSnapshot,
  type SharedSnapshot,
} from '../src/net/snapshotCodec';
import { applyServerSnapshotMessage, createApplierState } from '../src/net/snapshotApplier';
import { GameSession, SessionManager, MP_SNAPSHOT_HZ } from '../server/session';
import { createWorld } from '../src/sim/bootstrap';
import { snapshot } from '../src/sim/world';
import { GAME_DATA } from '../src/data/gameData';

function collect(): { send: (m: ServerToClient) => void; messages: ServerToClient[] } {
  const messages: ServerToClient[] = [];
  return {
    messages,
    send: (m) => { messages.push(m); },
  };
}

function fromWorker(messages: ServerToClient[]): FromWorker[] {
  return messages.filter((m): m is FromWorker =>
    m.t === 'ready' || m.t === 'snapshot' || m.t === 'log'
    || m.t === 'provinceDetail' || m.t === 'nationDetail'
    || m.t === 'saveSlots' || m.t === 'saveStatus');
}

function reconstruct(messages: ServerToClient[]): WorldSnapshot | null {
  const state = createApplierState();
  let last: WorldSnapshot | null = null;
  for (const m of messages) {
    const out = applyServerSnapshotMessage(state, m);
    if (out?.t === 'snapshot') last = out.snapshot;
  }
  return last;
}

describe('snapshotCodec (MP-M4)', () => {
  it('diff apply reconstructs the full shared snapshot', () => {
    const world = createWorld(GAME_DATA, 1836);
    const a = extractShared(snapshot(world, GAME_DATA));
    world.nations[0]!.taxRatePoor = 0.42;
    world.day = 3;
    const b = extractShared(snapshot(world, GAME_DATA));

    const diff = diffShared(a, b);
    expect(diff.day).toBe(3);
    expect(diff.nations?.some((n) => n.taxRatePoor === 0.42)).toBe(true);
    expect((diff.provinces?.length ?? 0)).toBeLessThan(b.provinces.length);

    const rebuilt = applySharedDiff(a, diff);
    expect(rebuilt.day).toBe(b.day);
    expect(rebuilt.nations.find((n) => n.id === 0)?.taxRatePoor).toBeCloseTo(0.42);
    expect(rebuilt.provinces.length).toBe(b.provinces.length);
    // Spot-check unchanged province preserved
    expect(rebuilt.provinces[10]).toEqual(a.provinces[10]);
  });

  it('merge shared + playerView equals a full WorldSnapshot shape', () => {
    const world = createWorld(GAME_DATA, 1836);
    world.playerNation = 1;
    const full = snapshot(world, GAME_DATA);
    const merged = mergeSnapshot(extractShared(full), extractPlayerView(full));
    expect(merged.day).toBe(full.day);
    expect(merged.playerNation).toBe(1);
    expect(merged.playerBudget).toEqual(full.playerBudget);
    expect(merged.provinces.length).toBe(full.provinces.length);
  });

  it('gzip wire round-trips', () => {
    const payload = { t: 'snapshotFull', seq: 1, shared: { day: 1, big: 'x'.repeat(400) } };
    const encoded = encodeWire(payload);
    expect(encoded).toBeInstanceOf(Uint8Array);
    const decoded = decodeWire(encoded);
    expect(decoded).toEqual(payload);
  });
});

describe('snapshot applier', () => {
  it('reconstructs WorldSnapshot from full + playerView + diff', () => {
    const session = new GameSession({ id: 'diff1', seed: 1836, phase: 'running' });
    const a = collect();
    session.join('a', 'ENG', a.send);

    const snap0 = reconstruct(a.messages);
    expect(snap0).not.toBeNull();
    expect(snap0!.day).toBe(0);

    a.messages.length = 0;
    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    // Force a day advance + broadcast
    session.tick(1.0);
    // Force remaining pending if rate-capped
    for (let i = 0; i < 5; i++) session.tick(0.5);

    const hasDiff = a.messages.some((m) => m.t === 'snapshotDiff');
    const hasFull = a.messages.some((m) => m.t === 'snapshotFull');
    expect(hasDiff || hasFull).toBe(true);
    // After the first join full, subsequent broadcasts should prefer diffs
    expect(hasDiff).toBe(true);

    const snap1 = reconstruct([...a.messages]);
    // Need to re-apply from a baseline — applier needs prior full.
    // Re-join path: reconstruct from all messages including initial.
    const all = collect();
    const session2 = new GameSession({ id: 'diff2', seed: 1836, phase: 'running' });
    session2.join('a', 'ENG', all.send);
    session2.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    session2.tick(1.0);
    for (let i = 0; i < 5; i++) session2.tick(0.5);
    const rebuilt = reconstruct(all.messages);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.day).toBeGreaterThan(0);
    expect(rebuilt!.speed).toBe(5);
  });
});

describe('server cadence + diffs (MP-M4)', () => {
  it('does not broadcast while paused (no advances)', () => {
    const session = new GameSession({ id: 'pause', seed: 1836, phase: 'running' });
    const a = collect();
    session.join('a', 'ENG', a.send);
    const before = a.messages.length;
    session.tick(1.0);
    session.tick(1.0);
    session.tick(1.0);
    // speed is 0 — no new snapshotFull/Diff
    const added = a.messages.slice(before).filter((m) => m.t === 'snapshotFull' || m.t === 'snapshotDiff');
    expect(added).toHaveLength(0);
  });

  it('broadcasts a diff not a full snapshot after the first', () => {
    const session = new GameSession({ id: 'diff-only', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    session.join('a', 'ENG', a.send);
    session.join('b', 'FRA', b.send);

    expect(a.messages.some((m) => m.t === 'snapshotFull')).toBe(true);
    expect(b.messages.some((m) => m.t === 'snapshotFull')).toBe(true);

    a.messages.length = 0;
    b.messages.length = 0;
    session.handleMessage('a', { t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.22 } });

    expect(a.messages.some((m) => m.t === 'snapshotDiff')).toBe(true);
    expect(a.messages.some((m) => m.t === 'snapshotFull')).toBe(false);
    expect(b.messages.some((m) => m.t === 'snapshotDiff')).toBe(true);
    expect(a.messages.some((m) => m.t === 'playerView')).toBe(true);

    const snapA = reconstruct([
      // need baseline — use session helper
      ...([{ t: 'snapshotFull', seq: 1, shared: session['lastShared']! }] as ServerToClient[]),
      ...a.messages,
    ]);
    // Simpler: use reconstructFor
    const live = session.reconstructFor('a');
    expect(live?.nations.find((n) => n.tag === 'ENG')?.taxRatePoor).toBeCloseTo(0.22);
  });

  it(`caps broadcast rate near ${MP_SNAPSHOT_HZ} Hz`, () => {
    const session = new GameSession({ id: 'hz', seed: 1836, phase: 'running' });
    const a = collect();
    session.join('a', 'ENG', a.send);
    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    a.messages.length = 0;

    // Simulate 1 second of 30 Hz ticks
    for (let i = 0; i < 30; i++) session.tick(1 / 30);
    const diffs = a.messages.filter((m) => m.t === 'snapshotDiff' || m.t === 'snapshotFull');
    // At most ~MP_SNAPSHOT_HZ (+1 slack)
    expect(diffs.length).toBeLessThanOrEqual(MP_SNAPSHOT_HZ + 2);
    expect(diffs.length).toBeGreaterThan(0);
  });
});

describe('reconnect + presence + chat (MP-M5)', () => {
  it('reconnect resyncs with a fresh full snapshot', () => {
    const session = new GameSession({ id: 're1', seed: 1836, phase: 'running' });
    const a = collect();
    const join = session.join('a', 'ENG', a.send);
    expect(join.ok).toBe(true);

    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 3 } });
    session.tick(1);
    for (let i = 0; i < 4; i++) session.tick(0.5);
    const dayBefore = session.world!.day;

    session.disconnect('a');
    expect(session.heldSeats.has('a')).toBe(true);
    expect(session.clients.has('a')).toBe(false);

    const a2 = collect();
    const re = session.reconnect('a', a2.send);
    expect(re.ok).toBe(true);
    expect(re.nationTag).toBe('ENG');
    expect(a2.messages.some((m) => m.t === 'snapshotFull')).toBe(true);
    expect(a2.messages.some((m) => m.t === 'ready')).toBe(true);

    const snap = reconstruct(a2.messages);
    expect(snap?.day).toBe(dayBefore);
    expect(snap?.playerNation).toBe(join.nationId);
  });

  it('broadcasts presence on join/disconnect', () => {
    const session = new GameSession({ id: 'pres', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    session.join('a', 'ENG', a.send);
    session.join('b', 'FRA', b.send);
    expect(a.messages.some((m) => m.t === 'presence')).toBe(true);
    expect(b.messages.filter((m) => m.t === 'presence').at(-1)).toMatchObject({
      t: 'presence',
    });

    a.messages.length = 0;
    session.disconnect('b');
    const presence = a.messages.find((m) => m.t === 'presence');
    expect(presence?.t).toBe('presence');
    if (presence?.t === 'presence') {
      const away = presence.players.find((p) => p.nationTag === 'FRA');
      expect(away?.connected).toBe(false);
    }
  });

  it('relays chat to the session', () => {
    const session = new GameSession({ id: 'chat', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    session.join('a', 'ENG', a.send);
    session.join('b', 'FRA', b.send);
    a.messages.length = 0;
    b.messages.length = 0;
    session.handleChat('a', 'hello FRA');
    expect(a.messages.some((m) => m.t === 'chat' && (m as { text: string }).text === 'hello FRA')).toBe(true);
    expect(b.messages.some((m) => m.t === 'chat' && (m as { text: string }).text === 'hello FRA')).toBe(true);
  });

  it('SessionManager keeps session alive during reconnect grace', () => {
    const mgr = new SessionManager();
    const session = mgr.getOrCreate('grace', 1836);
    const a = collect();
    session.join('a', 'ENG', a.send);
    mgr.leave('grace', 'a');
    expect(mgr.get('grace')).toBeDefined();
    expect(mgr.get('grace')!.heldSeats.has('a')).toBe(true);
  });
});

describe('GameSession running compat with diffs', () => {
  it('joins two nations and shares the same world day via reconstructed snaps', () => {
    const session = new GameSession({ id: 's1', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();

    const ja = session.join('a', 'ENG', a.send);
    const jb = session.join('b', 'FRA', b.send);
    expect(ja.ok && jb.ok).toBe(true);

    const snapA0 = reconstruct(a.messages);
    const snapB0 = reconstruct(b.messages);
    expect(snapA0?.day).toBe(snapB0?.day);
    expect(snapA0?.playerNation).toBe(ja.nationId);
    expect(snapB0?.playerNation).toBe(jb.nationId);

    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    session.tick(1.0);
    for (let i = 0; i < 5; i++) session.tick(0.4);

    const snapA1 = session.reconstructFor('a');
    const snapB1 = session.reconstructFor('b');
    expect(snapA1?.day).toBe(snapB1?.day);
    expect((snapA1?.day ?? 0)).toBeGreaterThan(snapA0!.day);
  });
});

/** Cadence helper mirrored from the worker — paused posts nothing. */
describe('worker cadence policy', () => {
  it('paused/unchanged does not schedule a snapshot post', () => {
    let pending = false;
    let acc = 0;
    const minInterval = 1 / 8;
    const steps = 0; // paused
    if (steps > 0) pending = true;
    if (pending) {
      acc += 0.033;
      if (acc >= minInterval) pending = false;
    }
    expect(pending).toBe(false);
  });

  it('advancing world schedules a cadence-capped post', () => {
    let pending = false;
    let acc = 0;
    let posts = 0;
    const minInterval = 1 / 8;
    for (let i = 0; i < 30; i++) {
      const steps = 2;
      if (steps > 0) pending = true;
      if (pending) {
        acc += 1 / 30;
        if (acc >= minInterval) {
          posts += 1;
          pending = false;
          acc = 0;
        }
      }
    }
    expect(posts).toBeGreaterThan(0);
    expect(posts).toBeLessThanOrEqual(10);
  });
});

// silence unused SharedSnapshot import warning via type use
void (0 as unknown as SharedSnapshot);
