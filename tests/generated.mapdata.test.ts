import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';

describe('generated world seed data', () => {
  it('stays in the perf-safe province range', () => {
    expect(WORLD_SEED.provinces.length).toBeGreaterThanOrEqual(800);
    expect(WORLD_SEED.provinces.length).toBeLessThanOrEqual(1500);
  });

  it('ensures every province has at least one neighbor', () => {
    const validIds = new Set(WORLD_SEED.provinces.map((province) => province.id));
    for (const province of WORLD_SEED.provinces) {
      expect(province.neighbors.length).toBeGreaterThanOrEqual(1);
      for (const neighbor of province.neighbors) {
        expect(validIds.has(neighbor)).toBe(true);
      }
    }
  });
});
