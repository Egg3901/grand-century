import { describe, expect, it } from 'vitest';
import {
  simplifyGeometry,
  validateGeometryResolutions,
  validateGeometrySupplements,
} from '../content/sources/geometry/compiler.mjs';

describe('scenario border compiler', () => {
  it('quantizes shared-grid rings while preserving closure and small polygons', () => {
    const simplified = simplifyGeometry({
      type: 'MultiPolygon',
      coordinates: [
        [[
          [0, 0], [0.004, 0], [1, 0], [1, 1], [0, 1], [0, 0],
        ]],
        [[
          [2, 2], [2.002, 2], [2.002, 2.002], [2, 2.002], [2, 2],
        ]],
      ],
    }, 0.01);
    expect(simplified.coordinates[0][0].length).toBeLessThan(6);
    for (const polygon of simplified.coordinates) {
      expect(polygon[0][0]).toEqual(polygon[0].at(-1));
      expect(polygon[0].length).toBeGreaterThanOrEqual(4);
    }
  });

  it('requires explicit evidence and a passing audit for temporal geometry fallbacks', () => {
    const roster = {
      polities: [{ key: 'ZONE', status: 'vassal', sources: [] }],
    };
    const supplements = {
      schemaVersion: 1,
      asOf: '1945-09-02',
      supplements: [{
        polityKey: 'ZONE', relationId: 9, sourceAsOf: '1949-10-07', expectedName: 'Zone',
        reason: 'Immediate territorial successor.', evidence: ['https://example.test/protocol'],
      }],
    };
    expect(() => validateGeometrySupplements({
      asOf: '1945-09-02',
      roster,
      supplements,
      audit: {
        schemaVersion: 1, asOf: '1945-09-02', entries: [{ relationId: 9, sourceAsOf: '1949-10-07', status: 'valid' }],
      },
    })).not.toThrow();
    expect(() => validateGeometrySupplements({
      asOf: '1945-09-02', roster, supplements,
      audit: { schemaVersion: 1, asOf: '1945-09-02', entries: [] },
    })).toThrow(/no geometry audit/i);
  });

  it('skips a broken duplicate only when the same reviewed identity has valid geometry', () => {
    const input = {
      asOf: '1815-06-18',
      audit: { entries: [{ relationId: 1, status: 'invalid_geometry' }, { relationId: 2, status: 'valid' }] },
      resolutions: {
        schemaVersion: 1,
        asOf: '1815-06-18',
        resolutions: [{ relationId: 1, action: 'skip_duplicate_source', reason: 'Chronology duplicate.' }],
      },
      review: { entries: [{ relationIds: [1, 2], disposition: 'polity' }] },
      cliopatriaDiscovery: { candidates: [] },
    };
    expect(() => validateGeometryResolutions(input)).not.toThrow();
    expect(() => validateGeometryResolutions({
      ...input,
      audit: { entries: [{ relationId: 1, status: 'invalid_geometry' }] },
      review: { entries: [{ relationIds: [1], disposition: 'polity' }] },
    })).toThrow(/no valid same-identity source/i);
  });
});
