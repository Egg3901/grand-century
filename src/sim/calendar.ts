import type { GameDate, GameDay } from '../shared/types';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Compatibility epoch for old saves and callers that have not selected a Scenario. */
export const DEFAULT_START_DATE: Readonly<GameDate> = Object.freeze({ year: 1830, month: 1, day: 1 });

function dayOfYear(date: GameDate): number {
  let result = Math.max(0, date.day - 1);
  for (let month = 1; month < date.month; month += 1) result += DAYS_IN_MONTH[month - 1] ?? 0;
  return result;
}

/** Deterministic no-leap-year calendar used by every runtime system. */
export function dateAtDay(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): GameDate {
  const elapsed = Math.floor(day);
  const absoluteDay = dayOfYear(startDate) + elapsed;
  const yearOffset = Math.floor(absoluteDay / 365);
  let remaining = absoluteDay - yearOffset * 365;
  let month = 0;
  while (month < DAYS_IN_MONTH.length - 1 && remaining >= DAYS_IN_MONTH[month]) {
    remaining -= DAYS_IN_MONTH[month];
    month += 1;
  }
  return { year: startDate.year + yearOffset, month: month + 1, day: remaining + 1 };
}

export function yearAtDay(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): number {
  return dateAtDay(day, startDate).year;
}

export function monthIndexAtDay(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): number {
  const date = dateAtDay(day, startDate);
  return (date.year - startDate.year) * 12 + date.month - startDate.month;
}

export function firstOfMonth(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): boolean {
  return dateAtDay(day, startDate).day === 1;
}
