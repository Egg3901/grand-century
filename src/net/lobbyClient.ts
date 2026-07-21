/**
 * WebSocket client for MP lobby + in-game transport (MP-M2).
 *
 * One connection covers create/join lobby → nation/team/ready → leaderStart →
 * then acts as SimTransport for ToWorker / FromWorker.
 */

import type { FromWorker, ToWorker } from '../shared/types';
import type { SimTransport } from './transport';
import {
  isFromWorkerMessage,
  isLobbyStateMessage,
  isSessionCreatedMessage,
  isSessionJoinedMessage,
  isSessionListMessage,
  type LobbyClientMessage,
  type LobbyStateMessage,
  type SessionListEntry,
  type SessionMode,
  type ServerToClient,
} from './sessionProtocol';
import { resolveSocketUrl } from './socketTransport';

export type LobbyStateHandler = (state: LobbyStateMessage) => void;
export type SessionListHandler = (sessions: SessionListEntry[]) => void;
export type LobbyErrorHandler = (msg: string) => void;

export interface LobbyClientOptions {
  url?: string;
  WebSocketImpl?: typeof WebSocket;
  playerName?: string;
}

export class LobbyClient implements SimTransport {
  private readonly ws: WebSocket;
  private readonly pending: unknown[] = [];
  private open = false;
  private disposed = false;
  private simHandler: ((msg: FromWorker) => void) | null = null;
  private lobbyHandler: LobbyStateHandler | null = null;
  private listHandler: SessionListHandler | null = null;
  private errorHandler: LobbyErrorHandler | null = null;
  private createdHandler: ((sessionId: string) => void) | null = null;
  lastLobby: LobbyStateMessage | null = null;
  sessionId: string | null = null;
  playerName: string;

  constructor(options: LobbyClientOptions = {}) {
    const WS = options.WebSocketImpl ?? WebSocket;
    const url = options.url ?? resolveSocketUrl();
    this.playerName = options.playerName?.trim() || 'Player';
    this.ws = new WS(url);

    this.ws.addEventListener('open', () => {
      if (this.disposed) return;
      this.open = true;
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

      if (isLobbyStateMessage(raw)) {
        this.lastLobby = raw;
        this.sessionId = raw.sessionId;
        this.lobbyHandler?.(raw);
        return;
      }
      if (isSessionListMessage(raw)) {
        this.listHandler?.(raw.sessions);
        return;
      }
      if (isSessionCreatedMessage(raw)) {
        this.sessionId = raw.sessionId;
        this.createdHandler?.(raw.sessionId);
        return;
      }
      if (isSessionJoinedMessage(raw)) {
        // Seat ack at game start — sim ready/snapshot follow.
        return;
      }
      if (isFromWorkerMessage(raw)) {
        if (raw.t === 'log' && (raw.level === 'error' || raw.level === 'warn')) {
          this.errorHandler?.(raw.msg);
        }
        this.simHandler?.(raw);
        return;
      }
    });
  }

  private wire(msg: unknown): void {
    if (this.disposed) return;
    if (!this.open || this.ws.readyState !== 1) {
      this.pending.push(msg);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  onLobbyState(handler: LobbyStateHandler): void {
    this.lobbyHandler = handler;
    if (this.lastLobby) handler(this.lastLobby);
  }

  onSessionList(handler: SessionListHandler): void {
    this.listHandler = handler;
  }

  onCreated(handler: (sessionId: string) => void): void {
    this.createdHandler = handler;
  }

  onLobbyError(handler: LobbyErrorHandler): void {
    this.errorHandler = handler;
  }

  createSession(opts: {
    name: string;
    seed: number;
    mode: SessionMode;
    maxPlayers: number;
  }): void {
    const msg: LobbyClientMessage = {
      t: 'createSession',
      name: opts.name,
      seed: opts.seed,
      mode: opts.mode,
      maxPlayers: opts.maxPlayers,
      playerName: this.playerName,
    };
    this.wire(msg);
  }

  listSessions(): void {
    this.wire({ t: 'listSessions' } satisfies LobbyClientMessage);
  }

  joinLobby(sessionId: string): void {
    this.wire({
      t: 'joinLobby',
      sessionId,
      playerName: this.playerName,
    } satisfies LobbyClientMessage);
  }

  selectNation(nation: string): void {
    this.wire({ t: 'selectNation', nation } satisfies LobbyClientMessage);
  }

  selectTeam(team: number): void {
    this.wire({ t: 'selectTeam', team } satisfies LobbyClientMessage);
  }

  setReady(ready: boolean): void {
    this.wire({ t: 'setReady', ready } satisfies LobbyClientMessage);
  }

  leaderStart(): void {
    this.wire({ t: 'leaderStart' } satisfies LobbyClientMessage);
  }

  leaveSession(): void {
    this.wire({ t: 'leaveSession' } satisfies LobbyClientMessage);
    this.sessionId = null;
    this.lastLobby = null;
  }

  // --- SimTransport -------------------------------------------------------

  send(msg: ToWorker): void {
    this.wire(msg);
  }

  onMessage(handler: (msg: FromWorker) => void): void {
    this.simHandler = handler;
  }

  dispose(): void {
    this.disposed = true;
    this.simHandler = null;
    this.lobbyHandler = null;
    this.listHandler = null;
    this.errorHandler = null;
    this.createdHandler = null;
    this.pending.length = 0;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

/** Resolve HTTP lobby list URL from the WS URL (same host/port, path /sessions). */
export function resolveSessionsHttpUrl(
  wsUrl: string = resolveSocketUrl(),
): string {
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = '/sessions';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return 'http://127.0.0.1:3412/sessions';
  }
}
