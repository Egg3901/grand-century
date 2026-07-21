/**
 * Multiplayer session: one authoritative sim instance + connected clients.
 * Pure of WebSocket — callers inject send fns so unit tests need no network.
 */

import type { Command, FromWorker, GameData, NationId, ToWorker, World } from '../src/shared/types';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { detailNation, detailProvince } from '../src/sim/detail';
import { advanceDay, snapshot } from '../src/sim/world';
import { GAME_DATA } from '../src/data/gameData';

export type ClientSender = (msg: FromWorker) => void;

export interface SessionClient {
  id: string;
  nationId: NationId;
  nationTag: string;
  send: ClientSender;
}

export interface JoinResult {
  ok: boolean;
  leader: boolean;
  nationId: NationId;
  nationTag: string;
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

export class GameSession {
  readonly id: string;
  readonly seed: number;
  readonly data: GameData;
  world: World;
  readonly clients = new Map<string, SessionClient>();
  leaderId: string | null = null;
  private acc = 0;
  /** TODO(MP-M4): snapshot diffs instead of full broadcasts. */
  private readonly fullSnapshots = true;

  constructor(id: string, seed: number, data: GameData = GAME_DATA) {
    this.id = id;
    this.seed = seed;
    this.data = data;
    this.world = createWorld(data, seed);
    // Pause until the lobby leader unpauses (M1: first joiner).
    this.world.speed = 0;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  resolveNation(nation: string): { id: NationId; tag: string } | null {
    const trimmed = nation.trim();
    if (!trimmed) return null;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && Number.isInteger(asNum) && this.world.nations[asNum]) {
      const n = this.world.nations[asNum];
      return { id: n.id, tag: n.tag };
    }
    const tag = trimmed.toUpperCase();
    const found = this.world.nations.find((n) => n.tag === tag);
    if (!found) return null;
    return { id: found.id, tag: found.tag };
  }

  join(clientId: string, nation: string, send: ClientSender): JoinResult {
    const resolved = this.resolveNation(nation);
    if (!resolved) {
      return { ok: false, leader: false, nationId: -1, nationTag: '', error: `unknown nation: ${nation}` };
    }

    // One human seat per nation for M1 competitive.
    for (const existing of this.clients.values()) {
      if (existing.nationId === resolved.id && existing.id !== clientId) {
        return {
          ok: false,
          leader: false,
          nationId: resolved.id,
          nationTag: resolved.tag,
          error: `nation ${resolved.tag} already taken`,
        };
      }
    }

    const isLeader = this.leaderId === null;
    if (isLeader) this.leaderId = clientId;

    const nationEntity = this.world.nations[resolved.id];
    if (nationEntity) nationEntity.isPlayer = true;

    this.clients.set(clientId, {
      id: clientId,
      nationId: resolved.id,
      nationTag: resolved.tag,
      send,
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

    // If no other human holds this nation, return it to AI.
    const stillHeld = [...this.clients.values()].some((c) => c.nationId === client.nationId);
    if (!stillHeld) {
      const nation = this.world.nations[client.nationId];
      if (nation) nation.isPlayer = false;
    }

    if (this.leaderId === clientId) {
      const next = this.clients.values().next().value as SessionClient | undefined;
      this.leaderId = next?.id ?? null;
    }
  }

  handleMessage(clientId: string, msg: ToWorker): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.t) {
      case 'init':
        // Server owns init; ignore client init (join already sent ready/snapshot).
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

    // Force command authority onto the client's assigned nation.
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    applyCommand(this.world, this.data, cmd, (m) => this.broadcastOrUnicast(client, m));
    this.world.playerNation = prev;
    this.broadcastSnapshots();
  }

  /** Advance sim by dt real seconds (server-authoritative clock). */
  tick(dtSeconds: number): void {
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
    if (!client) return;
    const prev = this.world.playerNation;
    this.world.playerNation = client.nationId;
    client.send({ t: 'snapshot', snapshot: snapshot(this.world, this.data) });
    this.world.playerNation = prev;
  }

  private broadcastOrUnicast(origin: SessionClient, msg: FromWorker): void {
    if (msg.t === 'log') {
      // Logs from command application go to the acting client.
      origin.send(msg);
      return;
    }
    // Unexpected FromWorker from applyCommand (rare); broadcast.
    for (const client of this.clients.values()) {
      client.send(msg);
    }
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();

  getOrCreate(sessionId: string, seed: number): GameSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new GameSession(sessionId, seed);
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  get(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
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
