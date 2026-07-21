import { describe, expect, it } from 'vitest';
import type { FromWorker } from '../src/shared/types';
import type { ServerToClient } from '../src/net/sessionProtocol';
import { GameSession, SessionManager } from '../server/session';

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

describe('GameSession running (MP-M1 compat)', () => {
  it('joins two nations and broadcasts the same world day', () => {
    const session = new GameSession({ id: 's1', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();

    const ja = session.join('a', 'ENG', a.send);
    const jb = session.join('b', 'FRA', b.send);
    expect(ja.ok).toBe(true);
    expect(jb.ok).toBe(true);
    expect(ja.leader).toBe(true);
    expect(jb.leader).toBe(false);

    expect(fromWorker(a.messages).some((m) => m.t === 'ready')).toBe(true);
    expect(fromWorker(b.messages).some((m) => m.t === 'ready')).toBe(true);

    const snapA0 = fromWorker(a.messages).filter((m) => m.t === 'snapshot').at(-1);
    const snapB0 = fromWorker(b.messages).filter((m) => m.t === 'snapshot').at(-1);
    expect(snapA0?.t).toBe('snapshot');
    expect(snapB0?.t).toBe('snapshot');
    if (snapA0?.t !== 'snapshot' || snapB0?.t !== 'snapshot') return;
    expect(snapA0.snapshot.day).toBe(snapB0.snapshot.day);
    expect(snapA0.snapshot.playerNation).toBe(ja.nationId);
    expect(snapB0.snapshot.playerNation).toBe(jb.nationId);

    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    session.tick(1.0);

    const snapA1 = fromWorker(a.messages).filter((m) => m.t === 'snapshot').at(-1);
    const snapB1 = fromWorker(b.messages).filter((m) => m.t === 'snapshot').at(-1);
    if (snapA1?.t !== 'snapshot' || snapB1?.t !== 'snapshot') throw new Error('missing snapshot');
    expect(snapA1.snapshot.day).toBe(snapB1.snapshot.day);
    expect(snapA1.snapshot.day).toBeGreaterThan(snapA0.snapshot.day);
  });

  it('rejects speed changes from non-leader', () => {
    const session = new GameSession({ id: 's2', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    session.join('a', 'ENG', a.send);
    session.join('b', 'FRA', b.send);

    b.messages.length = 0;
    session.handleMessage('b', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    expect(session.world!.speed).toBe(0);
    expect(fromWorker(b.messages).some((m) => m.t === 'log' && m.level === 'warn')).toBe(true);
  });

  it('applies nation commands only for the client seat (cannot command another nation)', () => {
    const session = new GameSession({ id: 's3', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    const ja = session.join('a', 'ENG', a.send);
    const jb = session.join('b', 'FRA', b.send);
    expect(ja.ok && jb.ok).toBe(true);

    const engBefore = session.world!.nations[ja.nationId]!.taxRatePoor;

    session.handleMessage('b', {
      t: 'command',
      cmd: { t: 'setTax', bracket: 'poor', rate: 0.42 },
    });

    expect(session.world!.nations[jb.nationId]!.taxRatePoor).toBeCloseTo(0.42);
    expect(session.world!.nations[ja.nationId]!.taxRatePoor).toBe(engBefore);

    session.handleMessage('a', {
      t: 'command',
      cmd: { t: 'setTax', bracket: 'poor', rate: 0.11 },
    });
    expect(session.world!.nations[ja.nationId]!.taxRatePoor).toBeCloseTo(0.11);
    expect(session.world!.nations[jb.nationId]!.taxRatePoor).toBeCloseTo(0.42);
  });

  it('rejects setPlayerNation / newGame in multiplayer', () => {
    const session = new GameSession({ id: 's4', seed: 1836, phase: 'running' });
    const a = collect();
    const ja = session.join('a', 'ENG', a.send);
    a.messages.length = 0;
    session.handleMessage('a', {
      t: 'command',
      cmd: { t: 'setPlayerNation', nation: ja.nationId + 1 },
    });
    expect(session.world!.playerNation).not.toBe(ja.nationId + 1);
    expect(fromWorker(a.messages).some((m) => m.t === 'log')).toBe(true);
  });

  it('rejects a second client claiming the same nation', () => {
    const session = new GameSession({ id: 's5', seed: 1836, phase: 'running' });
    const a = collect();
    const b = collect();
    expect(session.join('a', 'ENG', a.send).ok).toBe(true);
    const jb = session.join('b', 'ENG', b.send);
    expect(jb.ok).toBe(false);
    expect(jb.error).toMatch(/already taken/);
  });
});

describe('Lobby (MP-M2)', () => {
  it('create → join → select nations → ready → leader start', () => {
    const mgr = new SessionManager();
    const session = mgr.createLobby({
      name: 'Test Lobby',
      seed: 1836,
      mode: 'competitive',
      maxPlayers: 4,
    });
    const a = collect();
    const b = collect();

    expect(session.joinLobby('a', 'Alice', a.send).ok).toBe(true);
    expect(session.leaderId).toBe('a');
    expect(session.joinLobby('b', 'Bob', b.send).ok).toBe(true);
    expect(session.phase).toBe('lobby');
    expect(session.world).toBeNull();

    expect(a.messages.some((m) => m.t === 'lobbyState')).toBe(true);
    expect(mgr.listOpenLobbies()).toHaveLength(1);

    expect(session.selectNation('a', 'ENG').ok).toBe(true);
    expect(session.selectNation('b', 'ENG').ok).toBe(false); // locked
    expect(session.selectNation('b', 'FRA').ok).toBe(true);

    expect(session.setReady('a', true).ok).toBe(true);
    expect(session.setReady('b', true).ok).toBe(true);

    const badStart = session.leaderStart('b');
    expect(badStart.ok).toBe(false);

    const start = session.leaderStart('a');
    expect(start.ok).toBe(true);
    expect(session.phase).toBe('running');
    expect(session.world).not.toBeNull();
    expect(mgr.listOpenLobbies()).toHaveLength(0);

    expect(fromWorker(a.messages).some((m) => m.t === 'ready')).toBe(true);
    expect(fromWorker(b.messages).some((m) => m.t === 'ready')).toBe(true);

    const snapA = fromWorker(a.messages).filter((m) => m.t === 'snapshot').at(-1);
    const snapB = fromWorker(b.messages).filter((m) => m.t === 'snapshot').at(-1);
    if (snapA?.t !== 'snapshot' || snapB?.t !== 'snapshot') throw new Error('no snap');
    expect(snapA.snapshot.day).toBe(snapB.snapshot.day);
    expect(snapA.snapshot.nations.find((n) => n.tag === 'ENG')?.id).toBe(snapA.snapshot.playerNation);
    expect(snapB.snapshot.nations.find((n) => n.tag === 'FRA')?.id).toBe(snapB.snapshot.playerNation);

    // Shared world advances after start
    session.handleMessage('a', { t: 'command', cmd: { t: 'setSpeed', speed: 5 } });
    session.tick(0.5);
    const dayA = fromWorker(a.messages).filter((m) => m.t === 'snapshot').at(-1);
    const dayB = fromWorker(b.messages).filter((m) => m.t === 'snapshot').at(-1);
    if (dayA?.t !== 'snapshot' || dayB?.t !== 'snapshot') throw new Error('no day snap');
    expect(dayA.snapshot.day).toBe(dayB.snapshot.day);
    expect(dayA.snapshot.day).toBeGreaterThan(snapA.snapshot.day);
  });

  it('does not tick while in lobby phase', () => {
    const session = new GameSession({
      id: 'lobby-idle',
      seed: 1836,
      phase: 'lobby',
      mode: 'competitive',
    });
    const a = collect();
    session.joinLobby('a', 'A', a.send);
    session.selectNation('a', 'ENG');
    session.setReady('a', true);
    session.tick(5);
    expect(session.world).toBeNull();
    expect(session.phase).toBe('lobby');
  });

  it('coop: team selection + cross-team nation lock', () => {
    const session = new GameSession({
      id: 'coop1',
      seed: 1836,
      phase: 'lobby',
      mode: 'coop',
      maxPlayers: 4,
    });
    const a = collect();
    const b = collect();
    const c = collect();
    session.joinLobby('a', 'A', a.send);
    session.joinLobby('b', 'B', b.send);
    session.joinLobby('c', 'C', c.send);

    expect(session.selectTeam('a', 1).ok).toBe(true);
    expect(session.selectTeam('b', 1).ok).toBe(true);
    expect(session.selectTeam('c', 2).ok).toBe(true);

    expect(session.selectNation('a', 'ENG').ok).toBe(true);
    // Same team may share a nation in coop
    expect(session.selectNation('b', 'ENG').ok).toBe(true);
    // Other team cannot take ENG
    expect(session.selectNation('c', 'ENG').ok).toBe(false);
    expect(session.selectNation('c', 'FRA').ok).toBe(true);

    session.setReady('a', true);
    session.setReady('b', true);
    session.setReady('c', true);
    expect(session.leaderStart('a').ok).toBe(true);

    const controlledA = session.controlledNationIds(session.clients.get('a')!);
    const controlledC = session.controlledNationIds(session.clients.get('c')!);
    expect(controlledA.length).toBeGreaterThanOrEqual(1);
    expect(controlledC).toHaveLength(1);
    expect(controlledA).not.toContain(session.clients.get('c')!.nationId);
  });

  it('competitive command validation: tax only hits own nation after lobby start', () => {
    const session = new GameSession({
      id: 'comp-cmd',
      seed: 1836,
      phase: 'lobby',
      mode: 'competitive',
    });
    const a = collect();
    const b = collect();
    session.joinLobby('a', 'A', a.send);
    session.joinLobby('b', 'B', b.send);
    session.selectNation('a', 'ENG');
    session.selectNation('b', 'FRA');
    session.setReady('a', true);
    session.setReady('b', true);
    session.leaderStart('a');

    const engId = session.clients.get('a')!.nationId!;
    const fraId = session.clients.get('b')!.nationId!;
    const engBefore = session.world!.nations[engId]!.taxRatePoor;

    session.handleMessage('b', { t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.33 } });
    expect(session.world!.nations[fraId]!.taxRatePoor).toBeCloseTo(0.33);
    expect(session.world!.nations[engId]!.taxRatePoor).toBe(engBefore);
  });

  it('rejects leaderStart until everyone is ready with a nation', () => {
    const session = new GameSession({
      id: 'not-ready',
      seed: 42,
      phase: 'lobby',
      mode: 'competitive',
    });
    const a = collect();
    session.joinLobby('a', 'A', a.send);
    expect(session.leaderStart('a').ok).toBe(false);
    session.selectNation('a', 'PRU');
    expect(session.leaderStart('a').ok).toBe(false);
    session.setReady('a', true);
    expect(session.leaderStart('a').ok).toBe(true);
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

  it('GCs empty lobby sessions', () => {
    const mgr = new SessionManager();
    const session = mgr.createLobby({
      name: 'Ephemeral',
      seed: 1,
      mode: 'competitive',
      maxPlayers: 2,
    });
    const a = collect();
    session.joinLobby('a', 'A', a.send);
    expect(mgr.listOpenLobbies()).toHaveLength(1);
    mgr.leave(session.id, 'a');
    expect(mgr.size).toBe(0);
    expect(mgr.listOpenLobbies()).toHaveLength(0);
  });
});
