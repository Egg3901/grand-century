/**
 * WebSocket SimTransport for multiplayer (MP-M1).
 *
 * Connects to the session server, sends a join envelope on open, then
 * forwards ToWorker messages and routes FromWorker messages to handlers.
 * SessionJoined acks are swallowed (not part of SimTransport).
 */

import type { FromWorker, ToWorker } from '../shared/types';
import type { SimTransport } from './transport';
import {
  isSessionJoinedMessage,
  type SessionJoinMessage,
  type ServerToClient,
} from './sessionProtocol';

export interface SocketTransportOptions {
  /** Session join payload sent once the socket opens. */
  join: SessionJoinMessage;
  /** Optional WebSocket constructor (tests). */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Resolve the session-server WebSocket URL.
 * - Dev: `ws://127.0.0.1:${VITE_MP_PORT|3412}` (override with VITE_MP_WS_URL)
 * - Prod: `wss://<host><BASE_URL>ws` e.g. `/games/grand-century/ws`
 */
export function resolveSocketUrl(
  env: { DEV?: boolean; BASE_URL?: string; VITE_MP_PORT?: string; VITE_MP_WS_URL?: string } = import.meta.env,
  locationLike: { protocol: string; host: string } | undefined = typeof location !== 'undefined' ? location : undefined,
): string {
  if (env.VITE_MP_WS_URL) return env.VITE_MP_WS_URL;
  if (env.DEV || !locationLike) {
    const port = env.VITE_MP_PORT ?? '3412';
    return `ws://127.0.0.1:${port}`;
  }
  const proto = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = (env.BASE_URL ?? '/').endsWith('/') ? (env.BASE_URL ?? '/') : `${env.BASE_URL}/`;
  return `${proto}//${locationLike.host}${base}ws`;
}

export class SocketTransport implements SimTransport {
  private readonly ws: WebSocket;
  private handler: ((msg: FromWorker) => void) | null = null;
  private readonly pending: ToWorker[] = [];
  private open = false;
  private disposed = false;

  constructor(url: string, options: SocketTransportOptions) {
    const WS = options.WebSocketImpl ?? WebSocket;
    this.ws = new WS(url);

    this.ws.addEventListener('open', () => {
      if (this.disposed) return;
      this.open = true;
      this.ws.send(JSON.stringify(options.join));
      for (const msg of this.pending) {
        this.ws.send(JSON.stringify(msg));
      }
      this.pending.length = 0;
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      if (this.disposed) return;
      let raw: unknown = event.data;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw) as ServerToClient;
        } catch {
          return;
        }
      }
      if (isSessionJoinedMessage(raw)) return;
      this.handler?.(raw as FromWorker);
    });
  }

  send(msg: ToWorker): void {
    if (this.disposed) return;
    // readyState 1 === OPEN (avoid depending on global WebSocket in tests)
    if (!this.open || this.ws.readyState !== 1) {
      this.pending.push(msg);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(handler: (msg: FromWorker) => void): void {
    this.handler = handler;
  }

  dispose(): void {
    this.disposed = true;
    this.handler = null;
    this.pending.length = 0;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}
