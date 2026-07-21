/**
 * Thin multiplayer session envelope (MP-M1).
 *
 * Does NOT change ToWorker / FromWorker shapes in src/shared/types.ts.
 * Join is the only extra client→server message; the rest of the wire
 * protocol reuses the existing worker messages.
 */

import type { FromWorker, ToWorker } from '../shared/types';

/** Client → server: claim a seat in a session (creates the session if missing). */
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

export type ClientToServer = SessionJoinMessage | ToWorker;
export type ServerToClient = SessionJoinedMessage | FromWorker;

export function isSessionJoinMessage(msg: unknown): msg is SessionJoinMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.t === 'join' && typeof m.sessionId === 'string' && typeof m.nation === 'string';
}

export function isSessionJoinedMessage(msg: unknown): msg is SessionJoinedMessage {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as { t?: string }).t === 'joined';
}

export function isToWorkerMessage(msg: unknown): msg is ToWorker {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: string }).t;
  return t === 'init' || t === 'command' || t === 'requestProvince' || t === 'requestNation';
}
