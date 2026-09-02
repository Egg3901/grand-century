import { describe, expect, it } from 'vitest';
import { simplifyGeometry } from '../content/sources/geometry/compiler.mjs';

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
});
