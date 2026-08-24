import { describe, expect, it } from 'vitest';
import { yearFromDay, dayToLabel } from '../src/ui/gameDate';

describe('gameDate UI helpers', () => {
  it('uses the 1820 epoch (day 0 = year 1820)', () => {
    expect(yearFromDay(0)).toBe(1820);
    expect(yearFromDay(364)).toBe(1820);
    expect(yearFromDay(365)).toBe(1821);
  });

  it('matches the canonical sim epoch', () => {
    // The sim's EPOCH_YEAR in src/sim/world.ts is 1820.
    // These helpers must agree.
    expect(yearFromDay(0)).toBe(1820);
    expect(yearFromDay(365 * 100)).toBe(1920);
  });

  it('formats day labels with year and day-of-year', () => {
    expect(dayToLabel(0)).toBe('1820 (day 1)');
    expect(dayToLabel(364)).toBe('1820 (day 365)');
    expect(dayToLabel(365)).toBe('1821 (day 1)');
  });

  it('does not use the old 1836 epoch', () => {
    // Regression: the old SaveLoadPanel used 1836 as the epoch.
    // Day 0 must NOT be 1836.
    expect(yearFromDay(0)).not.toBe(1836);
  });
});
