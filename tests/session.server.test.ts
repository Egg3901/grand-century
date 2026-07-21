import { describe, expect, it } from 'vitest';
import type { FromWorker } from '../src/shared/types';
import { GameSession, SessionManager } from '../server/session';

function collect(): { send: (m: FromWorker) => void; messages: FromWorker[] } {
  const messages: FromWorker[] = [];
  return {
    messages,
    send: (m) => { messages.push(m); },
  };
}

describe('GameSession (MP-M1)', () => {
  it('joins two nations and broadcasts the same world day', () => {
    const session = new GameSession('s1', 1836);
    const a = collect();
    const b = collect();

    const ja = session.join('a', 'ENG', a.send);
    const jb = session.join('b', 'FRA', b.send);
    expect(ja.ok).toBe(true);
    expect(jb.ok).toBe(true);
    expect(ja.leader).toBe(true);
    expect(jb.leader).toBe(false);

    expect(a.messages.some((m) => m.t === 'ready')).toBe(true);
    expect(b.messages.some((m) => m.t === 'ready')).toBe(true);

    const snapA0 = a.messages.filter((m) => m.t === 'snapshot').at(-1);
    const snapB0 = b.messages.filter((m) => m.t === 'snapshot').at(-1);
    expect(snapA0?.t).toBe('snapshot');
    expect(snapB0?.t).toBe('snapshot');
    if (snapA0?.t !== 'snapshot' || snapB0?.t !== 'snapshot') return;
    expect(snapA0.snapshot.day).toBe(snapB0.snapshot.day);
    expect(snapA0.snapshot.playerNation).toBe(ja.nationId);
    expect(snapB0.snapshot.playerNation).toBe(jb.nationId);

    // Leader unpauses and advances.
    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    session.tick(1.0); // ~90 days at speed 5

    const snapA1 = a.messages.filter((m) => m.t === 'snapshot').at(-1);
    const snapB1 = b.messages.filter((m) => m.t === 'snapshot').at(-1);
    if (snapA1?.t !== 'snapshot' || snapB1?.t !== 'snapshot') throw new Error('missing snapshot');
    expect(snapA1.snapshot.day).toBe(snapB1.snapshot.day);
    expect(snapA1.snapshot.day).toBeGreaterThan(snapA0.snapshot.day);
  });

  it('rejects speed changes from non-leader', () => {
    const session = new GameSession('s2', 1836);
    const a = collect();
    const b = collect();
    session.join('a', 'ENG', a.send);
    session.join('b', 'FRA', b.send);

    b.messages.length = 0;
    session.handleMessage('b', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    expect(session.world.speed).toBe(0);
    expect(b.messages.some((m) => m.t === 'log' && m.level === 'warn')).toBe(true);
  });

  it('applies nation commands only for the client seat (cannot command another nation)', () => {
    const session = new GameSession('s3', 1836);
    const a = collect();
    const b = collect();
    const ja = session.join('a', 'ENG', a.send);
    const jb = session.join('b', 'FRA', b.send);
    expect(ja.ok && jb.ok).toBe(true);

    const engBefore = session.world.nations[ja.nationId]!.taxRatePoor;

    // Client B sets tax — must only touch FRA.
    session.handleMessage('b', {
      t: 'command',
      cmd: { t: 'setTax', bracket: 'poor', rate: 0.42 },
    });

    expect(session.world.nations[jb.nationId]!.taxRatePoor).toBeCloseTo(0.42);
    expect(session.world.nations[ja.nationId]!.taxRatePoor).toBe(engBefore);

    // Client A sets tax — only ENG.
    session.handleMessage('a', {
      t: 'command',
      cmd: { t: 'setTax', bracket: 'poor', rate: 0.11 },
    });
    expect(session.world.nations[ja.nationId]!.taxRatePoor).toBeCloseTo(0.11);
    expect(session.world.nations[jb.nationId]!.taxRatePoor).toBeCloseTo(0.42);

    // Both clients see the updated nation summaries in snapshots.
    const snapA = a.messages.filter((m) => m.t === 'snapshot').at(-1);
    const snapB = b.messages.filter((m) => m.t === 'snapshot').at(-1);
    if (snapA?.t !== 'snapshot' || snapB?.t !== 'snapshot') throw new Error('missing snapshot');
    const engA = snapA.snapshot.nations.find((n) => n.id === ja.nationId)!;
    const engB = snapB.snapshot.nations.find((n) => n.id === ja.nationId)!;
    const fraA = snapA.snapshot.nations.find((n) => n.id === jb.nationId)!;
    const fraB = snapB.snapshot.nations.find((n) => n.id === jb.nationId)!;
    expect(engA.taxRatePoor).toBeCloseTo(0.11);
    expect(engB.taxRatePoor).toBeCloseTo(0.11);
    expect(fraA.taxRatePoor).toBeCloseTo(0.42);
    expect(fraB.taxRatePoor).toBeCloseTo(0.42);
  });

  it('rejects setPlayerNation / newGame in multiplayer', () => {
    const session = new GameSession('s4', 1836);
    const a = collect();
    const ja = session.join('a', 'ENG', a.send);
    a.messages.length = 0;
    session.handleMessage('a', {
      t: 'command',
      cmd: { t: 'setPlayerNation', nation: ja.nationId + 1 },
    });
    expect(session.world.playerNation).not.toBe(ja.nationId + 1);
    expect(a.messages.some((m) => m.t === 'log')).toBe(true);
  });

  it('rejects a second client claiming the same nation', () => {
    const session = new GameSession('s5', 1836);
    const a = collect();
    const b = collect();
    expect(session.join('a', 'ENG', a.send).ok).toBe(true);
    const jb = session.join('b', 'ENG', b.send);
    expect(jb.ok).toBe(false);
    expect(jb.error).toMatch(/already taken/);
  });
});

describe('SessionManager', () => {
  it('GCs empty sessions on leave', () => {
    const mgr = new SessionManager();
    const session = mgr.getOrCreate('gone', 1836);
    const a = collect();
    session.join('a', 'ENG', a.send);
    expect(mgr.size).toBe(1);
    mgr.leave('gone', 'a');
    expect(mgr.size).toBe(0);
    expect(mgr.get('gone')).toBeUndefined();
  });
});
