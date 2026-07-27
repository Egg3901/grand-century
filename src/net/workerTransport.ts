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

const SIM_WORKER_CACHE = 'gc-sim-worker';

/**
 * CORS-mode warm so the runtime CacheFirst store rematches offline.
 * Keep the `new Worker(new URL(...), { type: 'module' })` call below intact —
 * Vite only detects that exact pattern as a worker entry.
 */
function warmSimWorkerCache(href: string): void {
  if (typeof caches === 'undefined') return;
  void (async () => {
    try {
      const cache = await caches.open(SIM_WORKER_CACHE);
      if (await cache.match(href)) return;
      const response = await fetch(href);
      if (response.ok) await cache.put(href, response.clone());
    } catch {
      // Private mode / offline already — online first load still constructs the Worker.
    }
  })();
}

function discoverAndWarmSimWorker(): void {
  const entry = performance.getEntriesByType('resource')
    .map((e) => e.name)
    .find((name) => name.includes('sim.worker'));
  if (entry) warmSimWorkerCache(entry);
}

export class WorkerTransport implements SimTransport {
  private readonly worker: WorkerLike;
  private handler: ((msg: FromWorker) => void) | null = null;
  private readonly ownsWorker: boolean;

  constructor(worker?: WorkerLike) {
    this.ownsWorker = worker === undefined;
    // Vite worker-entry detection requires this exact `new Worker(new URL(...))` shape.
    this.worker = worker ?? new Worker(
      new URL('../worker/sim.worker.ts', import.meta.url),
      { type: 'module' },
    );
    if (this.ownsWorker && typeof performance !== 'undefined') {
      queueMicrotask(discoverAndWarmSimWorker);
      // Worker fetch may land after the microtask.
      setTimeout(discoverAndWarmSimWorker, 500);
    }
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
