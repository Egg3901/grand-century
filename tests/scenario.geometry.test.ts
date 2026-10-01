import { describe, expect, it } from 'vitest';
import {
  filterGeometryComponents,
  simplifyGeometry,
  validateGeometryComponentFilters,
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
  it('keeps only reviewed Cliopatria components inside the declared bounds', () => {
    const square = (x: number, y: number) => [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]];
    const filtered = filterGeometryComponents(
      { type: 'MultiPolygon', coordinates: [square(20, 37), square(24, 35), square(7, 49)] },
      [19, 36, 26, 41],
    );
    expect(filtered).toMatchObject({ keptComponents: 1, droppedComponents: 2 });
    expect(filtered.geometry).toEqual({ type: 'Polygon', coordinates: square(20, 37) });
  });

  it('requires component filters to target a reviewed Cliopatria source of an exclusive polity', () => {
    const roster = {
      polities: [{ key: 'GRE', status: 'sovereign', sources: [{ kind: 'cliopatria_record', id: 130 }] }],
    };
    const filters = {
      schemaVersion: 1,
      asOf: '1830-01-01',
      filters: [{
        polityKey: 'GRE', sourceRecord: 130, action: 'keep_components_within', bounds: [19, 36, 26, 41],
        reason: 'Drop components outside the Hellenic State.',
      }],
    };
    expect(() => validateGeometryComponentFilters({ asOf: '1830-01-01', roster, filters })).not.toThrow();
    expect(() => validateGeometryComponentFilters({
      asOf: '1830-01-01',
      roster,
      filters: { ...filters, filters: [{ ...filters.filters[0], sourceRecord: 131 }] },
    })).toThrow(/does not match a Cliopatria source/i);
    expect(() => validateGeometryComponentFilters({
      asOf: '1830-01-01',
      roster,
      filters: { ...filters, filters: [{ ...filters.filters[0], bounds: [26, 36, 19, 41] }] },
    })).toThrow(/bounds/i);
  });
});
