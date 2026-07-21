/**
 * Multiplayer session + lobby envelope (MP-M1 / MP-M2).
 *
 * Does NOT change ToWorker / FromWorker shapes in src/shared/types.ts.
 * Lobby messages live here; the sim wire protocol reuses worker messages.
 */

import type { FromWorker, ToWorker } from '../shared/types';

export type SessionMode = 'competitive' | 'coop';
export type SessionPhase = 'lobby' | 'running';

/** Catalog entry for lobby nation pickers (from seed data, not a live world). */
export interface LobbyNationInfo {
  tag: string;
  name: string;
}

export interface LobbyPlayerInfo {
  clientId: string;
  name: string;
  nationTag: string | null;
  team: number | null;
  ready: boolean;
  leader: boolean;
}

export interface LobbyStateMessage {
  t: 'lobbyState';
  sessionId: string;
  name: string;
  seed: number;
  mode: SessionMode;
  maxPlayers: number;
  phase: SessionPhase;
  leaderId: string;
  players: LobbyPlayerInfo[];
  /** Nation tags already claimed (competitive lock / coop cross-team lock). */
  takenNations: string[];
  /** Nations available to pick. */
  nations: LobbyNationInfo[];
  you: string;
}

export interface SessionListEntry {
  id: string;
  name: string;
  seed: number;
  mode: SessionMode;
  maxPlayers: number;
  playerCount: number;
  phase: SessionPhase;
}

export interface SessionListMessage {
  t: 'sessionList';
  sessions: SessionListEntry[];
}

export interface SessionCreatedMessage {
  t: 'sessionCreated';
  sessionId: string;
}

/** Client → server: claim a seat in a running session (M1 permalink / post-start). */
export interface SessionJoinMessage {
  t: 'join';
  sessionId: string;
  /** Nation tag (e.g. 'ENG') or numeric nation id as string. */
  nation: string;
  /** Seed used when creating a new session (ignored if the session already exists). */
  seed?: number;
}

/** Server → client: seat confirmed (before ready/snapshot). */
export interface SessionJoinedMessage {
  t: 'joined';
  sessionId: string;
  nationId: number;
  nationTag: string;
  leader: boolean;
}

export interface CreateSessionMessage {
  t: 'createSession';
  name: string;
  seed: number;
  mode: SessionMode;
  maxPlayers: number;
  playerName?: string;
}

export interface ListSessionsMessage {
  t: 'listSessions';
}

export interface JoinLobbyMessage {
  t: 'joinLobby';
  sessionId: string;
  playerName?: string;
}

export interface SelectNationMessage {
  t: 'selectNation';
  nation: string;
}

export interface SelectTeamMessage {
  t: 'selectTeam';
  team: number;
}

export interface SetReadyMessage {
  t: 'setReady';
  ready: boolean;
}

export interface LeaderStartMessage {
  t: 'leaderStart';
}

export interface LeaveSessionMessage {
  t: 'leaveSession';
}

export type LobbyClientMessage =
  | CreateSessionMessage
  | ListSessionsMessage
  | JoinLobbyMessage
  | SelectNationMessage
  | SelectTeamMessage
  | SetReadyMessage
  | LeaderStartMessage
  | LeaveSessionMessage;

export type ClientToServer = SessionJoinMessage | LobbyClientMessage | ToWorker;
export type ServerToClient =
  | SessionJoinedMessage
  | LobbyStateMessage
  | SessionListMessage
  | SessionCreatedMessage
  | FromWorker;

export function isSessionJoinMessage(msg: unknown): msg is SessionJoinMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.t === 'join' && typeof m.sessionId === 'string' && typeof m.nation === 'string';
}

export function isSessionJoinedMessage(msg: unknown): msg is SessionJoinedMessage {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as { t?: string }).t === 'joined';
}

export function isLobbyStateMessage(msg: unknown): msg is LobbyStateMessage {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as { t?: string }).t === 'lobbyState';
}

export function isSessionListMessage(msg: unknown): msg is SessionListMessage {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as { t?: string }).t === 'sessionList';
}

export function isSessionCreatedMessage(msg: unknown): msg is SessionCreatedMessage {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as { t?: string }).t === 'sessionCreated';
}

export function isToWorkerMessage(msg: unknown): msg is ToWorker {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: string }).t;
  return t === 'init' || t === 'command' || t === 'requestProvince' || t === 'requestNation';
}

export function isLobbyClientMessage(msg: unknown): msg is LobbyClientMessage {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: string }).t;
  return (
    t === 'createSession'
    || t === 'listSessions'
    || t === 'joinLobby'
    || t === 'selectNation'
    || t === 'selectTeam'
    || t === 'setReady'
    || t === 'leaderStart'
    || t === 'leaveSession'
  );
}

/** True if a ServerToClient message is part of the sim protocol (not lobby). */
export function isFromWorkerMessage(msg: unknown): msg is FromWorker {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: string }).t;
  return (
    t === 'ready'
    || t === 'snapshot'
    || t === 'provinceDetail'
    || t === 'nationDetail'
    || t === 'saveSlots'
    || t === 'saveStatus'
    || t === 'log'
  );
}
