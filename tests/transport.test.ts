import { describe, expect, it, vi } from 'vitest';
import { SocketTransport } from '../src/net/socketTransport';
import type { FromWorker, ToWorker } from '../src/shared/types';
import { WorkerTransport, type WorkerLike } from '../src/net/workerTransport';

function mockWorker(): WorkerLike & { emitted: ToWorker[] } {
  const emitted: ToWorker[] = [];
  const worker: WorkerLike & { emitted: ToWorker[] } = {
    emitted,
    onmessage: null,
    postMessage(message: unknown) {
      emitted.push(message as ToWorker);
    },
    terminate: vi.fn(),
  };
  return worker;
}

describe('WorkerTransport', () => {
  it('forwards send() to the worker via postMessage', () => {
    const worker = mockWorker();
    const transport = new WorkerTransport(worker);
    const msg: ToWorker = { t: 'init', seed: 1836 };
    transport.send(msg);
    expect(worker.emitted).toEqual([msg]);
    transport.send({ t: 'requestProvince', id: 42 });
    expect(worker.emitted[1]).toEqual({ t: 'requestProvince', id: 42 });
  });

  it('routes worker onmessage into the onMessage handler', () => {
    const worker = mockWorker();
    const transport = new WorkerTransport(worker);
    const received: FromWorker[] = [];
    transport.onMessage((msg) => received.push(msg));

    const ready: FromWorker = {
      t: 'log',
      level: 'info',
      msg: 'hello',
    };
    worker.onmessage?.({ data: ready } as MessageEvent<FromWorker>);
    expect(received).toEqual([ready]);
  });

  it('clears the handler and terminates an owned worker on dispose', () => {
    const worker = mockWorker();
    const transport = new WorkerTransport(worker);
    transport.onMessage(() => undefined);
    transport.dispose();
    expect(worker.onmessage).toBeNull();
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});

describe('SocketTransport', () => {
  it('sends join on open and routes FromWorker messages', () => {
    type Handler = (event: { data?: unknown }) => void;
    const listeners = new Map<string, Handler[]>();
    const sent: string[] = [];
    let readyState = 0;

    class FakeWS {
      readyState = 0;
      addEventListener(type: string, fn: Handler) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      }
      send(data: string) {
        sent.push(data);
      }
      close() {
        readyState = 3;
        this.readyState = 3;
      }
    }

    const transport = new SocketTransport('ws://test', {
      join: { t: 'join', sessionId: 's', nation: 'ENG', seed: 1 },
      WebSocketImpl: FakeWS as unknown as typeof WebSocket,
    });

    const received: FromWorker[] = [];
    transport.onMessage((msg) => received.push(msg));

    // open
    readyState = 1;
    const fake = (transport as unknown as { ws: { readyState: number } }).ws;
    fake.readyState = 1;
    for (const fn of listeners.get('open') ?? []) fn({});
    expect(sent[0]).toContain('"t":"join"');

    transport.send({ t: 'command', cmd: { t: 'setSpeed', speed: 1 } });
    expect(sent.some((s) => s.includes('setSpeed'))).toBe(true);

    // joined ack ignored
    for (const fn of listeners.get('message') ?? []) {
      fn({ data: JSON.stringify({ t: 'joined', sessionId: 's', nationId: 0, nationTag: 'ENG', leader: true }) });
    }
    expect(received).toEqual([]);

    for (const fn of listeners.get('message') ?? []) {
      fn({ data: JSON.stringify({ t: 'log', level: 'info', msg: 'hi' }) });
    }
    expect(received).toEqual([{ t: 'log', level: 'info', msg: 'hi' }]);

    transport.dispose();
    expect(readyState).toBe(3);
  });
});
