/**
 * Build the province grouping table: which Victoria II regions get lumped into
 * one Grand Century province.
 *
 * Adjacency and shared border length are measured off the raster itself, so a
 * merge is only ever between regions that genuinely touch, and the pair chosen
 * is the one sharing the most border. That keeps merged provinces compact
 * instead of producing tendrils.
 *
 * Two hard constraints:
 *  - never merge across owners, because compileHistoricalWorld rejects a state
 *    that crosses owners and the whole nationality cut depends on it
 *  - never merge across continents, which stops an island being absorbed into
 *    the mainland it happens to sit nearest
 *
 * Usage: node content/vic2/build-grouping.mjs [--target 300]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TGC = path.join(ROOT, 'content', 'raw', 'tgc');

function readRaster() {
  const buf = readFileSync(path.join(TGC, 'provinces.bmp'));
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const stride = (((width * 24 + 31) / 32) | 0) * 4;
  const text = readFileSync(path.join(TGC, 'definition.csv'), 'latin1');
  const rgbToId = new Map();
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(';');
    if (c.length < 4 || !/^\d+$/.test(c[0])) continue;
    rgbToId.set((Number(c[1]) << 16) | (Number(c[2]) << 8) | Number(c[3]), Number(c[0]));
  }
  const grid = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = bottomUp ? height - 1 - y : y;
    let p = offset + src * stride;
    const dst = y * width;
    for (let x = 0; x < width; x++, p += 3) {
      grid[dst + x] = rgbToId.get((buf[p + 2] << 16) | (buf[p + 1] << 8) | buf[p]) ?? 0;
    }
  }
  return { grid, width, height };
}

function main() {
  const args = process.argv.slice(2);
  const target = args.includes('--target') ? Number(args[args.indexOf('--target') + 1]) : 300;

  const ref = JSON.parse(readFileSync(path.join(ROOT, 'content/vic2/vic2-reference.json'), 'utf8'));
  const dm = readFileSync(path.join(TGC, 'default.map'), 'latin1').replace(/#[^\n]*/g, '');
  const seaMatch = dm.match(/sea_starts\s*=\s*\{([\s\S]*?)\}/);
  const seas = new Set((seaMatch ? seaMatch[1].match(/\d+/g) : []).map(Number));

  // Vic2 ships 1836 ownership; the campaign starts in 1830. Apply the rollback
  // deltas BEFORE grouping, or a merge happily crosses a border that existed at
  // the start date: Congress Poland, Flanders, Texas, Ottoman Syria and the
  // Grand Duchy of Finland all get absorbed into their 1836 owner and stop
  // existing as nations.
  const deltas = JSON.parse(readFileSync(path.join(TGC, '..', '..', 'vic2', 'vic2-1830-deltas.json'), 'utf8'));
  const ownerOverride = new Map(deltas.ownership.map((d) => [d.regionKey, d.to]));

  // seed groups: one per Vic2 region
  const groups = ref.regions
    .map((r) => {
      let owner = ownerOverride.get(r.key) ?? r.dominantOwner1836 ?? 'UNC';
      if (['GXI', 'YNN', 'XBI', 'MCK'].includes(owner)) owner = 'CHI';
      if (r.key === 'USA_106' || r.key === 'USA_129') owner = 'USA';
      return {
        key: r.key,
        name: r.name,
        owner,
        continent: r.continent ?? '?',
        provinceIds: (r.provinceIds ?? []).filter((p) => !seas.has(p)),
        merged: [r.key],
      };
    })
    .filter((g) => g.provinceIds.length);

  const groupOf = new Int32Array(65536).fill(-1);
  groups.forEach((g, i) => g.provinceIds.forEach((p) => { if (p < 65536) groupOf[p] = i; }));

  const { grid, width, height } = readRaster();

  // Province-level shared borders too. The raster is a MOD's map and carries
  // land the vanilla region lists never mention: 283 provinces, 8.3% of all
  // land, which belonged to no group and therefore traced as ocean. Cornwall
  // vanished, Anatolia had a gash through it and holes opened across Russia.
  const provBorder = new Map();
  const bumpProv = (a, b) => {
    if (a === b || !a || !b) return;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    provBorder.set(k, (provBorder.get(k) ?? 0) + 1);
  };

  // shared border length between groups, measured on the raster
  const border = new Map();
  const bump = (a, b) => {
    if (a === b || a < 0 || b < 0) return;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    border.set(k, (border.get(k) ?? 0) + 1);
  };
  const size = new Float64Array(groups.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pid = grid[row + x];
      const right = x + 1 < width ? grid[row + x + 1] : 0;
      const down = y + 1 < height ? grid[row + width + x] : 0;
      if (pid && !seas.has(pid)) {
        if (right && !seas.has(right)) bumpProv(pid, right);
        if (down && !seas.has(down)) bumpProv(pid, down);
      }
      const g = pid < 65536 ? groupOf[pid] : -1;
      if (g < 0) continue;
      size[g] += 1;
      if (x + 1 < width) bump(g, right < 65536 ? groupOf[right] : -1);
      if (y + 1 < height) bump(g, down < 65536 ? groupOf[down] : -1);
    }
  }

  // Absorb every unassigned land province into the neighbouring group it shares
  // the most border with, repeating so chains of them resolve inward.
  const provNeighbours = new Map();
  for (const [k, len] of provBorder) {
    const [a, b] = k.split(':').map(Number);
    if (!provNeighbours.has(a)) provNeighbours.set(a, new Map());
    if (!provNeighbours.has(b)) provNeighbours.set(b, new Map());
    provNeighbours.get(a).set(b, len);
    provNeighbours.get(b).set(a, len);
  }
  // Every land province on the raster, not just those with a land neighbour:
  // an island surrounded entirely by sea has no neighbour to absorb it and
  // would otherwise stay unassigned and trace as open water.
  const pixels = JSON.parse(readFileSync(path.join(TGC, 'tgc-province-pixels.json'), 'utf8'));
  const centroids = new Map(Object.entries(pixels.centroids).map(([k, v]) => [Number(k), v]));
  const landIds = [...centroids.keys()].filter((p) => !seas.has(p));
  let absorbed = 0;
  for (let pass = 0; pass < 40; pass++) {
    const pending = landIds.filter((p) => p < 65536 && groupOf[p] < 0);
    if (!pending.length) break;
    let progress = 0;
    for (const pid of pending) {
      let best = -1;
      let bestLen = -1;
      for (const [n, len] of provNeighbours.get(pid) ?? []) {
        const g = n < 65536 ? groupOf[n] : -1;
        if (g < 0) continue;
        if (len > bestLen) { bestLen = len; best = g; }
      }
      if (best < 0) continue;
      groupOf[pid] = best;
      groups[best].provinceIds.push(pid);
      absorbed += 1;
      progress += 1;
    }
    if (!progress) break;
  }
  // Islands with no land neighbour: attach to the nearest group by centroid.
  let islands = 0;
  for (const pid of landIds) {
    if (pid >= 65536 || groupOf[pid] >= 0) continue;
    const c = centroids.get(pid);
    if (!c) continue;
    let best = -1;
    let bestD = Infinity;
    for (const other of landIds) {
      if (other >= 65536 || groupOf[other] < 0) continue;
      const o = centroids.get(other);
      if (!o) continue;
      const d = (o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2;
      if (d < bestD) { bestD = d; best = groupOf[other]; }
    }
    if (best < 0) continue;
    groupOf[pid] = best;
    groups[best].provinceIds.push(pid);
    islands += 1;
  }
  const orphans = landIds.filter((p) => p < 65536 && groupOf[p] < 0);
  const coveredPx = landIds.filter((p) => p < 65536 && groupOf[p] >= 0)
    .reduce((s2, p) => s2 + (centroids.get(p)?.[2] ?? 0), 0);
  const totalPx = landIds.reduce((s2, p) => s2 + (centroids.get(p)?.[2] ?? 0), 0);
  console.log(`[grouping] absorbed ${absorbed} land provinces + ${islands} islands; land pixel coverage ${(100 * coveredPx / totalPx).toFixed(2)}%`);
  if (orphans.length) {
    throw new Error(`[grouping] ${orphans.length} land provinces belong to no group; they would trace as ocean`);
  }

  const neighbours = groups.map(() => new Map());
  for (const [k, len] of border) {
    const [a, b] = k.split(':').map(Number);
    neighbours[a].set(b, len);
    neighbours[b].set(a, len);
  }

  // Content is keyed by province NAME: minority rules, nationality groups,
  // placeholder rules, formable core lookups and the 1830 anchors. Merging
  // renames provinces, so without this every retarget silently detaches a pile
  // of content and the lints light up. Protect the names content references:
  // never merge two of them together, and when one side is protected the merged
  // province keeps that name.
  let protectedNames = new Set();
  try {
    protectedNames = new Set(JSON.parse(readFileSync(path.join(TGC, 'protected-names.json'), 'utf8')));
  } catch { /* optional */ }
  const isProtected = (i) => protectedNames.has(groups[i].name);

  const alive = groups.map(() => true);
  const canMerge = (a, b) => alive[b]
    && groups[a].owner === groups[b].owner
    && groups[a].continent === groups[b].continent
    && !(isProtected(a) && isProtected(b));

  // Reduce every owner by the same proportion. A flat global target merges
  // whichever regions happen to be smallest, which means dense Europe gets
  // flattened to one province per country while sparse Russia and the Sahara
  // keep theirs. France is not one province.
  const byOwner = new Map();
  groups.forEach((g, i) => {
    if (!byOwner.has(g.owner)) byOwner.set(g.owner, []);
    byOwner.get(g.owner).push(i);
  });
  const ratio = target / groups.length;
  const ownerTarget = new Map();
  for (const [owner, list] of byOwner) ownerTarget.set(owner, Math.max(1, Math.round(list.length * ratio)));
  const ownerCount = new Map([...byOwner].map(([o, l]) => [o, l.length]));

  for (;;) {
    // smallest living group whose owner is still above its share
    let pick = -1;
    for (let i = 0; i < groups.length; i++) {
      if (!alive[i]) continue;
      if (ownerCount.get(groups[i].owner) <= ownerTarget.get(groups[i].owner)) continue;
      if (![...neighbours[i].keys()].some((n) => canMerge(i, n))) continue;
      if (pick < 0 || size[i] < size[pick]) pick = i;
    }
    if (pick < 0) break;
    let best = -1;
    let bestLen = -1;
    for (const [n, len] of neighbours[pick]) {
      if (!canMerge(pick, n)) continue;
      if (len > bestLen) { bestLen = len; best = n; }
    }
    if (best < 0) break;
    // absorb pick into best
    groups[best].provinceIds.push(...groups[pick].provinceIds);
    groups[best].merged.push(...groups[pick].merged);
    if (isProtected(pick) && !isProtected(best)) groups[best].name = groups[pick].name;
    else if (!isProtected(best) && size[pick] > size[best]) groups[best].name = groups[pick].name;
    size[best] += size[pick];
    for (const [n, len] of neighbours[pick]) {
      if (n === best) continue;
      neighbours[best].set(n, (neighbours[best].get(n) ?? 0) + len);
      neighbours[n].set(best, (neighbours[n].get(best) ?? 0) + len);
      neighbours[n].delete(pick);
    }
    neighbours[best].delete(pick);
    alive[pick] = false;
    ownerCount.set(groups[pick].owner, ownerCount.get(groups[pick].owner) - 1);
  }

  const out = groups
    .map((g, i) => ({ ...g, i }))
    .filter((g) => alive[g.i])
    .map((g) => ({ key: g.key, name: g.name, owner: g.owner, continent: g.continent, provinceIds: g.provinceIds, merged: g.merged }));

  const sizes = out.map((g) => g.merged.length);
  console.log(`[grouping] ${groups.length} Vic2 regions -> ${out.length} provinces (target ${target})`);
  console.log(`[grouping] regions per province: min ${Math.min(...sizes)} max ${Math.max(...sizes)} mean ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2)}`);
  writeFileSync(path.join(TGC, 'grouping.json'), JSON.stringify({ tier: `merged-${target}`, groups: out }));
  console.log(`[grouping] wrote grouping.json`);
}

main();
