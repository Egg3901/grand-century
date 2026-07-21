/**
 * Client-side reconstruction of WorldSnapshot from shared full/diff + playerView.
 */

import type { FromWorker, WorldSnapshot } from '../shared/types';
import {
  applySharedDiff,
  mergeSnapshot,
  type PlayerView,
  type SharedSnapshot,
} from './snapshotCodec';
import {
  isPlayerViewMessage,
  isSnapshotDiffMessage,
  isSnapshotFullMessage,
  type ServerToClient,
} from './sessionProtocol';

export interface SnapshotApplierState {
  shared: SharedSnapshot | null;
  view: PlayerView | null;
  seq: number;
}

export function createApplierState(): SnapshotApplierState {
  return { shared: null, view: null, seq: 0 };
}

/**
 * Feed a server message. Returns a reconstructed FromWorker snapshot when
 * both shared + playerView are available for the same (or latest) seq.
 */
export function applyServerSnapshotMessage(
  state: SnapshotApplierState,
  msg: ServerToClient,
): FromWorker | null {
  if (isSnapshotFullMessage(msg)) {
    state.shared = msg.shared;
    state.seq = msg.seq;
    return emitIfReady(state);
  }
  if (isSnapshotDiffMessage(msg)) {
    if (!state.shared) return null;
    // If baseSeq mismatches, wait for a full resync.
    if (msg.baseSeq !== state.seq && msg.baseSeq !== 0) {
      return null;
    }
    state.shared = applySharedDiff(state.shared, msg.diff);
    state.seq = msg.seq;
    return emitIfReady(state);
  }
  if (isPlayerViewMessage(msg)) {
    state.view = msg.view;
    // Prefer emitting against current shared even if seq slightly ahead
    return emitIfReady(state);
  }
  return null;
}

function emitIfReady(state: SnapshotApplierState): FromWorker | null {
  if (!state.shared || !state.view) return null;
  const snapshot: WorldSnapshot = mergeSnapshot(state.shared, state.view);
  return { t: 'snapshot', snapshot };
}
