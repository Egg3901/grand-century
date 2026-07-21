/**
 * Client-side sim transport abstraction (M-MP0).
 *
 * The UI talks to the simulation ONLY through this interface, using the
 * existing ToWorker / FromWorker protocol in src/shared/types.ts.
 *
 * Single-player: WorkerTransport (local Web Worker) — default in main.tsx.
 * Multiplayer: SocketTransport over WebSocket when `#/mp?session=&nation=` (MP-M1).
 * The store stays transport-agnostic either way.
 */

import type { FromWorker, ToWorker } from '../shared/types';

export interface SimTransport {
  /** Forward a command / request / init to the sim. */
  send(msg: ToWorker): void;
  /** Register the handler for snapshots, ready, detail, saveStatus, log, etc. */
  onMessage(handler: (msg: FromWorker) => void): void;
  /** Tear down the underlying connection / worker. */
  dispose(): void;
}
