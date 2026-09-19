#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHistoricalWorld } from '../content/history/compileHistoricalWorld.mjs';
import { buildNationalBorders } from './lib/national-borders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = path.join(root, 'src/data/generated/worldSeed.json');
const provincesPath = path.join(root, 'src/data/generated/provinces.geo.json');
const bordersPath = path.join(root, 'src/data/generated/nationalBorders.geo.json');
const historyPath = path.join(root, 'content/history/1830');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

function signedRingAreaCentroid(ring) {
  if (ring.length < 4) return null;
  let twiceArea = 0;
  let lonAcc = 0;
  let latAcc = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index] ?? [];
    const [x2, y2] = ring[index + 1] ?? [];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    lonAcc += (x1 + x2) * cross;
    latAcc += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) return null;
  return {
    area: twiceArea / 2,
    lon: lonAcc / (3 * twiceArea),
    lat: latAcc / (3 * twiceArea),
  };
}

function largestPolyCentroid(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let maxArea = 0;
  let best = null;
  for (const poly of polys) {
    const stats = signedRingAreaCentroid(poly[0]);
    if (stats && Math.abs(stats.area) > maxArea) {
      maxArea = Math.abs(stats.area);
      best = stats;
    }
  }
  return best;
}

const [seed, polities, ownership, anchors, provincesGeo] = await Promise.all([
  readJson(seedPath),
  readJson(path.join(historyPath, 'polities.json')),
  readJson(path.join(historyPath, 'ownership.json')),
  readJson(path.join(historyPath, 'anchors.json')),
  readJson(provincesPath),
]);

console.log('[repair] Starting map geometry and border repair...');

// --- 1. Fix Antarctica polygon leaks in provinces.geo.json ---
const southernFeatureIds = [11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22];
for (const id of southernFeatureIds) {
  const feature = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === id);
  if (!feature) throw new Error(`Missing feature ${id}`);
  const polys = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
  const filtered = polys.filter((poly) => !poly[0].some((coord) => coord[1] < -60));
  feature.geometry = {
    type: 'MultiPolygon',
    coordinates: filtered,
  };
  console.log(`[repair] Feature ${id} (${feature.properties?.n}): filtered from ${polys.length} to ${filtered.length} polygons`);
}

// --- 2. Fix Pacific Islands swap between Hawaii (142), Polynesia (22), Ecuador (141), Araucania (11) ---
const f22 = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === 22);
const f142 = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === 142);
const f141 = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === 141);
const f11 = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === 11);

// In Feature 22, extract Hawaiian island polygons (lat > 15 & lat < 25, lon between -162 and -153)
const polys22 = f22.geometry.coordinates;
const hawaiiPolys = polys22.filter((p) => p[0].every((c) => c[1] > 15 && c[1] < 25 && c[0] > -162 && c[0] < -153));
if (hawaiiPolys.length !== 7) {
  throw new Error(`Expected 7 Hawaiian island polygons in feature 22, found ${hawaiiPolys.length}`);
}
f22.geometry.coordinates = polys22.filter((p) => !hawaiiPolys.includes(p));
console.log(`[repair] Extracted ${hawaiiPolys.length} Hawaiian island polygons from feature 22 (remaining: ${f22.geometry.coordinates.length})`);

// In Feature 142, extract Galapagos (lon -93..-88, lat -3..3) and Easter Island (lon -112..-106, lat -30..-25)
const polys142 = f142.geometry.type === 'MultiPolygon' ? f142.geometry.coordinates : [f142.geometry.coordinates];
const galapagosPolys = polys142.filter((p) => p[0].every((c) => c[0] > -93 && c[0] < -88 && c[1] > -3 && c[1] < 3));
const easterPolys = polys142.filter((p) => p[0].every((c) => c[0] > -112 && c[0] < -106 && c[1] > -30 && c[1] < -25));
if (galapagosPolys.length !== 5) {
  throw new Error(`Expected 5 Galapagos polygons in feature 142, found ${galapagosPolys.length}`);
}
if (easterPolys.length !== 1) {
  throw new Error(`Expected 1 Easter Island polygon in feature 142, found ${easterPolys.length}`);
}

// Merge Galapagos into Ecuador (141)
const polys141 = f141.geometry.type === 'MultiPolygon' ? f141.geometry.coordinates : [f141.geometry.coordinates];
f141.geometry = {
  type: 'MultiPolygon',
  coordinates: [...polys141, ...galapagosPolys],
};
console.log(`[repair] Merged ${galapagosPolys.length} Galapagos polygons into Ecuador (141)`);

// Merge Easter Island into Araucania (11)
f11.geometry = {
  type: 'MultiPolygon',
  coordinates: [...f11.geometry.coordinates, ...easterPolys],
};
console.log(`[repair] Merged ${easterPolys.length} Easter Island polygon into Araucania (11)`);

// Put Hawaii polygons into Hawaii (142)
f142.geometry = {
  type: 'MultiPolygon',
  coordinates: hawaiiPolys,
};
console.log(`[repair] Placed ${hawaiiPolys.length} Hawaiian island polygons into Hawaiian Islands (142)`);

// --- 3. Update province lon/lat in worldSeed.json for affected provinces ---
const provincesById = new Map(seed.provinces.map((p) => [p.id, p]));
const affectedProvIds = [11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 142];
for (const id of affectedProvIds) {
  const feat = provincesGeo.features.find((f) => (f.id ?? f.properties?.id) === id);
  const prov = provincesById.get(id);
  const centroid = largestPolyCentroid(feat.geometry);
  if (centroid) {
    prov.lon = Number(centroid.lon.toFixed(6));
    prov.lat = Number(centroid.lat.toFixed(6));
    console.log(`[repair] Updated ${prov.name} (${id}) coordinates to [${prov.lon}, ${prov.lat}]`);
  }
}

// --- 4. Resolve China warlord fragmentation in worldSeed.json ---
const warlordProvIds = [91, 93, 94, 95, 96, 100, 102, 104, 105, 109, 112, 113, 118, 120, 400];
for (const provId of warlordProvIds) {
  const prov = provincesById.get(provId);
  if (prov) {
    prov.ownerTag = 'QNG';
  }
}
const warlordStateIds = [47, 49, 50, 54];
for (const state of seed.states) {
  if (warlordStateIds.includes(state.id)) {
    state.ownerTag = 'QNG';
  }
}
seed.nations = seed.nations.filter((n) => !['GXI', 'YNN', 'XBI', 'MCK'].includes(n.tag));
console.log(`[repair] Reassigned ${warlordProvIds.length} Chinese warlord provinces and 4 states to QNG`);

// --- 5. Resolve US interior uncolonized hole (Colorado #500, Oklahoma #525) ---
const usProvIds = [500, 525];
for (const provId of usProvIds) {
  const prov = provincesById.get(provId);
  if (prov) {
    prov.ownerTag = 'USA';
  }
}
const state206 = seed.states.find((s) => s.id === 206);
if (state206) {
  state206.ownerTag = 'USA';
}
const uncNation = seed.nations.find((n) => n.tag === 'UNC');
if (uncNation) {
  uncNation.capitalProvinceId = 5; // Sahara
  uncNation.coreStateIds = (uncNation.coreStateIds ?? []).filter((id) => id !== 206);
}
const usaNation = seed.nations.find((n) => n.tag === 'USA');
if (usaNation && !usaNation.coreStateIds.includes(206)) {
  usaNation.coreStateIds.push(206);
  usaNation.coreStateIds.sort((a, b) => a - b);
}
console.log('[repair] Reassigned Colorado and Oklahoma (State 206) to USA');

// --- 6. Update neighbor adjacencies ---
function addMutual(aId, bId) {
  const a = provincesById.get(aId);
  const b = provincesById.get(bId);
  if (!a || !b) return;
  if (!a.neighbors.includes(bId)) a.neighbors.push(bId);
  if (!b.neighbors.includes(aId)) b.neighbors.push(aId);
}
function removeMutual(aId, bId) {
  const a = provincesById.get(aId);
  const b = provincesById.get(bId);
  if (!a || !b) return;
  a.neighbors = a.neighbors.filter((id) => id !== bId);
  b.neighbors = b.neighbors.filter((id) => id !== aId);
}

// Disconnect Hawaii from Ecuador, disconnect Araucania from Western Polynesia
removeMutual(141, 142);
removeMutual(11, 22);

// Connect Pacific islands
addMutual(22, 142); // Western Polynesia <-> Hawaii
addMutual(22, 319); // Western Polynesia <-> Fiji

// Connect missing land adjacencies
addMutual(355, 358); // Posen <-> Westpreußen
addMutual(460, 462); // Bangkok <-> Nakhon Ratchasima

// Ensure all neighbor arrays are sorted and deduplicated
for (const prov of seed.provinces) {
  prov.neighbors = [...new Set(prov.neighbors)].sort((a, b) => a - b);
}
console.log('[repair] Updated neighbor adjacencies');

// --- 7. Save provinces.geo.json ---
await writeFile(provincesPath, `${JSON.stringify(provincesGeo)}\n`, 'utf8');
console.log('[repair] Written updated provinces.geo.json');

// --- 8. Compile historical world seed & national borders ---
const compiled = compileHistoricalWorld(seed, polities, ownership, anchors);
const borders = buildNationalBorders(provincesGeo, compiled);

await writeFile(seedPath, `${JSON.stringify(compiled)}\n`, 'utf8');
await writeFile(bordersPath, `${JSON.stringify(borders)}\n`, 'utf8');
console.log(`[repair] Historical compilation complete. Polities: ${compiled.nations.length}, Provinces: ${compiled.provinces.length}, States: ${compiled.states.length}`);
console.log(`[repair] National borders generated with ${borders.features[0].geometry.coordinates.length} frontier chains.`);
