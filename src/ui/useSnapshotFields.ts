/**
 * Narrow snapshot subscriptions for UI components.
 *
 * Prefer these over subscribing to the whole snapshot object — that selector
 * re-renders on every tick even when the fields a panel displays are unchanged.
 * After `stabilizeSnapshot`, selecting individual fields (or a shallow bag of
 * them) only re-renders when those field identities change.
 */

import { useShallow } from 'zustand/react/shallow';
import type { WorldSnapshot } from '../shared/types';
import { useStore } from '../store';

/** True once the first snapshot has arrived (loading veil / menu gates). */
export function useHasSnapshot(): boolean {
  return useStore((state) => state.snapshot !== null);
}

/**
 * Subscribe to a shallow bag of snapshot fields. Returns null before the first
 * snapshot. Field identities are stable across ticks when content is unchanged
 * (see stabilizeSnapshot).
 */
export function useSnapshotFields<K extends keyof WorldSnapshot>(
  keys: readonly K[],
): Pick<WorldSnapshot, K> | null {
  return useStore(
    useShallow((state) => {
      const snap = state.snapshot;
      if (!snap) return null;
      const out = {} as Pick<WorldSnapshot, K>;
      for (const key of keys) {
        out[key] = snap[key];
      }
      return out;
    }),
  );
}

/** Single-field subscription (primitives / stabilized references). */
export function useSnapshotField<K extends keyof WorldSnapshot>(
  key: K,
): WorldSnapshot[K] | undefined {
  return useStore((state) => state.snapshot?.[key]);
}
