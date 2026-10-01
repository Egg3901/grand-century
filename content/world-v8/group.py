"""Stage 3: group cut pieces into gameplay provinces.

Hard rule: a province never mixes owners in any scenario, so every dated
border in every scenario falls on province edges. Within that rule pieces
are grouped by modern first-level region, then large groups are split into
contiguous, area-balanced provinces and small ones merged into a same-owner
neighbour. Target province area comes from an explicit macro-region table
(denser in historically populous regions, Victoria 2 style), so density is a
reviewed design input rather than an accident of modern subdivision counts.
"""
import json, math, sys, os
from collections import defaultdict
from pathlib import Path
import multiprocessing as mp
from shapely import from_wkb, STRtree

PIECES = Path(sys.argv[1]); OUT = Path(sys.argv[2])
QUANT = 1e5  # vertex hash grid (about 1 m)

# ---------------------------------------------------------------- density table
# Target province area in km2. Keys are ISO3 codes; REGION_RULES refine large
# countries by longitude/latitude. Tuned for roughly 1,500 land provinces.
DENSE_EUROPE = 'GBR IRL FRA BEL NLD LUX DEU CHE AUT LIE ITA SMR VAT MCO AND CZE DNK SVN POL MLT'.split()
EUROPE = 'ESP PRT GRC BGR ROU SRB HUN SVK HRV BIH ALB MKD MNE XKX UKR BLR LTU LVA EST MDA CYP'.split()
NORDIC = 'NOR SWE FIN ISL'.split()
NEAR_EAST = 'TUR SYR LBN ISR PSE JOR IRQ ARM AZE GEO EGY'.split()
SOUTH_ASIA = 'IND PAK BGD LKA NPL BTN'.split()
EAST_ASIA = 'KOR PRK TWN VNM'.split()
SE_ASIA = 'THA MMR LAO KHM MYS SGP IDN PHL BRN TLS'.split()
ARID = 'MAR DZA TUN LBY SAU YEM OMN ARE QAT BHR KWT IRN AFG TKM UZB KAZ KGZ TJK MRT ESH'.split()
CARIBBEAN = 'CUB HTI DOM JAM PRI BHS TTO BRB GRD VCT LCA DMA ATG KNA GTM BLZ HND SLV NIC CRI PAN'.split()
TABLE = {}
for iso in DENSE_EUROPE: TABLE[iso] = 6500
for iso in EUROPE: TABLE[iso] = 10000
for iso in NORDIC: TABLE[iso] = 35000
for iso in NEAR_EAST: TABLE[iso] = 20000
for iso in SOUTH_ASIA: TABLE[iso] = 20000
for iso in EAST_ASIA: TABLE[iso] = 15000
for iso in SE_ASIA: TABLE[iso] = 35000
for iso in ARID: TABLE[iso] = 70000
for iso in CARIBBEAN: TABLE[iso] = 12000
TABLE.update({'JPN': 10000, 'MEX': 35000, 'NZL': 30000, 'MNG': 150000, 'GRL': 2_500_000, 'ATA': 0})
DEFAULT_TARGET = 70000  # sub-Saharan Africa, interior South America, Pacific

SCALE = 1.5  # applied outside DENSE_EUROPE to land near ~2,000 provinces

def target_km2(iso, lon, lat):
    base = _target_km2(iso, lon, lat)
    return base if iso in DENSE_EUROPE else base * SCALE

def _target_km2(iso, lon, lat):
    if iso == 'RUS':
        if lon < 45: return 15000
        if lon < 60: return 45000
        return 220000
    if iso == 'CHN':
        if lon > 100 and lat < 42: return 18000
        return 120000
    if iso == 'USA':
        if lat > 50: return 250000  # Alaska
        return 25000 if lon > -97 else 90000
    if iso == 'CAN':
        return 40000 if lat < 50 and lon > -100 else 250000
    if iso == 'BRA':
        return 40000 if lon > -48 else 140000
    if iso == 'ARG':
        return 45000 if lat > -40 else 140000
    if iso == 'AUS':
        return 150000
    if iso in ('PER', 'BOL', 'COL', 'VEN', 'ECU'):
        return 45000 if lon < -70 or lat > 4 else 120000
    if iso in ('CHL', 'URY', 'PRY', 'GUY', 'SUR', 'GUF'):
        return 45000
    return TABLE.get(iso, DEFAULT_TARGET)

# ---------------------------------------------------------------- load
def load():
    rows = []
    for line in PIECES.open():
        r = json.loads(line)
        r['geom'] = from_wkb(bytes.fromhex(r.pop('wkb')))
        r['key'] = tuple(v for _, v in sorted(r['owners'].items()))
        rows.append(r)
    return rows

ROWS = []

def rings(g):
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if p.geom_type != 'Polygon': continue
        yield p.exterior.coords
        for r in p.interiors: yield r.coords

def seg_keys(i):
    out = []
    for coords in rings(ROWS[i]['geom']):
        prev = None
        for x, y in coords:
            q = (round(x * QUANT), round(y * QUANT))
            if prev is not None and q != prev:
                out.append(((prev, q) if prev < q else (q, prev), math.hypot(q[0] - prev[0], q[1] - prev[1]) / QUANT))
            prev = q
    return out

def adjacency(rows):
    owner = {}
    shared = defaultdict(float)
    with mp.get_context('fork').Pool(int(os.environ.get('PROCS', '6'))) as pool:
        for i, segs in enumerate(pool.imap(seg_keys, range(len(rows)), chunksize=256)):
            for k, length in segs:
                j = owner.get(k)
                if j is None: owner[k] = i
                elif j != i:
                    a, b = (j, i) if j < i else (i, j)
                    shared[(a, b)] += length
    return shared

def fallback_neighbours(rows, isolated, adj):
    """Pieces with no exact shared segments: retry with a small buffer."""
    geoms = [r['geom'] for r in rows]
    tree = STRtree(geoms)
    for i in isolated:
        probe = geoms[i].buffer(2e-5)
        for j in tree.query(probe):
            if j == i: continue
            if geoms[j].intersects(probe):
                inter = geoms[i].boundary.intersection(geoms[j].buffer(2e-5)).length
                if inter > 0:
                    adj[(min(i, j), max(i, j))] += inter

# ---------------------------------------------------------------- grouping
def compatible(a, b):
    """Owner vectors agree wherever both are known; a gap matches anything."""
    return all(x is None or y is None or x == y for x, y in zip(a, b))

def fill(a, b):
    return tuple(x if x is not None else y for x, y in zip(a, b))

class DSU:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b: self.p[max(a, b)] = min(a, b)

def main():
    global ROWS
    ROWS = load()
    n = len(ROWS)
    print('pieces', n, file=sys.stderr, flush=True)
    adj = adjacency(ROWS)
    deg = defaultdict(int)
    for a, b in adj: deg[a] += 1; deg[b] += 1
    isolated = [i for i in range(n) if deg[i] == 0]
    fallback_neighbours(ROWS, isolated, adj)
    nbrs = defaultdict(dict)
    for (a, b), l in adj.items():
        nbrs[a][b] = l; nbrs[b][a] = l
    print('edges', len(adj), 'isolated-before-fallback', len(isolated), file=sys.stderr, flush=True)

    # 1. seed groups: same ADM1 and same owner vector, connected.
    dsu = DSU(n)
    vec = {i: ROWS[i]['key'] for i in range(n)}
    for (a, b) in sorted(adj, key=lambda e: -adj[e]):
        if ROWS[a]['adm1'] != ROWS[b]['adm1']: continue
        x, y = dsu.find(a), dsu.find(b)
        if x == y or not compatible(vec[x], vec[y]): continue
        dsu.union(x, y); r = dsu.find(x); vec[r] = fill(vec[x], vec[y])
    groups = defaultdict(list)
    for i in range(n): groups[dsu.find(i)].append(i)
    print('adm1-groups', len(groups), file=sys.stderr, flush=True)

    # 2. split oversize groups into contiguous, balanced provinces.
    provinces = []
    for members in groups.values():
        area = sum(ROWS[i]['km2'] for i in members)
        lon = sum(ROWS[i]['lon'] * ROWS[i]['km2'] for i in members) / max(area, 1e-9)
        lat = sum(ROWS[i]['lat'] * ROWS[i]['km2'] for i in members) / max(area, 1e-9)
        tgt = target_km2(ROWS[members[0]]['iso'], lon, lat)
        if tgt <= 0: continue  # excluded (Antarctica)
        k = max(1, round(area / tgt)) if area > 1.5 * tgt else 1
        provinces += partition(members, k, nbrs) if k > 1 else [members]

    # 3. merge undersize provinces into the best same-owner neighbour.
    provinces = merge_small(provinces, nbrs)

    ordered = sorted(provinces, key=lambda m: (-sum(ROWS[i]['km2'] for i in m), ROWS[m[0]]['piece']))
    prov_of = {}
    for pid, members in enumerate(ordered):
        for i in members: prov_of[i] = pid
    # Province adjacency: shared land border length, plus sea links so that
    # islands are never unreachable.
    padj = defaultdict(float)
    for (a, b), l in adj.items():
        pa, pb = prov_of.get(a), prov_of.get(b)
        if pa is None or pb is None or pa == pb: continue
        padj[(min(pa, pb), max(pa, pb))] += l
    land = defaultdict(set)
    for a, b in padj: land[a].add(b); land[b].add(a)
    cent = []
    for members in ordered:
        area = sum(ROWS[i]['km2'] for i in members)
        cent.append((sum(ROWS[i]['lon'] * ROWS[i]['km2'] for i in members) / area,
                     sum(ROWS[i]['lat'] * ROWS[i]['km2'] for i in members) / area))
    sea = set()
    for pid, members in enumerate(ordered):
        if land[pid]: continue
        lon, lat = cent[pid]
        near = sorted((min((ROWS[i]['lon'] - cent[q][0]) ** 2 + (ROWS[i]['lat'] - cent[q][1]) ** 2 for i in members), q)
                      for q in range(len(ordered)) if q != pid and (cent[q][0] - lon) ** 2 + (cent[q][1] - lat) ** 2 < 400)
        if not near:  # remote islands (Chatham, Easter Island): nearest at any range
            near = sorted(((cent[q][0] - lon) ** 2 + (cent[q][1] - lat) ** 2, q) for q in range(len(ordered)) if q != pid)[:1]
        for _, q in near[:2]: sea.add((min(pid, q), max(pid, q)))
    with OUT.open('w') as out:
        for pid, members in enumerate(ordered):
            out.write(json.dumps({'members': [ROWS[i]['piece'] for i in members]}) + '\n')
    OUT.with_suffix('.adjacency.json').write_text(json.dumps({
        'land': [[a, b, round(l, 5)] for (a, b), l in sorted(padj.items())],
        'sea': sorted([list(e) for e in sea]),
    }))
    print(json.dumps({'pieces': n, 'provinces': len(provinces)}))

def partition(members, k, nbrs):
    """Grow k contiguous regions from spread-out seeds, balancing area."""
    mem = set(members)
    pts = {i: (ROWS[i]['lon'], ROWS[i]['lat']) for i in members}
    # farthest-point seeding, deterministic
    seeds = [min(members, key=lambda i: (pts[i][0], pts[i][1]))]
    while len(seeds) < k:
        far = max(members, key=lambda i: min((pts[i][0] - pts[s][0]) ** 2 + (pts[i][1] - pts[s][1]) ** 2 for s in seeds))
        if far in seeds: break
        seeds.append(far)
    label = {s: c for c, s in enumerate(seeds)}
    area = [ROWS[s]['km2'] for s in seeds]
    import heapq
    heap = []
    for c, s in enumerate(seeds):
        for j in nbrs[s]:
            if j in mem and j not in label: heapq.heappush(heap, (area[c], c, j))
    while heap:
        a, c, j = heapq.heappop(heap)
        if j in label: continue
        if a != area[c]:
            heapq.heappush(heap, (area[c], c, j)); continue
        label[j] = c; area[c] += ROWS[j]['km2']
        for t in nbrs[j]:
            if t in mem and t not in label: heapq.heappush(heap, (area[c], c, t))
    # Unreached members (disconnected islands inside the group) join the nearest seed.
    for i in members:
        if i not in label:
            label[i] = min(range(len(seeds)), key=lambda c: (pts[i][0] - pts[seeds[c]][0]) ** 2 + (pts[i][1] - pts[seeds[c]][1]) ** 2)
    out = defaultdict(list)
    for i, c in label.items(): out[c].append(i)
    return list(out.values())

NOISE_SHARE = 0.15   # a conflicting fringe below this share of its polity is source noise
UNDERSIZE = 0.5
MAX_MERGED = 2.2
ISLAND_REACH_DEG = 4.0

def merge_small(provinces, nbrs):
    scen = len(ROWS[0]['key'])
    total = [defaultdict(float) for _ in range(scen)]
    for r in ROWS:
        for s_, o in enumerate(r['key']):
            if o is not None: total[s_][o] += r['km2']
    owner_of = {}
    for pid, m in enumerate(provinces):
        for i in m: owner_of[i] = pid
    alive = {pid: list(m) for pid, m in enumerate(provinces)}
    stats = {}
    def recompute(pid):
        m = alive[pid]
        area = sum(ROWS[i]['km2'] for i in m)
        lon = sum(ROWS[i]['lon'] * ROWS[i]['km2'] for i in m) / max(area, 1e-9)
        lat = sum(ROWS[i]['lat'] * ROWS[i]['km2'] for i in m) / max(area, 1e-9)
        by = [defaultdict(float) for _ in range(scen)]
        for i in m:
            for s_, o in enumerate(ROWS[i]['key']):
                if o is not None: by[s_][o] += ROWS[i]['km2']
        vec = tuple(max(b, key=b.get) if b else None for b in by)
        stats[pid] = (area, target_km2(ROWS[m[0]]['iso'], lon, lat), lon, lat, vec, by)
    for pid in alive: recompute(pid)

    def mergeable(p, q):
        """Hard-compatible, or every conflict is a fringe of a large polity."""
        ap, tp, _, _, vp, byp = stats[p]
        vq = stats[q][4]
        for s_, (a, b) in enumerate(zip(vp, vq)):
            if a is None or b is None or a == b: continue
            if ap > UNDERSIZE * tp: return False
            if byp[s_][a] / max(total[s_][a], 1e-9) >= NOISE_SHARE: return False
        return True

    centroids = None
    changed = True
    while changed:
        changed = False
        for pid in sorted(alive, key=lambda p: stats[p][0]):
            if pid not in alive: continue
            area, tgt = stats[pid][0], stats[pid][1]
            if area >= UNDERSIZE * tgt: continue
            iso = ROWS[alive[pid][0]]['iso']
            cand = defaultdict(float)
            for i in alive[pid]:
                for j, l in nbrs[i].items():
                    q = owner_of[j]
                    if q != pid: cand[q] += l * (1.0 if ROWS[j]['iso'] == iso else 0.35)
            fits = {q: w for q, w in cand.items() if stats[q][0] + area <= MAX_MERGED * max(tgt, stats[q][1])}
            # A fully compatible neighbour always wins; the source-noise
            # exception only applies when no such neighbour exists. Otherwise a
            # small core area (Berlin) can be absorbed by a foreign neighbour.
            hard = {q: w for q, w in fits.items() if compatible(stats[pid][4], stats[q][4])}
            cand = hard or {q: w for q, w in fits.items() if mergeable(pid, q)}
            if not cand:
                # Islands and exclaves: nearest mergeable province within reach.
                lon, lat = stats[pid][2], stats[pid][3]
                best_d, best = None, None
                for rule in (lambda q: compatible(stats[pid][4], stats[q][4]), lambda q: mergeable(pid, q)):
                  if best is not None: break
                  for q in alive:
                    if q == pid: continue
                    d = (stats[q][2] - lon) ** 2 + (stats[q][3] - lat) ** 2
                    if d > ISLAND_REACH_DEG ** 2 * 4: continue
                    d = min((ROWS[i]['lon'] - lon) ** 2 + (ROWS[i]['lat'] - lat) ** 2 for i in alive[q])
                    if d <= ISLAND_REACH_DEG ** 2 and (best_d is None or d < best_d) and rule(q) \
                            and stats[q][0] + area <= MAX_MERGED * max(tgt, stats[q][1]):
                        best_d, best = d, q
                if best is None: continue
                cand = {best: 1.0}
            best = max(cand, key=lambda q: (cand[q], -q))
            for i in alive[pid]: owner_of[i] = best
            alive[best] += alive.pop(pid)
            stats.pop(pid); recompute(best)
            changed = True
    return list(alive.values())

if __name__ == '__main__':
    main()
