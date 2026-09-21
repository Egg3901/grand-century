/**
 * Trace real province geometry out of a Victoria II `provinces.bmp`.
 *
 * The map used to be Voronoi cells scattered over a Natural Earth country
 * outline, which is why its inland borders were invented straight chords. This
 * reads the actual province raster instead, so every border is one Paradox drew.
 *
 * Grouping happens at the PIXEL level, before any tracing: each pixel is
 * relabelled to the group it belongs to and the group outline is traced once.
 * That is what makes lumping safe. Merging polygons would leave seams and
 * merging Voronoi cells would just produce a larger invented border; merging
 * pixels cannot, because the outline that survives is a real border by
 * construction.
 *
 * Output is an intermediate artifact consumed by build-map.mjs, in the same
 * spirit as the other content/vic2 extraction steps.
 *
 * Usage:
 *   node content/vic2/trace-province-geometry.mjs [--limit-bbox w,s,e,n] [--out FILE]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { repairSelfIntersectingRing } from './ring-repair.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TGC = path.join(ROOT, 'content', 'raw', 'tgc');

// ---------------------------------------------------------------- raster ---

function readProvinceRaster() {
  const buf = readFileSync(path.join(TGC, 'provinces.bmp'));
  if (buf.readUInt16LE(0) !== 0x4d42) throw new Error('not a BMP');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24) throw new Error(`expected 24bpp, got ${bpp}`);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const stride = (((width * bpp + 31) / 32) | 0) * 4;
  return { buf, offset, width, height, bottomUp, stride };
}

/** Province id per pixel, row 0 = north. 0 means "no province". */
function buildProvinceGrid(raster, rgbToId) {
  const { buf, offset, width, height, bottomUp, stride } = raster;
  const grid = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y;
    let p = offset + srcRow * stride;
    const dst = y * width;
    for (let x = 0; x < width; x++, p += 3) {
      const key = (buf[p + 2] << 16) | (buf[p + 1] << 8) | buf[p];
      grid[dst + x] = rgbToId.get(key) ?? 0;
    }
  }
  return grid;
}

function loadDefinitions() {
  const text = readFileSync(path.join(TGC, 'definition.csv'), 'latin1');
  const rgbToId = new Map();
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split(';');
    if (cols.length < 4 || !/^\d+$/.test(cols[0])) continue;
    const id = Number(cols[0]);
    rgbToId.set((Number(cols[1]) << 16) | (Number(cols[2]) << 8) | Number(cols[3]), id);
  }
  return rgbToId;
}

// ----------------------------------------------------------------- warp ----

/**
 * Local affine warp from raster pixels to lon/lat, fitted per query point from
 * the k nearest anchors. Vic2's map is hand-drawn rather than projected: a
 * single global formula is off by degrees in a regional pattern, so it has to
 * be local. Anchors and their measured accuracy come from the calibration step.
 */
/**
 * Beyond this distance from the nearest anchor, the local fit is extrapolating
 * rather than interpolating and its answer is worthless. Greenland and the
 * remote islands have almost no anchors, and the extrapolation put their rings
 * 158 degrees away, in Siberia.
 */
const EXTRAPOLATION_PX = 260;

function makeWarp(anchorFile, k = 20) {
  const { anchors, globalFit } = JSON.parse(readFileSync(anchorFile, 'utf8'));
  const n = anchors.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const alon = new Float64Array(n);
  const alat = new Float64Array(n);
  anchors.forEach((a, i) => { [ax[i], ay[i], alon[i], alat[i]] = a; });

  const idx = new Int32Array(n);
  const d2 = new Float64Array(n);

  return function warp(px, py) {
    for (let i = 0; i < n; i++) {
      const dx = ax[i] - px;
      const dy = ay[i] - py;
      d2[i] = dx * dx + dy * dy;
      idx[i] = i;
    }
    // partial selection of the k nearest
    for (let a = 0; a < k; a++) {
      let best = a;
      for (let b = a + 1; b < n; b++) if (d2[idx[b]] < d2[idx[best]]) best = b;
      const t = idx[a]; idx[a] = idx[best]; idx[best] = t;
    }
    // weighted least squares: [x y 1] -> value
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const bLon = [0, 0, 0];
    const bLat = [0, 0, 0];
    for (let a = 0; a < k; a++) {
      const i = idx[a];
      const w = 1 / Math.max(d2[i], 1e-6);
      const r = [ax[i], ay[i], 1];
      for (let p = 0; p < 3; p++) {
        for (let q = 0; q < 3; q++) M[p * 3 + q] += w * r[p] * r[q];
        bLon[p] += w * r[p] * alon[i];
        bLat[p] += w * r[p] * alat[i];
      }
    }
    // Outside the anchor cloud, take the global equirectangular fit. It is
    // coarse (about 1.3 degrees mean) but it is never absurd, which local
    // extrapolation very much is.
    if (globalFit && d2[idx[0]] > EXTRAPOLATION_PX * EXTRAPOLATION_PX) {
      return [
        px * globalFit.lon[0] + py * globalFit.lon[1] + globalFit.lon[2],
        px * globalFit.lat[0] + py * globalFit.lat[1] + globalFit.lat[2],
      ];
    }

    const sol = solve3(M, bLon);
    const sol2 = solve3(M, bLat);
    if (!sol || !sol2) return null;
    const lon = px * sol[0] + py * sol[1] + sol[2];
    const lat = px * sol2[0] + py * sol2[1] + sol2[2];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
  };
}

function solve3(M, b) {
  const a = [
    [M[0], M[1], M[2], b[0]],
    [M[3], M[4], M[5], b[1]],
    [M[6], M[7], M[8], b[2]],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let q = c; q < 4; q++) a[r][q] -= f * a[c][q];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

// --------------------------------------------------------------- tracing ---

/**
 * Boundary rings for every label in `labels`, in pixel-lattice coordinates.
 *
 * One pass emits directed unit edges with the region on the left, so following
 * outgoing edges from each vertex closes rings without ambiguity about which
 * side is inside. Outer rings come out one winding, holes the other.
 */
function traceLabelRings(labels, width, height, wanted) {
  // Directions, in the order the edges below are emitted: 0 = +x, 1 = +y,
  // 2 = -x, 3 = -y. Edges run clockwise around each pixel, so the province is
  // always on the RIGHT of the direction of travel.
  const edges = new Map(); // label -> Map(vertex -> [dir0, dir1, dir2, dir3])
  const vid = (x, y) => y * (width + 1) + x;

  const push = (label, from, dir) => {
    let m = edges.get(label);
    if (!m) edges.set(label, (m = new Map()));
    let slots = m.get(from);
    if (!slots) m.set(from, (slots = [-1, -1, -1, -1]));
    slots[dir] = 1;
  };

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const label = labels[row + x];
      if (label <= 0 || !wanted.has(label)) continue;
      const up = y > 0 ? labels[row - width + x] : 0;
      const down = y < height - 1 ? labels[row + width + x] : 0;
      const left = x > 0 ? labels[row + x - 1] : 0;
      const right = x < width - 1 ? labels[row + x + 1] : 0;
      if (up !== label) push(label, vid(x, y), 0);
      if (right !== label) push(label, vid(x + 1, y), 1);
      if (down !== label) push(label, vid(x + 1, y + 1), 2);
      if (left !== label) push(label, vid(x, y + 1), 3);
    }
  }

  const step = (v, dir) => {
    const x = v % (width + 1);
    const y = (v - x) / (width + 1);
    if (dir === 0) return vid(x + 1, y);
    if (dir === 1) return vid(x, y + 1);
    if (dir === 2) return vid(x - 1, y);
    return vid(x, y - 1);
  };

  const out = new Map();
  for (const [label, m] of edges) {
    const rings = [];
    for (const [startVertex, startSlots] of m) {
      for (let d0 = 0; d0 < 4; d0++) {
        if (startSlots[d0] !== 1) continue;
        const ring = [startVertex];
        let v = startVertex;
        let dir = d0;
        let guard = 0;
        for (;;) {
          const slots = m.get(v);
          if (!slots || slots[dir] !== 1) break;
          slots[dir] = 0;               // consume
          v = step(v, dir);
          if (v === startVertex) { rings.push(ring); break; }
          ring.push(v);
          if (guard++ > 8_000_000) break;
          const next = m.get(v);
          if (!next) break;
          // Sharpest turn first, keeping the province on the right. Popping an
          // arbitrary outgoing edge here is what spliced separate loops into one
          // ring that jumped across the map: Alaska drew polygons in New Mexico.
          const right = (dir + 1) % 4;
          const straight = dir;
          const leftTurn = (dir + 3) % 4;
          if (next[right] === 1) dir = right;
          else if (next[straight] === 1) dir = straight;
          else if (next[leftTurn] === 1) dir = leftTurn;
          else break;
        }
      }
    }
    out.set(label, rings.filter((r) => r.length >= 4));
  }
  return out;
}

/**
 * Collapse collinear runs. Lossless, and that matters: neighbouring provinces
 * trace the same lattice edges from opposite sides, so any simplification that
 * depends on a ring's own shape gives the two sides different lines and they
 * crack apart. Douglas-Peucker per ring did exactly that and put a background
 * sliver along nearly every border.
 *
 * A pixel boundary is a staircase, so long horizontal and vertical runs collapse
 * to their endpoints with no loss at all. The lossy pass belongs downstream in
 * build-map.mjs, where topojson simplifies shared arcs once so both sides of a
 * border move together.
 */
function collapseCollinear(points) {
  if (points.length < 3) return points;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const cross = (cur[0] - prev[0]) * (next[1] - prev[1]) - (cur[1] - prev[1]) * (next[0] - prev[0]);
    if (cross !== 0) out.push(cur);
  }
  return out.length >= 3 ? out : points;
}

/**
 * Keep a ring continuous across the dateline.
 *
 * Chukotka and the Aleutians straddle 180 degrees, so a ring holds vertices at
 * both +179 and -179. Left alone that draws a line straight across the map,
 * which is what the last spikes near the Bering Strait were. Unwrapping keeps
 * consecutive steps short and lets the ring run past the edge coherently.
 */
function unwrapAntimeridian(ring) {
  const out = [ring[0].slice()];
  for (let i = 1; i < ring.length; i++) {
    const prev = out[i - 1];
    let [lon, lat] = ring[i];
    while (lon - prev[0] > 180) lon -= 360;
    while (prev[0] - lon > 180) lon += 360;
    out.push([lon, lat]);
  }
  return out;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return a / 2;
}

// ------------------------------------------------------------------ main ---

function main() {
  const args = process.argv.slice(2);
  const outFile = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : path.join(TGC, 'traced-geometry.json');
  const tol = args.includes('--tol') ? Number(args[args.indexOf('--tol') + 1]) : 1.6;

  console.log('[trace] reading raster');
  const raster = readProvinceRaster();
  console.log(`[trace] ${raster.width}x${raster.height}, ${raster.bottomUp ? 'bottom-up' : 'top-down'}`);
  const rgbToId = loadDefinitions();
  const provinceGrid = buildProvinceGrid(raster, rgbToId);

  // province id -> group id, from the grouping table
  const grouping = JSON.parse(readFileSync(path.join(TGC, 'grouping.json'), 'utf8'));
  const provinceToGroup = new Int32Array(65536);
  for (const [gid, group] of grouping.groups.entries()) {
    for (const pid of group.provinceIds) if (pid < 65536) provinceToGroup[pid] = gid + 1;
  }

  console.log('[trace] relabelling pixels to groups');
  const labels = new Int32Array(provinceGrid.length);
  for (let i = 0; i < provinceGrid.length; i++) {
    const pid = provinceGrid[i];
    labels[i] = pid > 0 && pid < 65536 ? provinceToGroup[pid] : 0;
  }

  const wanted = new Set();
  for (let g = 1; g <= grouping.groups.length; g++) wanted.add(g);

  console.log(`[trace] tracing ${grouping.groups.length} groups`);
  const rings = traceLabelRings(labels, raster.width, raster.height, wanted);

  console.log('[trace] warping to lon/lat');
  const warp = makeWarp(path.join(TGC, 'tgc-warp-anchors.json'));
  const features = [];
  let dropped = 0;
  for (const [label, ringList] of rings) {
    const group = grouping.groups[label - 1];
    const polys = [];
    for (const ring of ringList) {
      const pts = ring.map((v) => [v % (raster.width + 1), Math.floor(v / (raster.width + 1))]);
      // No collinear collapse. Two provinces trace the same lattice edges from
      // opposite sides, so the raw staircase is byte-identical along a shared
      // border and topojson can detect it as one arc. Collapsing first gives the
      // two sides different vertex sets wherever a third province meets them,
      // the arc stops being shared, each side simplifies on its own, and the
      // border cracks open again.
      const simplified = pts;
      if (simplified.length < 4) { dropped++; continue; }
      // Repair in lattice space, warp, then repair again. A traced ring bowties
      // exactly like a clipped one, and an unrepaired bowtie renders as a long
      // thin spike; the warp is a non-affine transform and can re-introduce
      // crossings that were not there before it, so once is not enough.
      const flat = repairSelfIntersectingRing(simplified);
      if (!flat || flat.length < 4) { dropped++; continue; }
      const lonlat = flat.map(([x, y]) => warp(x, y)).filter(Boolean);
      if (lonlat.length < 4) { dropped++; continue; }
      const repaired = repairSelfIntersectingRing(unwrapAntimeridian(lonlat));
      if (!repaired || repaired.length < 4) { dropped++; continue; }
      polys.push({ ring: repaired, area: Math.abs(ringArea(flat)), flat });
    }
    if (!polys.length) continue;
    polys.sort((a, b) => b.area - a.area);
    features.push({
      key: group.key,
      name: group.name,
      rings: polys.map((p) => p.ring),
      pixelArea: polys.reduce((s, p) => s + p.area, 0),
    });
  }

  // Dispersion measured in PIXEL space, before the warp. This is the only way
  // to tell a tracing bug from a warp bug: if rings are compact here and wild
  // after warping, the tracer is fine and the projection is not.
  {
    const mid = (r) => { let x = 0; let y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
    let far = 0;
    let worstName = '';
    let worstD = 0;
    for (const [label, ringList] of rings) {
      const group = grouping.groups[label - 1];
      const flats = ringList.map((ring) => ring.map((v) => [v % (raster.width + 1), Math.floor(v / (raster.width + 1))]));
      if (flats.length < 2) continue;
      const areas = flats.map((r) => Math.abs(ringArea(r)));
      const main = mid(flats[areas.indexOf(Math.max(...areas))]);
      for (const r of flats) {
        const c = mid(r);
        const d = Math.hypot(c[0] - main[0], c[1] - main[1]);
        if (d > 900) far++;
        if (d > worstD) { worstD = d; worstName = group?.name ?? String(label); }
      }
    }
    console.log(`[trace] pixel-space dispersion: ${far} rings over 900px from their province; worst ${Math.round(worstD)}px (${worstName})`);
  }
  console.log(`[trace] ${features.length} groups traced, ${dropped} degenerate rings dropped`);
  const totalPoints = features.reduce((s, f) => s + f.rings.reduce((a, r) => a + r.length, 0), 0);
  console.log(`[trace] ${totalPoints} coordinates`);
  writeFileSync(outFile, JSON.stringify({
    source: 'Victoria II provinces.bmp, traced at the pixel level and warped to lon/lat',
    width: raster.width,
    height: raster.height,
    simplifyTolerancePx: tol,
    features,
  }));
  console.log(`[trace] wrote ${outFile}`);
}

main();
