/**
 * WebSocket SimTransport for multiplayer (MP-M1 … MP-M5).
 *
 * Connects to the session server, sends a join (or reconnect) envelope on open,
 * decompresses wire frames, applies snapshot diffs, and auto-reconnects.
 */

import type { FromWorker, ToWorker } from '../shared/types';
import type { SimTransport } from './transport';
import {
  isChatRelayMessage,
  isPresenceMessage,
  isSessionJoinedMessage,
  type PresencePlayer,
  type SessionJoinMessage,
  type ServerToClient,
} from './sessionProtocol';
import { decodeWireBrowser } from './snapshotCodec';
import { applyServerSnapshotMessage, createApplierState } from './snapshotApplier';

export interface SocketTransportOptions {
  /** Session join payload sent once the socket opens (fresh join). */
  join: SessionJoinMessage;
  /** Optional WebSocket constructor (tests). */
  WebSocketImpl?: typeof WebSocket;
  /** Called when presence updates arrive. */
  onPresence?: (players: PresencePlayer[]) => void;
  /** Called when a chat line arrives. */
  onChat?: (msg: { from: string; name: string; text: string; at: number }) => void;
  /** Disable auto-reconnect (tests). */
  autoReconnect?: boolean;
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
  private ws: WebSocket;
  private handler: ((msg: FromWorker) => void) | null = null;
  private readonly pending: ToWorker[] = [];
  private open = false;
  private disposed = false;
  private readonly url: string;
  private readonly options: SocketTransportOptions;
  private readonly applier = createApplierState();
  private clientId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoReconnect: boolean;

  constructor(url: string, options: SocketTransportOptions) {
    this.url = url;
    this.options = options;
    this.autoReconnect = options.autoReconnect !== false;
    const WS = options.WebSocketImpl ?? WebSocket;
    this.ws = new WS(url);
    this.bindSocket(this.ws);
  }

  private bindSocket(ws: WebSocket): void {
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      if (this.disposed) return;
      this.open = true;
      this.reconnectAttempts = 0;
      if (this.clientId && this.options.join.sessionId) {
        ws.send(JSON.stringify({
          t: 'reconnect',
          sessionId: this.options.join.sessionId,
          clientId: this.clientId,
        }));
      } else {
        ws.send(JSON.stringify(this.options.join));
      }
      for (const msg of this.pending) {
        ws.send(JSON.stringify(msg));
      }
      this.pending.length = 0;
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      if (this.disposed) return;
      this.enqueueRaw(event.data);
    });

    ws.addEventListener('close', () => {
      this.open = false;
      if (this.disposed || !this.autoReconnect) return;
      this.scheduleReconnect();
    });
  }

  private async handleRaw(data: unknown): Promise<void> {
    let raw: unknown;
    try {
      raw = await decodeWireBrowser(data);
    } catch {
      return;
    }

    // Capture assigned client id from server hello log.
    if (
      raw
      && typeof raw === 'object'
      && (raw as { t?: string }).t === 'log'
      && typeof (raw as { msg?: string }).msg === 'string'
    ) {
      const m = /clientId:(\S+)/.exec((raw as { msg: string }).msg);
      if (m) this.clientId = m[1]!;
    }

    if (isSessionJoinedMessage(raw)) return;

    if (isPresenceMessage(raw)) {
      this.options.onPresence?.(raw.players);
      return;
    }
    if (isChatRelayMessage(raw)) {
      this.options.onChat?.({
        from: raw.from,
        name: raw.name,
        text: raw.text,
        at: raw.at,
      });
      return;
    }

    const snap = applyServerSnapshotMessage(this.applier, raw as ServerToClient);
    if (snap) {
      this.handler?.(snap);
      return;
    }

    // Pass through ready / detail / log / legacy snapshot
    this.handler?.(raw as FromWorker);
  }

  /** Serialize async decodes so snapshot diffs apply in order. */
  private chain: Promise<void> = Promise.resolve();

  private enqueueRaw(data: unknown): void {
    this.chain = this.chain.then(() => this.handleRaw(data)).catch(() => undefined);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(8_000, 400 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      const WS = this.options.WebSocketImpl ?? WebSocket;
      this.ws = new WS(this.url);
      this.bindSocket(this.ws);
    }, delay);
  }

  send(msg: ToWorker): void {
    if (this.disposed) return;
    if (!this.open || this.ws.readyState !== 1) {
      this.pending.push(msg);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  sendChat(text: string): void {
    if (this.disposed) return;
    const payload = JSON.stringify({ t: 'chat', text });
    if (!this.open || this.ws.readyState !== 1) return;
    this.ws.send(payload);
  }

  /** E2E / harness: drop the socket so auto-reconnect kicks in. */
  forceClose(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }

  onMessage(handler: (msg: FromWorker) => void): void {
    this.handler = handler;
  }

  dispose(): void {
    this.disposed = true;
    this.handler = null;
    this.pending.length = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}
