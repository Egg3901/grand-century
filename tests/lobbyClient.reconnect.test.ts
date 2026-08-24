/**
 * LobbyClient reconnect tests (bounded exponential backoff, resync, cancellation).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Minimal mock WebSocket that records sent messages and allows programmatic
// open / close / message injection.
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0; // CONNECTING
  binaryType = '';
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  sent: unknown[] = [];

  constructor(public url: string) {}

  addEventListener(type: string, handler: (...args: unknown[]) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  removeEventListener(type: string, handler: (...args: unknown[]) => void): void {
    const arr = this.listeners[type];
    if (arr) this.listeners[type] = arr.filter((h) => h !== handler);
  }

  send(data: unknown): void {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }

  close(): void {
    this.readyState = 3;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 1;
    this.emit('open');
  }

  simulateClose(): void {
    this.readyState = 3;
    this.emit('close');
  }

  simulateMessage(data: unknown): void {
    this.emit('message', { data });
  }

  private emit(type: string, ...args: unknown[]): void {
    for (const handler of this.listeners[type] ?? []) handler(...args);
  }
}

// Track all created MockWebSocket instances
let sockets: MockWebSocket[];
let MockWS: typeof WebSocket;

beforeEach(() => {
  sockets = [];
  MockWS = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
    }
  } as unknown as typeof WebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function latestSocket(): MockWebSocket {
  return sockets[sockets.length - 1]!;
}

/** Flush the LobbyClient's internal promise chain + any pending timers. */
async function flush(): Promise<void> {
  // The LobbyClient chains message handling via promises.
  // advanceTimersByTimeAsync flushes microtasks and pending timers.
  await vi.advanceTimersByTimeAsync(0);
}

async function importClient() {
  return import('../src/net/lobbyClient');
}

describe('LobbyClient reconnect', () => {
  it('schedules reconnect on close when session is active', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();

    // Simulate being in a session with a known clientId
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    const errors: string[] = [];
    client.onLobbyError((msg) => errors.push(msg));

    // Socket closes unexpectedly
    s.simulateClose();

    // Should schedule a reconnect (not immediate)
    expect(client.isReconnecting).toBe(true);

    // Advance timer to trigger the reconnect attempt
    await vi.advanceTimersByTimeAsync(1100);
    expect(sockets.length).toBe(2); // A new socket was created

    const s2 = latestSocket();
    // The new socket should send a reconnect message once open
    s2.simulateOpen();
    await flush();
    expect(s2.sent.some((m: unknown) => (m as { t: string }).t === 'reconnect')).toBe(true);
    expect(s2.sent.find((m: unknown) => (m as { t: string }).t === 'reconnect')).toMatchObject({
      t: 'reconnect',
      sessionId: 'sess1',
      clientId: 'c1',
    });

    client.dispose();
  });

  it('uses exponential backoff for subsequent attempts', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    // First close
    s.simulateClose();
    expect(client.isReconnecting).toBe(true);

    // First attempt at ~1s
    await vi.advanceTimersByTimeAsync(1100);
    expect(sockets.length).toBe(2);
    const s2 = latestSocket();
    s2.simulateOpen();
    s2.simulateClose(); // Second close

    // Second attempt at ~2s (exponential backoff)
    await vi.advanceTimersByTimeAsync(500); // Not enough
    expect(sockets.length).toBe(2); // Still only 2 sockets
    await vi.advanceTimersByTimeAsync(1600); // Now enough (~2s total)
    expect(sockets.length).toBe(3); // Third socket created

    client.dispose();
  });

  it('resets applier state on reconnect so full resync is required', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    const snapshots: unknown[] = [];
    client.onMessage((msg) => { if (msg.t === 'snapshot') snapshots.push(msg); });

    // Close and reconnect
    s.simulateClose();
    await vi.advanceTimersByTimeAsync(1100);
    const s2 = latestSocket();
    s2.simulateOpen();
    await flush();

    // After reconnect, a diff without a prior full should NOT produce a snapshot
    // (applier was reset, so it has no baseline)
    s2.simulateMessage(JSON.stringify({
      t: 'snapshotDiff', seq: 2, baseSeq: 1,
      diff: { day: 1 },
    }));
    await flush();
    expect(snapshots.length).toBe(0);

    // A full snapshot + playerView should produce a snapshot
    s2.simulateMessage(JSON.stringify({
      t: 'snapshotFull', seq: 1,
      shared: { day: 0, date: { year: 1836, month: 1, day: 1 }, speed: 0, nations: [], provinces: [], market: [], wars: [], relations: [], greatPowers: [], infamyLimit: 100, ninthPowerScore: 0, armies: [], fleets: [], rebellions: [] },
    }));
    await flush();
    s2.simulateMessage(JSON.stringify({
      t: 'playerView', seq: 1,
      view: { playerNation: 0, playerCbs: [], playerPendingCbs: [], playerDiplomaticPoints: 0, fabricateCbCostByGoal: {}, warGoalInfamyUse: {}, playerInfluencePool: 0, playerInfluenceTargets: [], playerAlliancePreviews: [], coalitionAgainstPlayer: [], playerPowerScore: 0, rivalryDpCost: 0, rivalryCap: 0, playerRivalryCount: 0, playerProduction: [], playerPopulation: [], playerReformAgitation: [], playerStates: [], playerBudget: { taxIncome: 0, tariffIncome: 0, productionIncome: 0, armyUpkeep: 0, subsidySpend: 0, constructionSpend: 0, adminSpend: 0, reformUpkeep: 0, net: 0, bankrupt: false, trace: { taxIncome: [], tariffIncome: [], productionIncome: [], armyUpkeep: [], subsidySpend: [], constructionSpend: [], adminSpend: [], reformUpkeep: [], net: [] } }, playerStockpile: {}, playerStockpileOrders: {} },
    }));
    await flush();
    expect(snapshots.length).toBe(1);

    client.dispose();
  });

  it('stops reconnecting after max attempts', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    const errors: string[] = [];
    client.onLobbyError((msg) => errors.push(msg));

    // Simulate 10 failed reconnects
    for (let i = 0; i < 10; i++) {
      latestSocket().simulateClose();
      await vi.advanceTimersByTimeAsync(60_000);
    }

    // 11th close should give up
    latestSocket().simulateClose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(errors.some((e) => e.includes('max attempts'))).toBe(true);

    client.dispose();
  });

  it('cancelReconnect stops pending reconnect timer', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    s.simulateClose();
    expect(client.isReconnecting).toBe(true);

    client.cancelReconnect();
    expect(client.isReconnecting).toBe(false);

    // Advancing time should not create a new socket
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(1); // Only the original

    client.dispose();
  });

  it('dispose cancels reconnect and closes socket', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    s.simulateClose();
    expect(client.isReconnecting).toBe(true);

    client.dispose();
    expect(client.isReconnecting).toBe(false);

    // Advancing time should not create a new socket
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(1);

    // The original socket should have been closed
    expect(s.readyState).toBe(3); // CLOSED
  });

  it('does not reconnect when disableReconnect is true', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test', disableReconnect: true });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    s.simulateClose();
    expect(client.isReconnecting).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(1); // No new socket

    client.dispose();
  });

  it('does not reconnect when no session is active', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();

    // No sessionId set
    s.simulateClose();
    expect(client.isReconnecting).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(1);

    client.dispose();
  });

  it('leaveSession cancels reconnect', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    s.simulateClose();
    expect(client.isReconnecting).toBe(true);

    client.leaveSession();
    expect(client.isReconnecting).toBe(false);
    expect(client.sessionId).toBeNull();

    client.dispose();
  });

  it('reconnect resets backoff after successful resync', async () => {
    const { LobbyClient } = await importClient();
    const client = new LobbyClient({ WebSocketImpl: MockWS, url: 'ws://test' });
    const s = latestSocket();
    s.simulateOpen();
    client.sessionId = 'sess1';
    s.simulateMessage(JSON.stringify({ t: 'log', level: 'info', msg: 'clientId:c1' }));
    await flush();

    // Close and reconnect
    s.simulateClose();
    await vi.advanceTimersByTimeAsync(1100);
    const s2 = latestSocket();
    s2.simulateOpen();
    await flush();

    // Server confirms reconnect with a joined message
    s2.simulateMessage(JSON.stringify({ t: 'joined', sessionId: 'sess1', nationId: 0, nationTag: 'ENG', leader: false }));
    await flush();
    expect(client.isReconnecting).toBe(false);

    // Close again - backoff should reset to base
    s2.simulateClose();
    expect(client.isReconnecting).toBe(true);

    // Should use base delay (1s), not accumulated backoff
    await vi.advanceTimersByTimeAsync(1100);
    expect(sockets.length).toBe(3);

    client.dispose();
  });
});
