/**
 * UI-safe date helpers. Mirrors the epoch constant in src/sim/world.ts
 * without pulling the full sim dependency graph into UI chunks.
 *
 * The game epoch is 1820-01-01 (day 0).
 */

const EPOCH_YEAR = 1820;

/** Return the calendar year for a given game day. */
export function yearFromDay(day: number): number {
  return EPOCH_YEAR + Math.floor(day / 365);
}

/** Return a human-readable date string for a given game day. */
export function dayToLabel(day: number): string {
  const year = yearFromDay(day);
  const dayOfYear = day % 365;
  return `${year} (day ${dayOfYear + 1})`;
}
