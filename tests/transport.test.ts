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
    // Injected worker is not owned — terminate should not be called.
    const transport = new WorkerTransport(worker);
    transport.onMessage(() => undefined);
    transport.dispose();
    expect(worker.onmessage).toBeNull();
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});

describe('SocketTransport stub', () => {
  it('throws not-implemented on send/onMessage (MP-M1 placeholder)', () => {
    const transport = new SocketTransport('ws://localhost/mp');
    expect(() => transport.send({ t: 'init', seed: 1 })).toThrow(/MP-M1/);
    expect(() => transport.onMessage(() => undefined)).toThrow(/MP-M1/);
    expect(() => transport.dispose()).not.toThrow();
  });
});
