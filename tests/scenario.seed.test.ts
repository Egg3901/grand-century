import { describe, expect, it } from 'vitest';
import { compileScenarioSeed } from '../content/sources/seed/compiler.mjs';

function square(minX: number, minY: number, maxX: number, maxY: number) {
  return [[
    [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY],
  ]];
}

function border(polityKey: string, coordinates: number[][][]) {
  return {
    type: 'Feature',
    properties: { polityKey, displayName: polityKey },
    geometry: { type: 'Polygon', coordinates },
  };
}

describe('scenario seed compiler', () => {
  it('projects centroids, records ambiguity, splits states, and preserves gaps', () => {
    const baseProvince = {
      ownerTag: 'OLD', stateId: 0, stateName: 'Old State', terrain: 'plains', coastal: false,
      rgoGood: 'grain', neighbors: [], populationWeight: 1,
    };
    const result = compileScenarioSeed({
      baseSeed: {
        provinces: [
          { ...baseProvince, id: 0, name: 'Overlap', lon: 0.5, lat: 0.5 },
          { ...baseProvince, id: 1, name: 'Large Only', lon: 1.5, lat: 1.5 },
          { ...baseProvince, id: 2, name: 'Near Gap', lon: 3.8, lat: 4.5 },
          { ...baseProvince, id: 3, name: 'Reviewed Projection', lon: 10, lat: 10 },
          { ...baseProvince, id: 4, name: 'Uncovered', lon: 20, lat: 20 },
        ],
        nations: [{ tag: 'OLD', primaryCulture: 'example', religion: 'example' }],
      },
      roster: {
        asOf: '1700-01-01',
        polities: [
          { key: 'A', displayName: 'A', status: 'sovereign' },
          { key: 'B', displayName: 'B', status: 'sovereign' },
          { key: 'C', displayName: 'C', status: 'vassal' },
        ],
      },
      relationships: { relationships: [{ from: 'A', to: 'C' }] },
      compiledBorders: {
        asOf: '1700-01-01',
        featureCollection: {
          features: [border('A', square(0, 0, 2, 2)), border('B', square(0.25, 0.25, 0.75, 0.75)), border('C', square(4, 4, 5, 5))],
        },
      },
      manifest: { id: '1700-01-01', startDate: { year: 1700, month: 1, day: 1 } },
      provinceOverrides: {
        asOf: '1700-01-01', reviewedBy: 'test', reviewedAt: '2026-09-02',
        overrides: [{ provinceId: 3, polityKey: 'A', basis: 'test_projection', notes: 'Reviewed test assignment.' }],
      },
    });

    expect(result.worldSeed.provinces.map((province: { ownerTag: string }) => province.ownerTag))
      .toEqual(['B', 'A', 'C', 'A', 'UNC']);
    expect(result.diagnostics.overlaps).toEqual([{ provinceId: 0, candidates: ['B', 'A'], selected: 'B' }]);
    expect(result.diagnostics.nearestAssignments[0]).toMatchObject({ provinceId: 2, polityKey: 'C' });
    expect(result.diagnostics.explicitProvinceAssignments).toEqual([expect.objectContaining({
      provinceId: 3, polityKey: 'A', basis: 'test_projection',
    })]);
    expect(result.diagnostics.gapProvinceIds).toEqual([4]);
    expect(result.diagnostics.splitStates).toBe(1);
    expect(result.worldSeed.states).toHaveLength(4);
    expect(result.worldSeed.nations.find((nation: { tag: string }) => nation.tag === 'C')?.overlordTag).toBe('A');
    expect(result.nationalBorders.features.map((feature: { properties: { id: number } }) => feature.properties.id))
      .toEqual([0, 1, 2]);
  });
});
