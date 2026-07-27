/**
 * Multiplayer session: lobby + authoritative sim (MP-M1 … MP-M5).
 * Pure of WebSocket — callers inject send fns so unit tests need no network.
 *
 * Phase 'lobby': players join, pick nation/team, ready up; no sim ticks.
 * Phase 'running': createWorld once on leaderStart; tick + diffed broadcasts.
 */

import type { Command, FromWorker, GameData, NationId, ToWorker, World } from '../src/shared/types';
import type {
  ChatRelayMessage,
  LobbyNationInfo,
  LobbyPlayerInfo,
  LobbyStateMessage,
  PresencePlayer,
  ServerToClient,
  SessionListEntry,
  SessionMode,
  SessionPhase,
} from '../src/net/sessionProtocol';
import {
  applySharedDiff,
  diffShared,
  estimateJsonBytes,
  extractPlayerView,
  extractShared,
  mergeSnapshot,
  type SharedSnapshot,
} from '../src/net/snapshotCodec';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { detailNation, detailProvince } from '../src/sim/detail';
import { advanceDay, snapshot } from '../src/sim/world';
import { GAME_DATA } from '../src/data/gameData';
import { WORLD_SEED } from '../src/data/generated';

export type ClientSender = (msg: ServerToClient) => void;

export interface SessionClient {
  id: string;
  name: string;
  /** Primary nation seat (set in lobby or via M1 join). */
  nationId: NationId | null;
  nationTag: string | null;
  team: number | null;
  ready: boolean;
  connected: boolean;
  send: ClientSender;
  /** Last shared snapshot seq successfully sent to this client. */
  lastSharedSeq: number;
}

export interface HeldSeat {
  clientId: string;
  name: string;
  nationId: NationId;
  nationTag: string;
  team: number | null;
  wasLeader: boolean;
  expiresAt: number;
}

export interface JoinResult {
  ok: boolean;
  leader: boolean;
  nationId: NationId;
  nationTag: string;
  error?: string;
}

export interface LobbyJoinResult {
  ok: boolean;
  error?: string;
}

/** days advanced per real second at each speed — mirrors sim.worker.ts */
export const SPEED_DAYS_PER_SEC = [0, 2, 5, 12, 30, 90];

/** Max shared snapshot broadcasts per second while the world is running. */
export const MP_SNAPSHOT_HZ = 3;

/** Nation seat held after disconnect for reconnect. */
export const RECONNECT_GRACE_MS = 60_000;

const FORBIDDEN_COMMANDS = new Set<Command['t']>([
  'setPlayerNation',
  'newGame',
  'save',
  'load',
  'listSaves',
]);

const NATION_CATALOG: LobbyNationInfo[] = WORLD_SEED.nations
  .map((n) => ({ tag: n.tag, name: n.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

function clampMaxPlayers(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.max(2, Math.min(8, Math.floor(n)));
}

function randomId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

/** Bandwidth accounting for verification (wire bytes after gzip framing). */
export interface BandwidthStats {
  sharedFullBytes: number;
  sharedDiffBytes: number;
  playerViewBytes: number;
  wireBytes: number;
  broadcasts: number;
  lastResetMs: number;
}

export class GameSession {
  readonly id: string;
  name: string;
  readonly seed: number;
  readonly mode: SessionMode;
  readonly maxPlayers: number;
  readonly data: GameData;
  phase: SessionPhase;
  world: World | null = null;
  readonly clients = new Map<string, SessionClient>();
  /** Disconnected seats held for reconnect grace. */
  readonly heldSeats = new Map<string, HeldSeat>();
  leaderId: string | null = null;
  private acc = 0;
  private sharedSeq = 0;
  /** Last shared snapshot *sent* on the wire (drives diffs). */
  private lastSent: SharedSnapshot | null = null;
  /** Authoritative latest shared (for reconstruct helpers). */
  private lastShared: SharedSnapshot | null = null;
  private broadcastAcc = 0;
  private pendingBroadcast = false;
  private softProvinceAcc = 0;
  bandwidth: BandwidthStats = {
    sharedFullBytes: 0,
    sharedDiffBytes: 0,
    playerViewBytes: 0,
    wireBytes: 0,
    broadcasts: 0,
    lastResetMs: Date.now(),
  };
  /**
   * Metrics only (issue #28): how many full `snapshot()` builds this session
   * has performed for wire/export paths. Not sim-behavioural.
   */
  snapshotBuildCount = 0;

  constructor(opts: {
    id: string;
    seed: number;
    name?: string;
    mode?: SessionMode;
    maxPlayers?: number;
    phase?: SessionPhase;
    data?: GameData;
  }) {
    this.id = opts.id;
    this.seed = opts.seed;
    this.name = opts.name ?? `Session ${opts.id}`;
    this.mode = opts.mode ?? 'competitive';
    this.maxPlayers = clampMaxPlayers(opts.maxPlayers ?? 4);
    this.data = opts.data ?? GAME_DATA;
    this.phase = opts.phase ?? 'lobby';
    if (this.phase === 'running') {
      this.ensureWorld();
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const c of this.clients.values()) if (c.connected) n++;
    return n;
  }

  /** Build world lazily; pause until leader unpauses. */
  ensureWorld(): World {
    if (!this.world) {
      this.world = createWorld(this.data, this.seed);
      this.world.speed = 0;
    }
    return this.world;
  }

  resolveNationTag(nation: string): { id: NationId; tag: string } | null {
    const trimmed = nation.trim();
    if (!trimmed) return null;
    const tag = trimmed.toUpperCase();
    const catalog = NATION_CATALOG.find((n) => n.tag === tag);
    if (catalog) {
      if (this.world) {
        const found = this.world.nations.find((n) => n.tag === tag);
        if (found) return { id: found.id, tag: found.tag };
      }
      return { id: -1, tag };
    }
    const asNum = Number(trimmed);
    if (this.world && Number.isFinite(asNum) && Number.isInteger(asNum) && this.world.nations[asNum]) {
      const n = this.world.nations[asNum]!;
      return { id: n.id, tag: n.tag };
    }
    return null;
  }

  resolveNationInWorld(nation: string): { id: NationId; tag: string } | null {
    const world = this.ensureWorld();
    const trimmed = nation.trim();
    if (!trimmed) return null;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && Number.isInteger(asNum) && world.nations[asNum]) {
      const n = world.nations[asNum]!;
      return { id: n.id, tag: n.tag };
    }
    const tag = trimmed.toUpperCase();
    const found = world.nations.find((n) => n.tag === tag);
    if (!found) return null;
    return { id: found.id, tag: found.tag };
  }

  takenNations(): string[] {
    const tags = new Set<string>();
    for (const c of this.clients.values()) {
      if (c.nationTag) tags.add(c.nationTag);
    }
    for (const h of this.heldSeats.values()) {
      tags.add(h.nationTag);
    }
    return [...tags].sort();
  }

  /** Nation claimed by another client (competitive) or another team (coop). */
  isNationBlocked(tag: string, forClientId: string): boolean {
    const upper = tag.toUpperCase();
    const self = this.clients.get(forClientId);
    for (const c of this.clients.values()) {
      if (c.id === forClientId) continue;
      if (c.nationTag !== upper) continue;
      if (this.mode === 'competitive') return true;
      if (self?.team == null || c.team == null || self.team !== c.team) return true;
    }
    for (const h of this.heldSeats.values()) {
      if (h.clientId === forClientId) continue;
      if (h.nationTag !== upper) continue;
      if (this.mode === 'competitive') return true;
      if (self?.team == null || h.team == null || self.team !== h.team) return true;
    }
    return false;
  }

  controlledNationIds(client: SessionClient): NationId[] {
    if (client.nationId == null) return [];
    if (this.mode === 'competitive') return [client.nationId];
    if (client.team == null) return [client.nationId];
    const ids: NationId[] = [];
    for (const c of this.clients.values()) {
      if (c.team === client.team && c.nationId != null) ids.push(c.nationId);
    }
    return ids.length > 0 ? ids : [client.nationId];
  }

  canStart(): { ok: boolean; reason?: string } {
    if (this.phase !== 'lobby') return { ok: false, reason: 'already running' };
    if (this.clients.size === 0) return { ok: false, reason: 'no players' };
    for (const c of this.clients.values()) {
      if (!c.nationTag) return { ok: false, reason: `${c.name} has not selected a nation` };
      if (this.mode === 'coop' && c.team == null) {
        return { ok: false, reason: `${c.name} has not selected a team` };
      }
      if (!c.ready) return { ok: false, reason: `${c.name} is not ready` };
    }
    if (this.mode === 'competitive') {
      const seen = new Set<string>();
      for (const c of this.clients.values()) {
        if (seen.has(c.nationTag!)) return { ok: false, reason: `duplicate nation ${c.nationTag}` };
        seen.add(c.nationTag!);
      }
    }
    return { ok: true };
  }

  buildLobbyState(forClientId: string): LobbyStateMessage {
    const players: LobbyPlayerInfo[] = [...this.clients.values()].map((c) => ({
      clientId: c.id,
      name: c.name,
      nationTag: c.nationTag,
      team: c.team,
      ready: c.ready,
      leader: c.id === this.leaderId,
    }));
    return {
      t: 'lobbyState',
      sessionId: this.id,
      name: this.name,
      seed: this.seed,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      phase: this.phase,
      leaderId: this.leaderId ?? '',
      players,
      takenNations: this.takenNations(),
      nations: NATION_CATALOG,
      you: forClientId,
    };
  }

  broadcastLobbyState(): void {
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      c.send(this.buildLobbyState(c.id));
    }
  }

  buildPresence(): PresencePlayer[] {
    const players: PresencePlayer[] = [...this.clients.values()].map((c) => ({
      clientId: c.id,
      name: c.name,
      nationTag: c.nationTag,
      team: c.team,
      leader: c.id === this.leaderId,
      connected: c.connected,
    }));
    for (const h of this.heldSeats.values()) {
      players.push({
        clientId: h.clientId,
        name: h.name,
        nationTag: h.nationTag,
        team: h.team,
        leader: h.wasLeader,
        connected: false,
      });
    }
    return players;
  }

  broadcastPresence(): void {
    const players = this.buildPresence();
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      c.send({ t: 'presence', sessionId: this.id, players });
    }
  }

  joinLobby(clientId: string, playerName: string | undefined, send: ClientSender): LobbyJoinResult {
    if (this.phase !== 'lobby') {
      return { ok: false, error: 'session already started' };
    }
    if (this.clients.size >= this.maxPlayers && !this.clients.has(clientId)) {
      return { ok: false, error: 'session full' };
    }

    const isLeader = this.leaderId === null;
    if (isLeader) this.leaderId = clientId;

    const existing = this.clients.get(clientId);
    if (existing) {
      existing.send = send;
      existing.connected = true;
      if (playerName?.trim()) existing.name = playerName.trim().slice(0, 24);
    } else {
      this.clients.set(clientId, {
        id: clientId,
        name: (playerName?.trim() || `Player ${this.clients.size + 1}`).slice(0, 24),
        nationId: null,
        nationTag: null,
        team: this.mode === 'coop' ? 1 : null,
        ready: false,
        connected: true,
        send,
        lastSharedSeq: 0,
      });
    }

    this.broadcastLobbyState();
    this.broadcastPresence();
    return { ok: true };
  }

  selectNation(clientId: string, nation: string): LobbyJoinResult {
    const client = this.clients.get(clientId);
    if (!client) return { ok: false, error: 'not in session' };
    if (this.phase !== 'lobby') return { ok: false, error: 'game already started' };

    const resolved = this.resolveNationTag(nation);
    if (!resolved) return { ok: false, error: `unknown nation: ${nation}` };
    if (this.isNationBlocked(resolved.tag, clientId)) {
      return { ok: false, error: `nation ${resolved.tag} already taken` };
    }

    client.nationTag = resolved.tag;
    client.nationId = resolved.id >= 0 ? resolved.id : null;
    client.ready = false;
    this.broadcastLobbyState();
    this.broadcastPresence();
    return { ok: true };
  }

  selectTeam(clientId: string, team: number): LobbyJoinResult {
    const client = this.clients.get(clientId);
    if (!client) return { ok: false, error: 'not in session' };
    if (this.phase !== 'lobby') return { ok: false, error: 'game already started' };
    if (this.mode !== 'coop') return { ok: false, error: 'teams only in coop mode' };

    const t = Math.floor(team);
    if (!Number.isFinite(t) || t < 1 || t > 8) {
      return { ok: false, error: 'team must be 1–8' };
    }

    client.team = t;
    if (client.nationTag && this.isNationBlocked(client.nationTag, clientId)) {
      client.nationTag = null;
      client.nationId = null;
    }
    client.ready = false;
    this.broadcastLobbyState();
    this.broadcastPresence();
    return { ok: true };
  }

  setReady(clientId: string, ready: boolean): LobbyJoinResult {
    const client = this.clients.get(clientId);
    if (!client) return { ok: false, error: 'not in session' };
    if (this.phase !== 'lobby') return { ok: false, error: 'game already started' };
    if (ready && !client.nationTag) return { ok: false, error: 'select a nation first' };
    if (ready && this.mode === 'coop' && client.team == null) {
      return { ok: false, error: 'select a team first' };
    }
    client.ready = Boolean(ready);
    this.broadcastLobbyState();
    return { ok: true };
  }

  leaderStart(clientId: string): LobbyJoinResult {
    if (clientId !== this.leaderId) return { ok: false, error: 'only the leader may start' };
    const check = this.canStart();
    if (!check.ok) return { ok: false, error: check.reason };

    const world = this.ensureWorld();
    for (const nation of world.nations) nation.isPlayer = false;
    for (const c of this.clients.values()) {
      const resolved = this.resolveNationInWorld(c.nationTag!);
      if (!resolved) return { ok: false, error: `failed to resolve ${c.nationTag}` };
      c.nationId = resolved.id;
      c.nationTag = resolved.tag;
      const entity = world.nations[resolved.id];
      if (entity) entity.isPlayer = true;
    }

    this.phase = 'running';
    this.broadcastLobbyState();
    this.broadcastPresence();

    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      c.send({
        t: 'joined',
        sessionId: this.id,
        nationId: c.nationId!,
        nationTag: c.nationTag!,
        leader: c.id === this.leaderId,
      });
      c.send({ t: 'ready', data: this.data });
    }
    this.broadcastSnapshots(true);
    return { ok: true };
  }

  /**
   * M1 permalink path: join a running seat (creates world immediately if needed).
   * If the session is still in lobby, seat the client with the requested nation.
   */
  join(clientId: string, nation: string, send: ClientSender): JoinResult {
    if (this.phase === 'lobby') {
      const lobby = this.joinLobby(clientId, undefined, send);
      if (!lobby.ok) {
        return { ok: false, leader: false, nationId: -1, nationTag: '', error: lobby.error };
      }
      const sel = this.selectNation(clientId, nation);
      if (!sel.ok) {
        return { ok: false, leader: false, nationId: -1, nationTag: '', error: sel.error };
      }
      return {
        ok: true,
        leader: this.leaderId === clientId,
        nationId: this.clients.get(clientId)!.nationId ?? -1,
        nationTag: this.clients.get(clientId)!.nationTag ?? nation.toUpperCase(),
      };
    }

    const resolved = this.resolveNationInWorld(nation);
    if (!resolved) {
      return { ok: false, leader: false, nationId: -1, nationTag: '', error: `unknown nation: ${nation}` };
    }

    if (this.isNationBlocked(resolved.tag, clientId)) {
      return {
        ok: false,
        leader: false,
        nationId: resolved.id,
        nationTag: resolved.tag,
        error: `nation ${resolved.tag} already taken`,
      };
    }

    if (this.clients.size >= this.maxPlayers && !this.clients.has(clientId)) {
      return { ok: false, leader: false, nationId: -1, nationTag: '', error: 'session full' };
    }

    const isLeader = this.leaderId === null;
    if (isLeader) this.leaderId = clientId;

    const world = this.ensureWorld();
    const nationEntity = world.nations[resolved.id];
    if (nationEntity) nationEntity.isPlayer = true;

    this.clients.set(clientId, {
      id: clientId,
      name: `Player ${this.clients.size + 1}`,
      nationId: resolved.id,
      nationTag: resolved.tag,
      team: this.mode === 'coop' ? 1 : null,
      ready: true,
      connected: true,
      send,
      lastSharedSeq: 0,
    });

    send({
      t: 'joined',
      sessionId: this.id,
      nationId: resolved.id,
      nationTag: resolved.tag,
      leader: isLeader,
    });
    send({ t: 'ready', data: this.data });
    this.sendFullTo(clientId);
    this.broadcastPresence();

    return {
      ok: true,
      leader: isLeader,
      nationId: resolved.id,
      nationTag: resolved.tag,
    };
  }

  /**
   * Rejoin after disconnect within the grace window.
   * Restores the held seat and sends a fresh FULL snapshot.
   */
  reconnect(clientId: string, send: ClientSender): JoinResult {
    this.purgeExpiredHolds();
    const held = this.heldSeats.get(clientId);
    if (!held) {
      return { ok: false, leader: false, nationId: -1, nationTag: '', error: 'reconnect expired or unknown' };
    }
    if (this.phase !== 'running' || !this.world) {
      return { ok: false, leader: false, nationId: -1, nationTag: '', error: 'session not running' };
    }

    this.heldSeats.delete(clientId);
    if (held.wasLeader || this.leaderId === null) {
      this.leaderId = clientId;
    }

    const world = this.world;
    const nationEntity = world.nations[held.nationId];
    if (nationEntity) nationEntity.isPlayer = true;

    this.clients.set(clientId, {
      id: clientId,
      name: held.name,
      nationId: held.nationId,
      nationTag: held.nationTag,
      team: held.team,
      ready: true,
      connected: true,
      send,
      lastSharedSeq: 0,
    });

    send({
      t: 'joined',
      sessionId: this.id,
      nationId: held.nationId,
      nationTag: held.nationTag,
      leader: this.leaderId === clientId,
    });
    send({ t: 'ready', data: this.data });
    this.sendFullTo(clientId);
    this.broadcastPresence();

    return {
      ok: true,
      leader: this.leaderId === clientId,
      nationId: held.nationId,
      nationTag: held.nationTag,
    };
  }

  /**
   * Soft-disconnect: hold the nation seat for RECONNECT_GRACE_MS.
   * Hard leave (lobby / explicit) uses hardLeave.
   */
  disconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (this.phase === 'running' && client.nationId != null && client.nationTag) {
      this.heldSeats.set(clientId, {
        clientId,
        name: client.name,
        nationId: client.nationId,
        nationTag: client.nationTag,
        team: client.team,
        wasLeader: this.leaderId === clientId,
        expiresAt: Date.now() + RECONNECT_GRACE_MS,
      });
      this.clients.delete(clientId);
      if (this.leaderId === clientId) {
        const next = [...this.clients.values()].find((c) => c.connected);
        this.leaderId = next?.id ?? null;
      }
      this.broadcastPresence();
      return;
    }

    this.hardLeave(clientId);
  }

  hardLeave(clientId: string): void {
    const client = this.clients.get(clientId);
    this.heldSeats.delete(clientId);
    if (!client) return;
    this.clients.delete(clientId);

    if (this.phase === 'running' && this.world && client.nationId != null) {
      const stillHeld = [...this.clients.values()].some((c) => c.nationId === client.nationId)
        || [...this.heldSeats.values()].some((h) => h.nationId === client.nationId);
      if (!stillHeld) {
        const nation = this.world.nations[client.nationId];
        if (nation) nation.isPlayer = false;
      }
    }

    if (this.leaderId === clientId) {
      const next = this.clients.values().next().value as SessionClient | undefined;
      this.leaderId = next?.id ?? null;
    }

    if (this.phase === 'lobby' && this.clients.size > 0) {
      this.broadcastLobbyState();
    }
    this.broadcastPresence();
  }

  /** Alias used by SessionManager. */
  leave(clientId: string): void {
    this.disconnect(clientId);
  }

  purgeExpiredHolds(): void {
    const now = Date.now();
    for (const [id, h] of this.heldSeats) {
      if (h.expiresAt <= now) {
        this.heldSeats.delete(id);
        if (this.world && h.nationId != null) {
          const stillHeld = [...this.clients.values()].some((c) => c.nationId === h.nationId)
            || [...this.heldSeats.values()].some((x) => x.nationId === h.nationId);
          if (!stillHeld) {
            const nation = this.world.nations[h.nationId];
            if (nation) nation.isPlayer = false;
          }
        }
      }
    }
  }

  handleChat(clientId: string, text: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.connected) return;
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!cleaned) return;
    const msg: ChatRelayMessage = {
      t: 'chat',
      sessionId: this.id,
      from: clientId,
      name: client.name,
      text: cleaned,
      at: Date.now(),
    };
    for (const c of this.clients.values()) {
      if (c.connected) c.send(msg);
    }
  }

  handleMessage(clientId: string, msg: ToWorker): void {
    if (this.phase !== 'running' || !this.world) return;
    const client = this.clients.get(clientId);
    if (!client || client.nationId == null || !client.connected) return;

    switch (msg.t) {
      case 'init':
        return;
      case 'command':
        this.handleCommand(client, msg.cmd);
        return;
      case 'requestProvince': {
        const prev = this.world.playerNation;
        this.world.playerNation = client.nationId;
        client.send({
          t: 'provinceDetail',
          detail: detailProvince(this.world, this.data, msg.id),
        });
        this.world.playerNation = prev;
        return;
      }
      case 'requestNation': {
        const allowed = this.controlledNationIds(client);
        if (!allowed.includes(msg.id)) {
          client.send({
            t: 'log',
            level: 'warn',
            msg: 'nation detail is private to your controlled nations',
          });
          return;
        }
        const prev = this.world.playerNation;
        this.world.playerNation = client.nationId;
        client.send({
          t: 'nationDetail',
          detail: detailNation(this.world, this.data, msg.id),
        });
        this.world.playerNation = prev;
        return;
      }
    }
  }

  handleCommand(client: SessionClient, cmd: Command): void {
    if (!this.world || client.nationId == null) return;

    if (FORBIDDEN_COMMANDS.has(cmd.t)) {
      client.send({
        t: 'log',
        level: 'warn',
        msg: `command ${cmd.t} is not allowed in multiplayer sessions`,
      });
      return;
    }

    if (cmd.t === 'setSpeed') {
      if (client.id !== this.leaderId) {
        client.send({
          t: 'log',
          level: 'warn',
          msg: 'only the session leader may change speed/pause',
        });
        return;
      }
      applyCommand(this.world, this.data, cmd, (m) => client.send(m));
      this.broadcastSnapshots(true);
      return;
    }

    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    applyCommand(this.world, this.data, cmd, (m) => this.broadcastOrUnicast(client, m));
    this.world.playerNation = prev;
    this.broadcastSnapshots(true);
  }

  /** Advance sim by dt real seconds (server-authoritative clock). */
  tick(dtSeconds: number): void {
    this.purgeExpiredHolds();
    if (this.phase !== 'running' || !this.world) return;
    if (this.connectedCount === 0 && this.heldSeats.size === 0) return;

    let steps = 0;
    if (this.world.speed > 0 && this.connectedCount > 0) {
      this.acc += dtSeconds * (SPEED_DAYS_PER_SEC[this.world.speed] ?? 0);
      while (this.acc >= 1 && steps < 400) {
        advanceDay(this.world, this.data);
        this.acc -= 1;
        steps++;
      }
    }

    if (steps > 0) {
      this.pendingBroadcast = true;
    }

    // Cap shared broadcast rate (2–4 Hz). Commands force immediate via force=true.
    if (this.pendingBroadcast) {
      this.broadcastAcc += dtSeconds;
      const minInterval = 1 / MP_SNAPSHOT_HZ;
      if (this.broadcastAcc >= minInterval) {
        this.broadcastAcc = 0;
        this.pendingBroadcast = false;
        this.broadcastSnapshots(false);
      }
    }
  }

  /**
   * Build shared snapshot ONCE, then send full or diff + per-client playerView.
   * @param force immediate (commands / join); still builds once.
   */
  broadcastSnapshots(force = false): void {
    if (!this.world) return;
    if (!force && this.connectedCount === 0) return;

    const prevNation = this.world.playerNation;
    this.world.playerNation = this.clients.values().next().value?.nationId ?? 0;
    const full = snapshot(this.world, this.data);
    this.snapshotBuildCount += 1;
    this.world.playerNation = prevNation;
    const shared = extractShared(full);

    this.sharedSeq += 1;
    const seq = this.sharedSeq;
    const isFirst = this.lastSent === null;

    // Soft province metrics every ~1s (or on force); critical fields every broadcast.
    this.softProvinceAcc += force ? 1 : (1 / MP_SNAPSHOT_HZ);
    const includeSoft = force || isFirst || this.softProvinceAcc >= 1;
    if (includeSoft) this.softProvinceAcc = 0;

    this.lastShared = shared;
    const diff = isFirst ? null : diffShared(this.lastSent!, shared, { includeSoftProvinces: includeSoft });

    for (const client of this.clients.values()) {
      if (!client.connected || client.nationId == null) continue;
      if (isFirst || client.lastSharedSeq === 0) {
        this.emitSharedFull(client, seq, shared);
      } else {
        this.emitSharedDiff(client, seq, client.lastSharedSeq, diff!);
      }
      this.emitPlayerView(client, seq);
      client.lastSharedSeq = seq;
    }

    if (isFirst) {
      this.lastSent = shared;
    } else if (diff) {
      this.lastSent = applySharedDiff(this.lastSent!, diff);
    }

    this.bandwidth.broadcasts += 1;
  }

  sendFullTo(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !this.world || client.nationId == null) return;

    if (!this.lastShared || !this.lastSent) {
      const prevNation = this.world.playerNation;
      this.world.playerNation = client.nationId;
      const full = snapshot(this.world, this.data);
      this.snapshotBuildCount += 1;
      this.world.playerNation = prevNation;
      this.lastShared = extractShared(full);
      this.lastSent = this.lastShared;
      this.sharedSeq = Math.max(1, this.sharedSeq);
    }

    const seq = this.sharedSeq || 1;
    if (this.sharedSeq === 0) this.sharedSeq = 1;
    this.emitSharedFull(client, seq, this.lastShared);
    this.emitPlayerView(client, seq);
    client.lastSharedSeq = seq;
  }

  private emitSharedFull(client: SessionClient, seq: number, shared: SharedSnapshot): void {
    const msg = { t: 'snapshotFull' as const, seq, shared };
    this.bandwidth.sharedFullBytes += estimateJsonBytes(msg);
    client.send(msg);
  }

  private emitSharedDiff(
    client: SessionClient,
    seq: number,
    baseSeq: number,
    diff: ReturnType<typeof diffShared>,
  ): void {
    const msg = { t: 'snapshotDiff' as const, seq, baseSeq, diff };
    this.bandwidth.sharedDiffBytes += estimateJsonBytes(msg);
    client.send(msg);
  }

  private emitPlayerView(client: SessionClient, seq: number): void {
    if (!this.world || client.nationId == null) return;
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    const full = snapshot(this.world, this.data);
    this.snapshotBuildCount += 1;
    this.world.playerNation = prev;
    const view = extractPlayerView(full);
    const msg = { t: 'playerView' as const, seq, view };
    this.bandwidth.playerViewBytes += estimateJsonBytes(msg);
    client.send(msg);
  }

  /** Record actual wire bytes (after gzip framing) — called from the WS send path. */
  recordWireBytes(n: number): void {
    this.bandwidth.wireBytes += n;
  }

  /** Reset bandwidth counters and return previous window stats. */
  takeBandwidthStats(): BandwidthStats & { elapsedMs: number; bytesPerSec: number; wireBytesPerSec: number } {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - this.bandwidth.lastResetMs);
    const total =
      this.bandwidth.sharedFullBytes
      + this.bandwidth.sharedDiffBytes
      + this.bandwidth.playerViewBytes;
    const result = {
      ...this.bandwidth,
      elapsedMs,
      bytesPerSec: (total / elapsedMs) * 1000,
      wireBytesPerSec: (this.bandwidth.wireBytes / elapsedMs) * 1000,
    };
    this.bandwidth = {
      sharedFullBytes: 0,
      sharedDiffBytes: 0,
      playerViewBytes: 0,
      wireBytes: 0,
      broadcasts: 0,
      lastResetMs: now,
    };
    return result;
  }

  /**
   * Test helper: reconstruct the WorldSnapshot a client would see after the
   * latest wire messages (shared + playerView).
   */
  reconstructFor(clientId: string): ReturnType<typeof mergeSnapshot> | null {
    const client = this.clients.get(clientId);
    if (!client || !this.lastShared || client.nationId == null || !this.world) return null;
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    const full = snapshot(this.world, this.data);
    this.world.playerNation = prev;
    return mergeSnapshot(this.lastShared, extractPlayerView(full));
  }

  /** Apply a shared diff onto lastShared (test helper). */
  applyDiffForTest(diff: ReturnType<typeof diffShared>): SharedSnapshot | null {
    if (!this.lastShared) return null;
    return applySharedDiff(this.lastShared, diff);
  }

  toListEntry(): SessionListEntry {
    return {
      id: this.id,
      name: this.name,
      seed: this.seed,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      playerCount: this.connectedCount,
      phase: this.phase,
    };
  }

  private broadcastOrUnicast(origin: SessionClient, msg: FromWorker): void {
    if (msg.t === 'log') {
      origin.send(msg);
      return;
    }
    for (const client of this.clients.values()) {
      if (client.connected) client.send(msg);
    }
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();

  createLobby(opts: {
    name: string;
    seed: number;
    mode: SessionMode;
    maxPlayers: number;
    id?: string;
  }): GameSession {
    const id = opts.id ?? randomId();
    const session = new GameSession({
      id,
      seed: Number.isFinite(opts.seed) ? Math.max(1, Math.floor(opts.seed)) : 1836,
      name: opts.name.trim().slice(0, 48) || `Session ${id}`,
      mode: opts.mode === 'coop' ? 'coop' : 'competitive',
      maxPlayers: opts.maxPlayers,
      phase: 'lobby',
    });
    this.sessions.set(id, session);
    return session;
  }

  /** M1: get or create a running session (permalink shortcut). */
  getOrCreate(sessionId: string, seed: number): GameSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new GameSession({
        id: sessionId,
        seed,
        phase: 'running',
        mode: 'competitive',
      });
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  get(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  listOpenLobbies(): SessionListEntry[] {
    return [...this.sessions.values()]
      .filter((s) => s.phase === 'lobby')
      .map((s) => s.toListEntry());
  }

  /** Soft-disconnect a client; GC only when empty and no held seats. */
  leave(sessionId: string, clientId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.leave(clientId);
    this.maybeGc(sessionId);
  }

  /** Explicit leave (lobby exit) — no reconnect grace. */
  hardLeave(sessionId: string, clientId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.hardLeave(clientId);
    this.maybeGc(sessionId);
  }

  private maybeGc(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.purgeExpiredHolds();
    if (session.clientCount === 0 && session.heldSeats.size === 0) {
      this.sessions.delete(sessionId);
    }
  }

  /** Tick every live session. */
  tickAll(dtSeconds: number): void {
    for (const [id, session] of this.sessions) {
      session.tick(dtSeconds);
      session.purgeExpiredHolds();
      if (session.clientCount === 0 && session.heldSeats.size === 0) {
        this.sessions.delete(id);
      }
    }
  }

  get size(): number {
    return this.sessions.size;
  }

  collectStats(): unknown[] {
    const out: unknown[] = [];
    for (const session of this.sessions.values()) {
      const snap = session.takeBandwidthStats();
      out.push({
        id: session.id,
        phase: session.phase,
        clients: session.connectedCount,
        held: session.heldSeats.size,
        ...snap,
      });
    }
    return out;
  }

  /** Peek bandwidth without reset (for tests). */
  peekBandwidth(sessionId: string) {
    return this.sessions.get(sessionId)?.bandwidth ?? null;
  }
}
