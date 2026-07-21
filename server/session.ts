/**
 * Multiplayer session: lobby + authoritative sim.
 * Pure of WebSocket — callers inject send fns so unit tests need no network.
 *
 * Phase 'lobby': players join, pick nation/team, ready up; no sim ticks.
 * Phase 'running': createWorld once on leaderStart; tick + broadcast.
 */

import type { Command, FromWorker, GameData, NationId, ToWorker, World } from '../src/shared/types';
import type {
  LobbyNationInfo,
  LobbyPlayerInfo,
  LobbyStateMessage,
  ServerToClient,
  SessionListEntry,
  SessionMode,
  SessionPhase,
} from '../src/net/sessionProtocol';
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
  send: ClientSender;
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
  leaderId: string | null = null;
  private acc = 0;
  /** TODO(MP-M4): snapshot diffs instead of full broadcasts. */
  private readonly fullSnapshots = true;

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
      // Prefer live world id when available; else catalog index via tag after world exists.
      if (this.world) {
        const found = this.world.nations.find((n) => n.tag === tag);
        if (found) return { id: found.id, tag: found.tag };
      }
      // Pre-world: use placeholder id (-1) and resolve on start.
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
      // coop: blocked if claimed by a different team
      if (self?.team == null || c.team == null || self.team !== c.team) return true;
    }
    return false;
  }

  /**
   * Nations this client may act as.
   * competitive: own nation only.
   * coop: all nations claimed by the client's team.
   */
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
    // Competitive: unique nations
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
      c.send(this.buildLobbyState(c.id));
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
      if (playerName?.trim()) existing.name = playerName.trim().slice(0, 24);
    } else {
      this.clients.set(clientId, {
        id: clientId,
        name: (playerName?.trim() || `Player ${this.clients.size + 1}`).slice(0, 24),
        nationId: null,
        nationTag: null,
        team: this.mode === 'coop' ? 1 : null,
        ready: false,
        send,
      });
    }

    this.broadcastLobbyState();
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

    // If current nation is claimed by another team after switch, clear it.
    client.team = t;
    if (client.nationTag && this.isNationBlocked(client.nationTag, clientId)) {
      client.nationTag = null;
      client.nationId = null;
    }
    client.ready = false;
    this.broadcastLobbyState();
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
    // Resolve nation ids now that the world exists; mark human seats.
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

    for (const c of this.clients.values()) {
      c.send({
        t: 'joined',
        sessionId: this.id,
        nationId: c.nationId!,
        nationTag: c.nationTag!,
        leader: c.id === this.leaderId,
      });
      c.send({ t: 'ready', data: this.data });
      this.sendSnapshotTo(c.id);
    }
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
      // Auto-ready permalink joiners so a solo host can still leaderStart from UI;
      // for raw M1 two-client tests they expect immediate running — promote if
      // this session was created via getOrCreate(running).
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
      send,
    });

    send({
      t: 'joined',
      sessionId: this.id,
      nationId: resolved.id,
      nationTag: resolved.tag,
      leader: isLeader,
    });
    send({ t: 'ready', data: this.data });
    this.sendSnapshotTo(clientId);

    return {
      ok: true,
      leader: isLeader,
      nationId: resolved.id,
      nationTag: resolved.tag,
    };
  }

  leave(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.clients.delete(clientId);

    if (this.phase === 'running' && this.world && client.nationId != null) {
      const stillHeld = [...this.clients.values()].some((c) => c.nationId === client.nationId);
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
  }

  handleMessage(clientId: string, msg: ToWorker): void {
    if (this.phase !== 'running' || !this.world) return;
    const client = this.clients.get(clientId);
    if (!client || client.nationId == null) return;

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
        // Privacy: only serve full nation detail for controlled nations.
        // TODO(MP-M3+): filter hidden info in shared snapshots server-side.
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
      this.broadcastSnapshots();
      return;
    }

    // Force command authority onto the client's primary nation.
    // Coop teammates each act as their own seat; team nations are human (not AI).
    // Cross-seat team commands can be added later via limited setPlayerNation.
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    applyCommand(this.world, this.data, cmd, (m) => this.broadcastOrUnicast(client, m));
    this.world.playerNation = prev;
    this.broadcastSnapshots();
  }

  /** Advance sim by dt real seconds (server-authoritative clock). */
  tick(dtSeconds: number): void {
    if (this.phase !== 'running' || !this.world) return;
    if (this.clients.size === 0) return;
    let steps = 0;
    if (this.world.speed > 0) {
      this.acc += dtSeconds * (SPEED_DAYS_PER_SEC[this.world.speed] ?? 0);
      while (this.acc >= 1 && steps < 400) {
        advanceDay(this.world, this.data);
        this.acc -= 1;
        steps++;
      }
    }
    // Only push snapshots when the world day moved. Avoid WS JSON flood while
    // paused (clients otherwise fall behind on the backlog). Commands already
    // call broadcastSnapshots(). TODO(MP-M4): diffs + rate cap while running.
    if (steps > 0) {
      this.broadcastSnapshots();
    }
  }

  broadcastSnapshots(): void {
    void this.fullSnapshots; // MP-M4: replace with diffs
    for (const clientId of this.clients.keys()) {
      this.sendSnapshotTo(clientId);
    }
  }

  sendSnapshotTo(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !this.world || client.nationId == null) return;
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    client.send({ t: 'snapshot', snapshot: snapshot(this.world, this.data) });
    this.world.playerNation = prev;
  }

  toListEntry(): SessionListEntry {
    return {
      id: this.id,
      name: this.name,
      seed: this.seed,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      playerCount: this.clients.size,
      phase: this.phase,
    };
  }

  private broadcastOrUnicast(origin: SessionClient, msg: FromWorker): void {
    if (msg.t === 'log') {
      origin.send(msg);
      return;
    }
    for (const client of this.clients.values()) {
      client.send(msg);
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

  /** Remove a client; GC the session when empty. */
  leave(sessionId: string, clientId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.leave(clientId);
    if (session.clientCount === 0) {
      this.sessions.delete(sessionId);
    }
  }

  /** Tick every live session. */
  tickAll(dtSeconds: number): void {
    for (const session of this.sessions.values()) {
      session.tick(dtSeconds);
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
