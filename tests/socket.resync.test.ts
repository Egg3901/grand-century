import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { SocketTransport } from '../src/net/socketTransport';
import { extractShared } from '../src/net/snapshotCodec';
import { createWorld } from '../src/sim/bootstrap';
import { snapshot } from '../src/sim/world';

type Listener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 0;
  binaryType = '';
  sent: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = this.OPEN;
    this.emit('open', {});
  }

  message(payload: unknown) {
    this.emit('message', { data: payload });
  }

  private emit(type: string, event: { data?: unknown }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

async function flushMessages() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('multiplayer snapshot recovery', () => {
  it('requests a full snapshot after receiving a diff with a missing base', async () => {
    FakeWebSocket.instances.length = 0;
    const transport = new SocketTransport('ws://test', {
      join: { t: 'join', sessionId: 'gap', nation: 'ENG', seed: 1836 },
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      autoReconnect: false,
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;
    const shared = extractShared(snapshot(createWorld(GAME_DATA, 1836), GAME_DATA));
    socket.message(JSON.stringify({ t: 'snapshotFull', seq: 1, shared }));
    await flushMessages();
    socket.message(JSON.stringify({ t: 'snapshotDiff', seq: 3, baseSeq: 2, diff: {} }));
    await flushMessages();

    expect(socket.sent.map((payload) => JSON.parse(payload))).toContainEqual({ t: 'requestSnapshot' });
    transport.dispose();
  });
});
