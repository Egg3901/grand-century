/**
 * Places every Victoria II state region at a real lon/lat.
 *
 * Vic2's map is hand-drawn, not a true projection: longitude is very nearly
 * equirectangular, but latitude drifts by up to ~8 degrees in a regional
 * pattern (the Americas sit high, Asia sits low). A single global fit is
 * therefore useless, so this script:
 *
 *   1. matches Vic2 province names against a populated-places gazetteer,
 *      disambiguating same-name places using the reliable global longitude fit;
 *   2. rejects outliers, then fits a *local* affine warp (k nearest anchors,
 *      distance-weighted least squares) so regional distortion is absorbed;
 *   3. reports hold-out residuals so the warp can be judged;
 *   4. emits an area-weighted lon/lat centroid per region.
 *
 *   node content/vic2/build-region-points.mjs [path-to-Victoria 2]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const V = process.argv[2] ?? 'C:/Program Files (x86)/Steam/steamapps/common/Victoria 2';
const OUT = path.join(__dirname, 'vic2-region-points.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const points = readJson(path.join(__dirname, 'vic2-province-points.json'));
const reference = readJson(path.join(__dirname, 'vic2-reference.json'));
const gazetteer = readJson(path.join(ROOT, 'content/raw/ne_10m_populated_places_simple.geojson'));

/** Drop diacritics and punctuation so "Sao Paulo" matches "São Paulo". */
const normalize = (s) => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ------------------------------------------------------- province names
const provinceName = new Map();
for (const line of readFileSync(path.join(V, 'map/definition.csv'), 'latin1').split(/\r?\n/).slice(1)) {
  const c = line.split(';');
  const id = Number(c[0]);
  if (Number.isFinite(id) && c[4]) provinceName.set(id, c[4].trim());
}

// ------------------------------------------------------- gazetteer index
const byName = new Map();
for (const f of gazetteer.features) {
  const [lon, lat] = f.geometry.coordinates;
  for (const raw of [f.properties.name, f.properties.nameascii, f.properties.namealt]) {
    if (!raw) continue;
    const key = normalize(raw);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    const list = byName.get(key);
    if (!list.some((c) => c.lon === lon && c.lat === lat)) {
      list.push({ lon, lat, pop: f.properties.pop_max ?? 0 });
    }
  }
}

// ------------------------------------------------------- anchor matching
// Longitude from the global fit is accurate to a couple of degrees, which is
// more than enough to pick the right "Springfield" out of a list.
const { lon: lonFit } = points.fit;
const pixelLon = (x) => lonFit.m * x + lonFit.b;
const LON_TOLERANCE = 10;

let anchors = [];
for (const [idStr, c] of Object.entries(points.points)) {
  const id = Number(idStr);
  const name = provinceName.get(id);
  if (!name) continue;
  const candidates = byName.get(normalize(name));
  if (!candidates?.length) continue;
  const predicted = pixelLon(c.x);
  // Wrap-aware longitude delta.
  const delta = (cand) => Math.abs(((cand.lon - predicted + 540) % 360) - 180);
  const best = candidates.slice().sort((a, b) => delta(a) - delta(b))[0];
  if (delta(best) > LON_TOLERANCE) continue;
  anchors.push({ id, name, x: c.x, y: c.y, lon: best.lon, lat: best.lat });
}
console.log(`name-matched anchors: ${anchors.length}`);

// ------------------------------------------------------- local affine warp
/**
 * Solves the 3x3 normal equations for v = a*x + b*y + c using weighted least
 * squares over the supplied neighbours.
 */
function solveLocal(neighbours, pick) {
  let s = new Array(9).fill(0);
  let t = [0, 0, 0];
  for (const n of neighbours) {
    const w = n.w;
    const basis = [n.x, n.y, 1];
    const value = pick(n);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) s[i * 3 + j] += w * basis[i] * basis[j];
      t[i] += w * basis[i] * value;
    }
  }
  // Gaussian elimination with partial pivoting.
  const m = [[s[0], s[1], s[2], t[0]], [s[3], s[4], s[5], t[1]], [s[6], s[7], s[8], t[2]]];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let k = col; k < 4; k += 1) m[r][k] -= factor * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

const K = 24;
/** Warp a pixel point using the K nearest anchors, excluding `skipId` for hold-out. */
function warp(x, y, pool, skipId = null) {
  const near = [];
  for (const a of pool) {
    if (a.id === skipId) continue;
    const d2 = (a.x - x) ** 2 + (a.y - y) ** 2;
    near.push({ ...a, d2 });
  }
  near.sort((p, q) => p.d2 - q.d2);
  const chosen = near.slice(0, K);
  if (!chosen.length) return null;
  // Inverse-distance weights, softened so the nearest anchor cannot dominate.
  const scale = Math.max(chosen[chosen.length - 1].d2, 1);
  for (const n of chosen) n.w = 1 / (1 + n.d2 / scale * 3);
  const lonSol = solveLocal(chosen, (n) => n.lon);
  const latSol = solveLocal(chosen, (n) => n.lat);
  if (!lonSol || !latSol) return null;
  return {
    lon: lonSol[0] * x + lonSol[1] * y + lonSol[2],
    lat: latSol[0] * x + latSol[1] * y + latSol[2],
  };
}

// Two rounds of leave-one-out outlier rejection: a mis-matched city name shows
// up as a point the surrounding anchors strongly disagree with.
for (const round of [1, 2]) {
  const kept = [];
  let dropped = 0;
  for (const a of anchors) {
    const w = warp(a.x, a.y, anchors, a.id);
    if (!w) continue;
    const dLon = Math.abs(((w.lon - a.lon + 540) % 360) - 180);
    const dLat = Math.abs(w.lat - a.lat);
    if (dLon > 3 || dLat > 3) dropped += 1;
    else kept.push(a);
  }
  anchors = kept;
  console.log(`outlier round ${round}: dropped ${dropped}, kept ${anchors.length}`);
}

// ------------------------------------------------------- accuracy report
let sumLon = 0;
let sumLat = 0;
let worstLon = 0;
let worstLat = 0;
let n = 0;
for (const a of anchors) {
  const w = warp(a.x, a.y, anchors, a.id);
  if (!w) continue;
  const dLon = Math.abs(((w.lon - a.lon + 540) % 360) - 180);
  const dLat = Math.abs(w.lat - a.lat);
  sumLon += dLon; sumLat += dLat;
  worstLon = Math.max(worstLon, dLon);
  worstLat = Math.max(worstLat, dLat);
  n += 1;
}
console.log(`\nleave-one-out over ${n} anchors:`);
console.log(`  mean |dlon| ${(sumLon / n).toFixed(3)}  worst ${worstLon.toFixed(2)}`);
console.log(`  mean |dlat| ${(sumLat / n).toFixed(3)}  worst ${worstLat.toFixed(2)}`);

// ------------------------------------------------------- region centroids
const regions = [];
for (const region of reference.regions) {
  let sx = 0;
  let sy = 0;
  let area = 0;
  const members = [];
  for (const pid of region.provinceIds) {
    const p = points.points[pid];
    if (!p) continue;
    sx += p.x * p.pixels;
    sy += p.y * p.pixels;
    area += p.pixels;
    members.push(pid);
  }
  if (!area) {
    console.warn(`  region ${region.key} has no bitmap pixels; skipped`);
    continue;
  }
  const w = warp(sx / area, sy / area, anchors);
  regions.push({
    key: region.key,
    name: region.name,
    continent: region.continent,
    dominantOwner1836: region.dominantOwner1836,
    owners1836: region.owners1836,
    provinceIds: members,
    pixelArea: area,
    lon: Math.round(w.lon * 1e4) / 1e4,
    lat: Math.round(w.lat * 1e4) / 1e4,
  });
}

writeFileSync(OUT, JSON.stringify({
  source: 'Vic2 region centroids warped to real lon/lat',
  generatedAt: new Date().toISOString(),
  anchorCount: anchors.length,
  accuracy: {
    meanAbsLonDeg: Number((sumLon / n).toFixed(4)),
    meanAbsLatDeg: Number((sumLat / n).toFixed(4)),
    worstAbsLonDeg: Number(worstLon.toFixed(3)),
    worstAbsLatDeg: Number(worstLat.toFixed(3)),
  },
  regions,
}, null, 1));
console.log(`\nwrote ${path.relative(process.cwd(), OUT)} (${regions.length} regions)`);
