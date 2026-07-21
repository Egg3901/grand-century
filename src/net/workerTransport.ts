/**
 * Local Web Worker transport — single-player path (unchanged behavior).
 * Creates the same module worker main.tsx used before M-MP0.
 */

import type { FromWorker, ToWorker } from '../shared/types';
import type { SimTransport } from './transport';

/** Minimal Worker surface so unit tests can inject a mock without a real Worker. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  terminate(): void;
}

export class WorkerTransport implements SimTransport {
  private readonly worker: WorkerLike;
  private handler: ((msg: FromWorker) => void) | null = null;
  private readonly ownsWorker: boolean;

  constructor(worker?: WorkerLike) {
    this.ownsWorker = worker === undefined;
    this.worker = worker ?? new Worker(
      new URL('../worker/sim.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
      this.handler?.(event.data);
    };
  }

  send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  onMessage(handler: (msg: FromWorker) => void): void {
    this.handler = handler;
  }

  dispose(): void {
    this.handler = null;
    this.worker.onmessage = null;
    if (this.ownsWorker) this.worker.terminate();
  }
}
