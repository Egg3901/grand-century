/**
 * WebSocket transport stub for multiplayer (MP-M1 — NOT wired yet).
 *
 * MP-M1 will select transport at session bootstrap:
 *   - Single-player / offline → WorkerTransport (local sim worker)
 *   - Multiplayer session (create/join lobby) → SocketTransport(wsUrl)
 * The store only sees SimTransport; main (or a future session bootstrap)
 * chooses which implementation to construct and call setTransport with.
 */

import type { FromWorker, ToWorker } from '../shared/types';
import type { SimTransport } from './transport';

const NOT_IMPLEMENTED = 'SocketTransport not implemented (MP-M1)';

export class SocketTransport implements SimTransport {
  // Reserved for MP-M1: WebSocket URL of the session server.
  constructor(_url: string) {
    // Intentionally empty — construction is allowed so call sites can exist;
    // send/onMessage throw until MP-M1 implements the wire protocol.
  }

  send(_msg: ToWorker): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  onMessage(_handler: (msg: FromWorker) => void): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  dispose(): void {
    // no-op until MP-M1 owns a live socket
  }
}
