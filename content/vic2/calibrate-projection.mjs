/**
 * Fits Victoria II's map projection so its provinces can be placed in real
 * lon/lat, which is what lets us re-cut Natural Earth geometry along Vic2's
 * state regions.
 *
 * Vic2's provinces.bmp is a 5616x2160 stylised world map. This script reads the
 * bitmap, computes a pixel centroid and area for every province, then fits
 * pixel -> lon/lat against provinces whose names are unambiguous real cities.
 * It reports residuals so the fit can be judged rather than trusted.
 *
 *   node content/vic2/calibrate-projection.mjs [path-to-Victoria 2]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V = process.argv[2] ?? 'C:/Program Files (x86)/Steam/steamapps/common/Victoria 2';
const OUT = path.join(__dirname, 'vic2-province-points.json');

/** Province id -> real-world [lon, lat] for places Vic2 names after a real city. */
const ANCHORS = {
  300: [-0.1276, 51.5072],   // London
  425: [2.3522, 48.8566],    // Paris
  402: [2.2957, 49.8941],    // Amiens
  549: [13.4050, 52.5200],   // Berlin
  619: [16.3738, 48.2082],   // Vienna
  860: [28.9784, 41.0082],   // Istanbul
  994: [30.3351, 59.9343],   // St Petersburg
  1030: [49.1221, 55.7887],  // Kazan
  220: [-77.0369, 38.9072],  // Washington
  163: [-87.6298, 41.8781],  // Chicago
  2159: [-100.9855, 22.1565],// San Luis Potosi
  2209: [-82.3666, 23.1136], // Havana
  1649: [139.6917, 35.6895], // Edo (Tokyo)
  1612: [116.4074, 39.9042], // Beijing
  1387: [101.6869, 3.1390],  // Kuala Lumpur
  1297: [72.8777, 19.0760],  // Bombay
  1251: [88.3639, 22.5726],  // Calcutta
  1745: [31.2357, 30.0444],  // Cairo
  1923: [3.3792, 6.5244],    // Lagos
  2087: [18.4241, -33.9249], // Cape Town
  2295: [-77.0428, -12.0464],// Lima
  2324: [-70.6693, -33.4489],// Santiago
  2348: [-58.3816, -34.6037],// Buenos Aires
  2447: [-43.1729, -22.9068],// Rio de Janeiro
  2468: [151.2093, -33.8688],// Sydney
  2497: [115.8605, -31.9505],// Perth
  2509: [174.7633, -36.8485],// Auckland
  2529: [145.7710, -7.9636], // Kerema
};

// ------------------------------------------------------------ definition.csv
const rgbToId = new Map();
const idToName = new Map();
for (const line of readFileSync(path.join(V, 'map/definition.csv'), 'latin1').split(/\r?\n/).slice(1)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const c = line.split(';');
  const id = Number(c[0]);
  if (!Number.isFinite(id)) continue;
  rgbToId.set((Number(c[1]) << 16) | (Number(c[2]) << 8) | Number(c[3]), id);
  idToName.set(id, (c[4] ?? '').trim());
}

// ------------------------------------------------------------ provinces.bmp
const bmp = readFileSync(path.join(V, 'map/provinces.bmp'));
const dataOffset = bmp.readUInt32LE(10);
const width = bmp.readInt32LE(18);
const height = bmp.readInt32LE(22);
const bpp = bmp.readUInt16LE(28);
if (bpp !== 24) throw new Error(`expected a 24-bit bitmap, got ${bpp}`);
const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
console.log(`provinces.bmp ${width}x${height} @${bpp}bpp, row stride ${rowSize}`);

/** id -> { sumX, sumY, pixels } in image space (y = 0 at the top). */
const acc = new Map();
for (let row = 0; row < height; row += 1) {
  // BMP rows with positive height are stored bottom-up.
  const y = height - 1 - row;
  let off = dataOffset + row * rowSize;
  for (let x = 0; x < width; x += 1, off += 3) {
    const key = (bmp[off + 2] << 16) | (bmp[off + 1] << 8) | bmp[off];
    const id = rgbToId.get(key);
    if (id === undefined) continue;
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { sumX: 0, sumY: 0, pixels: 0 }));
    a.sumX += x;
    a.sumY += y;
    a.pixels += 1;
  }
}
console.log(`provinces found in bitmap: ${acc.size}`);

const centroid = new Map();
for (const [id, a] of acc) centroid.set(id, { x: a.sumX / a.pixels, y: a.sumY / a.pixels, pixels: a.pixels });

// ------------------------------------------------------------ fit
/** Ordinary least squares for v = m*u + b. */
function fitLinear(pairs) {
  const n = pairs.length;
  const su = pairs.reduce((s, p) => s + p[0], 0);
  const sv = pairs.reduce((s, p) => s + p[1], 0);
  const suu = pairs.reduce((s, p) => s + p[0] * p[0], 0);
  const suv = pairs.reduce((s, p) => s + p[0] * p[1], 0);
  const m = (n * suv - su * sv) / (n * suu - su * su);
  return { m, b: (sv - m * su) / n };
}

const usable = Object.entries(ANCHORS)
  .map(([id, lonLat]) => ({ id: Number(id), lonLat, c: centroid.get(Number(id)) }))
  .filter((a) => a.c);
console.log(`anchors usable: ${usable.length}/${Object.keys(ANCHORS).length}`);

const lonFit = fitLinear(usable.map((a) => [a.c.x, a.lonLat[0]]));
const latFit = fitLinear(usable.map((a) => [a.c.y, a.lonLat[1]]));
console.log(`lon = ${lonFit.m.toFixed(8)} * x + ${lonFit.b.toFixed(5)}`);
console.log(`lat = ${latFit.m.toFixed(8)} * y + ${latFit.b.toFixed(5)}`);

console.log('\nresiduals (linear fit):');
let worstLon = 0;
let worstLat = 0;
for (const a of usable) {
  const lon = lonFit.m * a.c.x + lonFit.b;
  const lat = latFit.m * a.c.y + latFit.b;
  const dLon = lon - a.lonLat[0];
  const dLat = lat - a.lonLat[1];
  worstLon = Math.max(worstLon, Math.abs(dLon));
  worstLat = Math.max(worstLat, Math.abs(dLat));
  console.log(
    `  ${String(a.id).padStart(4)} ${(idToName.get(a.id) ?? '').padEnd(16)}`
    + ` dlon ${dLon.toFixed(2).padStart(7)}  dlat ${dLat.toFixed(2).padStart(7)}`,
  );
}
console.log(`\nworst |dlon| ${worstLon.toFixed(2)}  worst |dlat| ${worstLat.toFixed(2)}`);

writeFileSync(OUT, JSON.stringify({
  source: `provinces.bmp at ${V}`,
  width,
  height,
  fit: { lon: lonFit, lat: latFit },
  points: Object.fromEntries(
    [...centroid].map(([id, c]) => [id, { x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, pixels: c.pixels }]),
  ),
}));
console.log('wrote', path.relative(process.cwd(), OUT));
