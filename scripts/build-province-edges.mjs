#!/usr/bin/env node
/**
 * Shared province edges for the 3D renderer's vector borders.
 *
 * The runtime province geometry is a shared topology: neighbouring provinces
 * carry vertex-identical boundaries. Every segment that appears in exactly two
 * provinces is an internal edge; a segment in one province is coastline and
 * is written with b = -1. Consecutive segments between the same pair are
 * chained into polylines.
 *
 * Output (src/graphics/province-edges.json):
 *   { schemaVersion, geometryHash, chains: [[a, b, x0, y0, dx1, dy1, ...], ...] }
 * a and b are province ids (a < b, or b = -1 for coastline); coordinates are lon/lat in 1e-4 degree
 * integers, the first absolute and the rest deltas.
 *
 * Usage: node scripts/build-province-edges.mjs [--check]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const geoPath = path.join(root, 'src/data/generated/provinces.geo.json');
const outPath = path.join(root, 'src/graphics/province-edges.json');
const SCALE = 1e4;

const raw = readFileSync(geoPath);
const geometryHash = createHash('sha256').update(raw).digest('hex').slice(0, 16);

if (process.argv.includes('--check')) {
  const current = JSON.parse(readFileSync(outPath, 'utf8'));
  if (current.geometryHash !== geometryHash) {
    console.error(`province-edges.json is stale (${current.geometryHash} vs ${geometryHash}); run node scripts/build-province-edges.mjs`);
    process.exit(1);
  }
  console.log(`Province edges match geometry ${geometryHash}`);
  process.exit(0);
}

const geo = JSON.parse(raw.toString('utf8'));
const pointId = new Map();
const points = [];
const idOf = (x, y) => {
  const qx = Math.round(x * SCALE), qy = Math.round(y * SCALE);
  const key = `${qx},${qy}`;
  let id = pointId.get(key);
  if (id === undefined) {
    id = points.length;
    pointId.set(key, id);
    points.push([qx, qy]);
  }
  return id;
};

// segment key -> provinces that use it
const owners = new Map();
for (const feature of geo.features) {
  const province = feature.properties.id;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const p = idOf(ring[i][0], ring[i][1]);
        const q = idOf(ring[i + 1][0], ring[i + 1][1]);
        if (p === q) continue;
        // Rings cut at the antimeridian are not coastline.
        if (Math.abs(ring[i][0]) >= 179.999 && Math.abs(ring[i + 1][0]) >= 179.999) continue;
        const key = p < q ? `${p}:${q}` : `${q}:${p}`;
        const list = owners.get(key) ?? [];
        if (!list.includes(province)) list.push(province);
        owners.set(key, list);
      }
    }
  }
}

// pair -> undirected adjacency of its shared segments. Coastline segments
// (one province) pair with -1, so the renderer can ink the shore as well.
const pairs = new Map();
for (const [key, list] of owners) {
  if (list.length > 2) continue;
  const [a, b] = list.length === 1 ? [list[0], -1] : list[0] < list[1] ? list : [list[1], list[0]];
  const pair = `${a}:${b}`;
  let entry = pairs.get(pair);
  if (!entry) pairs.set(pair, (entry = { a, b, next: new Map() }));
  const [p, q] = key.split(':').map(Number);
  for (const [u, v] of [[p, q], [q, p]]) {
    const list2 = entry.next.get(u) ?? [];
    list2.push(v);
    entry.next.set(u, list2);
  }
}

const chains = [];
const sortedPairs = [...pairs.values()].sort((l, r) => l.a - r.a || l.b - r.b);
for (const { a, b, next } of sortedPairs) {
  const used = new Set();
  const edgeKey = (u, v) => (u < v ? `${u}:${v}` : `${v}:${u}`);
  const walk = (start) => {
    const line = [start];
    let at = start;
    for (;;) {
      const step = (next.get(at) ?? []).find((v) => !used.has(edgeKey(at, v)));
      if (step === undefined) break;
      used.add(edgeKey(at, step));
      line.push(step);
      at = step;
    }
    return line;
  };
  // Open chains start at endpoints (degree 1), then remaining loops.
  const starts = [...next.keys()].sort((l, r) => l - r);
  for (const pass of [1, 2]) {
    for (const start of starts) {
      const degree = next.get(start).length;
      if (pass === 1 && degree !== 1) continue;
      while ((next.get(start) ?? []).some((v) => !used.has(edgeKey(start, v)))) {
        const line = walk(start);
        if (line.length < 2) break;
        const out = [a, b, points[line[0]][0], points[line[0]][1]];
        for (let i = 1; i < line.length; i += 1) {
          out.push(points[line[i]][0] - points[line[i - 1]][0], points[line[i]][1] - points[line[i - 1]][1]);
        }
        chains.push(out);
      }
    }
  }
}

writeFileSync(outPath, `${JSON.stringify({ schemaVersion: 1, geometryHash, chains })}\n`);
const segments = chains.reduce((sum, chain) => sum + (chain.length - 4) / 2, 0);
console.log(`Wrote ${chains.length} border chains (${segments} segments, ${pairs.size} province pairs) for geometry ${geometryHash}`);
