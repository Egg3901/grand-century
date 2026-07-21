import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';

const provincesGeo = JSON.parse(
  readFileSync(new URL('../src/data/generated/provinces.geo.json', import.meta.url), 'utf8'),
) as {
  features: Array<{ id?: number; properties: { id: number }; geometry: GeoJSON.Geometry }>;
};

const nationalBorders = JSON.parse(
  readFileSync(new URL('../src/data/generated/nationalBorders.geo.json', import.meta.url), 'utf8'),
) as {
  features: Array<{ geometry: { type: string; coordinates: number[][][] } }>;
};

type Ring = number[][];

function polygonsOf(geometry: GeoJSON.Geometry | null | undefined): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Ring[][];
  return [];
}

function pointInRing(point: number[], ring: Ring): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-15) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: number[], geometry: GeoJSON.Geometry): boolean {
  for (const polygon of polygonsOf(geometry)) {
    if (!pointInRing(point, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(point, polygon[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function onBoundary(point: number[], geometry: GeoJSON.Geometry, eps = 2e-4): boolean {
  const eps2 = eps * eps;
  for (const polygon of polygonsOf(geometry)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = dx * dx + dy * dy;
        let t = len < 1e-18 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len;
        t = Math.max(0, Math.min(1, t));
        const qx = a[0] + t * dx;
        const qy = a[1] + t * dy;
        if ((point[0] - qx) ** 2 + (point[1] - qy) ** 2 <= eps2) return true;
      }
    }
  }
  return false;
}

function edgeKey(a: number[], b: number[], precision = 1e5): string {
  const ax = Math.round(a[0] * precision);
  const ay = Math.round(a[1] * precision);
  const bx = Math.round(b[0] * precision);
  const by = Math.round(b[1] * precision);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax}:${ay}|${bx}:${by}`;
  return `${bx}:${by}|${ax}:${ay}`;
}

function geometryEdgeKeys(geometry: GeoJSON.Geometry): Set<string> {
  const keys = new Set<string>();
  for (const polygon of polygonsOf(geometry)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        keys.add(edgeKey(ring[i], ring[i + 1]));
      }
    }
  }
  return keys;
}

function shareExactEdge(a: GeoJSON.Geometry, b: GeoJSON.Geometry): boolean {
  const keys = geometryEdgeKeys(a);
  for (const key of geometryEdgeKeys(b)) {
    if (keys.has(key)) return true;
  }
  return false;
}

/** Segments-intersect self-intersection check on outer rings. */
function ringSelfIntersects(ring: Ring): boolean {
  const closed = ring.length >= 2
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (closed.length < 4) return false;
  const orient = (p: number[], q: number[], r: number[]) => (
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  );
  const onSeg = (p: number[], q: number[], r: number[]) => (
    Math.min(p[0], r[0]) - 1e-12 <= q[0]
    && q[0] <= Math.max(p[0], r[0]) + 1e-12
    && Math.min(p[1], r[1]) - 1e-12 <= q[1]
    && q[1] <= Math.max(p[1], r[1]) + 1e-12
  );
  const intersects = (a: number[], b: number[], c: number[], d: number[]) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
    if (Math.abs(o1) <= 1e-12 && onSeg(a, c, b)) return true;
    if (Math.abs(o2) <= 1e-12 && onSeg(a, d, b)) return true;
    if (Math.abs(o3) <= 1e-12 && onSeg(c, a, d)) return true;
    if (Math.abs(o4) <= 1e-12 && onSeg(c, b, d)) return true;
    return false;
  };
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i];
    const b = closed[(i + 1) % closed.length];
    for (let j = i + 1; j < closed.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === closed.length - 1) continue;
      const c = closed[j];
      const d = closed[(j + 1) % closed.length];
      if (intersects(a, b, c, d)) return true;
    }
  }
  return false;
}

describe('generated world seed data', () => {
  it('stays in the perf-safe province range', () => {
    expect(WORLD_SEED.provinces.length).toBeGreaterThanOrEqual(300);
    expect(WORLD_SEED.provinces.length).toBeLessThanOrEqual(800);
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

  it('uses the 1820 epoch in generated metadata', () => {
    expect(WORLD_SEED.generatedAt.startsWith('1820')).toBe(true);
  });

  it('keeps coastal count in a plausible band (not nearly-all)', () => {
    const coastal = WORLD_SEED.provinces.filter((province) => province.coastal).length;
    const total = WORLD_SEED.provinces.length;
    expect(coastal).toBeGreaterThan(Math.floor(total * 0.25));
    expect(coastal).toBeLessThan(Math.floor(total * 0.60));
  });

  it('does not leave gap-sliver overlaps between neighbors', () => {
    const byId = new Map(
      provincesGeo.features.map((feature) => [feature.id ?? feature.properties.id, feature]),
    );
    let sliverPairs = 0;
    for (const province of WORLD_SEED.provinces) {
      for (const neighborId of province.neighbors) {
        if (neighborId <= province.id) continue;
        const a = byId.get(province.id);
        const b = byId.get(neighborId);
        if (!a?.geometry || !b?.geometry) continue;
        let hit = false;
        for (const polygon of polygonsOf(a.geometry)) {
          for (const point of polygon[0]) {
            if (onBoundary(point, b.geometry)) continue;
            if (pointInGeometry(point, b.geometry)) {
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (hit) sliverPairs += 1;
      }
    }
    // Topology welding should eliminate systemic overlaps; allow a tiny residual.
    expect(sliverPairs).toBeLessThanOrEqual(50);
  });

  it('covers cross-owner shared edges with national-border geometry', () => {
    const byId = new Map(
      provincesGeo.features.map((feature) => [feature.id ?? feature.properties.id, feature]),
    );
    const borderKeys = new Set<string>();
    for (const line of nationalBorders.features[0]?.geometry?.coordinates ?? []) {
      for (let i = 0; i < line.length - 1; i++) {
        borderKeys.add(edgeKey(line[i], line[i + 1]));
      }
    }
    expect(borderKeys.size).toBeGreaterThan(100);

    let crossOwnerShared = 0;
    let covered = 0;
    for (const province of WORLD_SEED.provinces) {
      for (const neighborId of province.neighbors) {
        if (neighborId <= province.id) continue;
        const other = WORLD_SEED.provinces[neighborId];
        if (!other || other.ownerTag === province.ownerTag) continue;
        const a = byId.get(province.id);
        const b = byId.get(neighborId);
        if (!a?.geometry || !b?.geometry) continue;
        if (!shareExactEdge(a.geometry, b.geometry)) continue; // skip island bridges
        crossOwnerShared += 1;
        const keys = geometryEdgeKeys(a.geometry);
        let matched = false;
        for (const key of keys) {
          if (borderKeys.has(key)) {
            matched = true;
            break;
          }
        }
        if (matched) covered += 1;
      }
    }
    expect(crossOwnerShared).toBeGreaterThan(50);
    expect(covered / crossOwnerShared).toBeGreaterThanOrEqual(0.9);
  });

  it('has no self-intersecting outer rings', () => {
    const bad: string[] = [];
    for (const feature of provincesGeo.features) {
      const name = WORLD_SEED.provinces[feature.id ?? feature.properties.id]?.name ?? String(feature.id);
      for (const polygon of polygonsOf(feature.geometry)) {
        if (ringSelfIntersects(polygon[0])) bad.push(name);
      }
    }
    expect(bad).toEqual([]);
  });
});
