import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  auditHistoricalBasemap,
  pointInGeometry,
  pointInRing,
} from '../scripts/lib/historical-basemap-audit.mjs';

describe('historical basemap audit', () => {
  it('handles polygon holes and multipolygons', () => {
    const outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const hole = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]];
    expect(pointInRing([3, 3], outer)).toBe(true);
    expect(pointInGeometry([1.5, 1.5], { type: 'Polygon', coordinates: [outer, hole] })).toBe(false);
    expect(pointInGeometry([3, 3], { type: 'MultiPolygon', coordinates: [[outer, hole]] })).toBe(true);
  });

  it('prefers dated province overrides and emits no reference geometry', () => {
    const world = {
      nations: [{ tag: 'OLD' }, { tag: 'NEW' }],
      provinces: [{ id: 0, name: 'Borderland', ownerTag: 'OLD', lon: 1, lat: 1 }],
    };
    const reference = {
      features: [{
        properties: { NAME: 'Old Realm', SUBJECTO: 'Old Realm', PARTOF: null, BORDERPRECISION: 2 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
      }],
    };
    const config = {
      asOf: '1820-01-01',
      references: [{ id: 'fixture' }],
      entityTags: { 'Old Realm': 'OLD' },
      provinceOverrides: [{
        provinceId: 0,
        provinceName: 'Borderland',
        expectedOwnerTag: 'NEW',
        confidence: 'high',
        source: 'fixture',
        reason: 'Changed after the reference snapshot.',
      }],
    };
    const report = auditHistoricalBasemap({ world, reference, config });
    expect(report.summary.mismatch).toBe(1);
    expect(report.provinces[0]).toMatchObject({
      currentOwnerTag: 'OLD',
      expectedOwnerTags: ['NEW'],
      status: 'mismatch',
    });
    expect(JSON.stringify(report)).not.toContain('coordinates');
  });

  it('keeps every override pinned to the current province identity', () => {
    const config = JSON.parse(readFileSync(
      new URL('../content/history/1820/reference-basemaps.json', import.meta.url),
      'utf8',
    )) as { provinceOverrides: Array<{ provinceId: number; provinceName: string }> };
    const world = JSON.parse(readFileSync(
      new URL('../src/data/generated/worldSeed.json', import.meta.url),
      'utf8',
    )) as { provinces: Array<{ id: number; name: string }> };
    for (const override of config.provinceOverrides) {
      expect(world.provinces[override.provinceId]?.name).toBe(override.provinceName);
    }
  });
});
