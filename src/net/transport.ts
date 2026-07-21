/**
 * Client-side sim transport abstraction (M-MP0).
 *
 * The UI talks to the simulation ONLY through this interface, using the
 * existing ToWorker / FromWorker protocol in src/shared/types.ts.
 *
 * Single-player: WorkerTransport (local Web Worker) — wired in main.tsx today.
 * Multiplayer (MP-M1): SocketTransport over WebSocket to the session server.
 * Session bootstrap will select the transport by mode (local worker vs socket
 * by session); the store stays transport-agnostic either way.
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
