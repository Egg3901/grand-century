/**
 * WebSocket client for MP lobby + in-game transport (MP-M2 … MP-M5).
 *
 * One connection covers create/join lobby → nation/team/ready → leaderStart →
 * then acts as SimTransport for ToWorker / FromWorker (with snapshot diffs).
 */

import type { FromWorker, ScenarioId, ToWorker } from "../shared/types";
import type { SimTransport } from "./transport";
import {
  isChatRelayMessage,
  isFromWorkerMessage,
  isLobbyStateMessage,
  isPresenceMessage,
  isSessionCreatedMessage,
  isSessionJoinedMessage,
  isSessionListMessage,
  type LobbyClientMessage,
  type LobbyStateMessage,
  type PresencePlayer,
  type SessionListEntry,
  type SessionMode,
  type ServerToClient,
} from "./sessionProtocol";
import { decodeWireBrowser } from "./snapshotCodec";
import {
  applyServerSnapshotMessage,
  createApplierState,
} from "./snapshotApplier";
import { defaultSocketUrl } from "./socketUrl";

export type LobbyStateHandler = (state: LobbyStateMessage) => void;
export type SessionListHandler = (sessions: SessionListEntry[]) => void;
export type LobbyErrorHandler = (msg: string) => void;
export type PresenceHandler = (players: PresencePlayer[]) => void;
export type ChatHandler = (msg: {
  from: string;
  name: string;
  text: string;
  at: number;
}) => void;

export interface LobbyClientOptions {
  url?: string;
  WebSocketImpl?: typeof WebSocket;
  playerName?: string;
  autoReconnect?: boolean;
  onConnection?: (
    state: "connecting" | "connected" | "reconnecting" | "disconnected",
  ) => void;
}

export class LobbyClient implements SimTransport {
  private ws: WebSocket;
  private readonly pending: unknown[] = [];
  private open = false;
  private disposed = false;
  private simHandler: ((msg: FromWorker) => void) | null = null;
  private lobbyHandler: LobbyStateHandler | null = null;
  private listHandler: SessionListHandler | null = null;
  private errorHandler: LobbyErrorHandler | null = null;
  private createdHandler: ((sessionId: string) => void) | null = null;
  private presenceHandler: PresenceHandler | null = null;
  private chatHandler: ChatHandler | null = null;
  private readonly applier = createApplierState();
  private clientId: string | null = null;
  private readonly url: string;
  private readonly WS: typeof WebSocket;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private recovering = false;
  private readonly options: LobbyClientOptions;
  lastLobby: LobbyStateMessage | null = null;
  sessionId: string | null = null;
  playerName: string;

  constructor(options: LobbyClientOptions = {}) {
    this.options = options;
    this.WS = options.WebSocketImpl ?? WebSocket;
    this.url = options.url ?? defaultSocketUrl();
    this.playerName = options.playerName?.trim() || "Player";
    this.ws = new this.WS(this.url);
    this.bindSocket(this.ws);
    options.onConnection?.("connecting");
  }

  private bindSocket(ws: WebSocket): void {
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      if (this.disposed || ws !== this.ws) return;
      if (this.recovering && this.sessionId && this.clientId) {
        ws.send(
          JSON.stringify({
            t: "reconnect",
            sessionId: this.sessionId,
            clientId: this.clientId,
          }),
        );
        return;
      }
      this.open = true;
      this.reconnectAttempts = 0;
      this.options.onConnection?.("connected");
      for (const msg of this.pending) {
        ws.send(JSON.stringify(msg));
      }
      this.pending.length = 0;
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      if (this.disposed || ws !== this.ws) return;
      this.enqueueRaw(event.data, ws);
    });
    ws.addEventListener("close", () => {
      if (this.disposed || ws !== this.ws) return;
      this.open = false;
      // Orders from a lost connection must never be replayed into a later world.
      this.pending.length = 0;
      this.recovering =
        this.lastLobby?.phase === "running" &&
        !!this.sessionId &&
        !!this.clientId;
      if (!this.options.autoReconnect || this.reconnectAttempts >= 8) {
        this.options.onConnection?.("disconnected");
        return;
      }
      this.options.onConnection?.("reconnecting");
      this.reconnectTimer = setTimeout(
        () => this.connectAgain(),
        Math.min(1000 * 2 ** this.reconnectAttempts++, 10000),
      );
    });
  }

  private connectAgain(): void {
    this.reconnectTimer = null;
    if (this.disposed) return;
    if (
      !this.recovering &&
      this.sessionId &&
      this.lastLobby?.phase === "lobby"
    ) {
      this.clientId = null;
      this.pending.push({
        t: "joinLobby",
        sessionId: this.sessionId,
        playerName: this.playerName,
      });
    }
    const old = this.ws;
    this.ws = new this.WS(this.url);
    this.bindSocket(this.ws);
    try {
      old.close();
    } catch {}
  }

  reconnect(): void {
    if (this.disposed || this.open) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = 0;
    this.options.onConnection?.("reconnecting");
    this.connectAgain();
  }

  private chain: Promise<void> = Promise.resolve();

  private enqueueRaw(data: unknown, socket: WebSocket): void {
    this.chain = this.chain
      .then(() => this.handleRaw(data, socket))
      .catch(() => undefined);
  }

  private async handleRaw(data: unknown, socket: WebSocket): Promise<void> {
    let raw: unknown;
    try {
      raw = await decodeWireBrowser(data);
    } catch {
      return;
    }

    if (this.disposed || socket !== this.ws) return;

    if (
      raw &&
      typeof raw === "object" &&
      (raw as { t?: string }).t === "log" &&
      typeof (raw as { msg?: string }).msg === "string"
    ) {
      const m = /clientId:(\S+)/.exec((raw as { msg: string }).msg);
      if (m && !this.recovering) this.clientId = m[1]!;
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
      if (this.recovering) {
        this.recovering = false;
        this.open = true;
        this.reconnectAttempts = 0;
        this.pending.length = 0;
        this.options.onConnection?.("connected");
      }
      return;
    }
    if (isPresenceMessage(raw)) {
      this.presenceHandler?.(raw.players);
      return;
    }
    if (isChatRelayMessage(raw)) {
      this.chatHandler?.(raw);
      return;
    }

    if (isFromWorkerMessage(raw) && raw.t === "ready") {
      this.applier.shared = null;
      this.applier.view = null;
      this.applier.seq = 0;
    }
    if (
      isFromWorkerMessage(raw) &&
      raw.t === "log" &&
      raw.level === "error" &&
      this.recovering
    ) {
      this.options.onConnection?.("disconnected");
    }
    const snap = applyServerSnapshotMessage(
      this.applier,
      raw as ServerToClient,
    );
    if (snap) {
      this.simHandler?.(snap);
      return;
    }

    if (isFromWorkerMessage(raw)) {
      if (raw.t === "log" && (raw.level === "error" || raw.level === "warn")) {
        this.errorHandler?.(raw.msg);
      }
      this.simHandler?.(raw);
    }
  }

  private wire(msg: unknown): void {
    if (this.disposed) return;
    if (
      this.recovering ||
      (!this.open && this.lastLobby?.phase === "running")
    ) {
      this.errorHandler?.(
        "Connection lost. Wait until reconnected before sending orders.",
      );
      return;
    }
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

  onPresence(handler: PresenceHandler): void {
    this.presenceHandler = handler;
  }

  onChat(handler: ChatHandler): void {
    this.chatHandler = handler;
  }

  createSession(opts: {
    name: string;
    seed: number;
    mode: SessionMode;
    maxPlayers: number;
    scenarioId?: ScenarioId;
  }): void {
    const msg: LobbyClientMessage = {
      t: "createSession",
      name: opts.name,
      seed: opts.seed,
      mode: opts.mode,
      maxPlayers: opts.maxPlayers,
      scenarioId: opts.scenarioId,
      playerName: this.playerName,
    };
    this.wire(msg);
  }

  listSessions(): void {
    this.wire({ t: "listSessions" } satisfies LobbyClientMessage);
  }

  joinLobby(sessionId: string): void {
    this.wire({
      t: "joinLobby",
      sessionId,
      playerName: this.playerName,
    } satisfies LobbyClientMessage);
  }

  selectNation(nation: string): void {
    this.wire({ t: "selectNation", nation } satisfies LobbyClientMessage);
  }

  selectTeam(team: number): void {
    this.wire({ t: "selectTeam", team } satisfies LobbyClientMessage);
  }

  setReady(ready: boolean): void {
    this.wire({ t: "setReady", ready } satisfies LobbyClientMessage);
  }

  leaderStart(): void {
    this.wire({ t: "leaderStart" } satisfies LobbyClientMessage);
  }

  leaveSession(): void {
    this.wire({ t: "leaveSession" } satisfies LobbyClientMessage);
    this.sessionId = null;
    this.lastLobby = null;
  }

  sendChat(text: string): void {
    this.wire({ t: "chat", text });
  }

  getClientId(): string | null {
    return this.clientId;
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
    this.presenceHandler = null;
    this.chatHandler = null;
    this.pending.length = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

/** Resolve HTTP lobby list URL from the WS URL (same host/port, path /sessions). */
export function resolveSessionsHttpUrl(
  wsUrl: string = defaultSocketUrl(),
): string {
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    u.pathname = "/sessions";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "http://127.0.0.1:3412/sessions";
  }
}
