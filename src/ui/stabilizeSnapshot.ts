/**
 * Structural sharing for world snapshots arriving from the sim worker.
 * Reuses previous top-level field identities when content is deeply equal so
 * zustand selectors on individual slices do not re-render on unchanged ticks.
 */

import type { WorldSnapshot } from '../shared/types';

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = Object.keys(aObj);
  if (keys.length !== Object.keys(bObj).length) return false;
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Return a snapshot whose top-level fields share identity with `prev` whenever
 * the content is unchanged. If every field matches, returns `prev` itself.
 */
export function stabilizeSnapshot(
  prev: WorldSnapshot | null,
  next: WorldSnapshot,
): WorldSnapshot {
  if (!prev) return next;

  let changed = false;
  const out = { ...next } as WorldSnapshot;
  for (const key of Object.keys(next) as (keyof WorldSnapshot)[]) {
    const prevVal = prev[key];
    const nextVal = next[key];
    if (Object.is(prevVal, nextVal) || deepEqual(prevVal, nextVal)) {
      (out as unknown as Record<string, unknown>)[key as string] = prevVal;
    } else {
      changed = true;
    }
  }
  return changed ? out : prev;
}
