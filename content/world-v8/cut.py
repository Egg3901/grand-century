"""Stage 2: cut atoms along every scenario's dated polity borders.

Each atom is tested against each scenario layer (compiled world-borders).
An atom wholly inside one polity takes that owner. An atom crossed by a
border is cut only when the minority side is significant; slivers from
source misregistration fold into the dominant side. The result is a set of
pieces whose union equals the atoms and whose owner vector (one owner per
scenario) is uniform inside each piece, so every scenario's borders are
representable by whole pieces.

Polity polygons are pre-clipped to a 1 degree grid so every intersection
runs against small geometries; layers load once in the parent and are
shared with forked workers.
"""
import json, math, sys, os
from collections import defaultdict
from pathlib import Path
import multiprocessing as mp
from shapely import from_wkb, to_wkb, prepare, STRtree, make_valid, unary_union, box
from shapely.geometry import shape, MultiPolygon, Polygon

ATOMS = Path(sys.argv[1]); OUT = Path(sys.argv[2]); LAYERS = sys.argv[3:]
MIN_PIECE_KM2 = 150.0      # never cut off less than this
MIN_PIECE_SHARE = 0.12     # ... or less than this share of the atom

def protected_keys():
    """1830 polities kept as their own provinces however small (free cities,
    small German states): marked "protect" in new-nations-1830.json, plus the
    keys folded into them."""
    path = Path(__file__).with_name('new-nations-1830.json')
    if not path.exists(): return set()
    d = json.loads(path.read_text())
    tags = {n['tag'] for n in d['nations'] if n.get('protect')}
    keys = {n['polityKey'] for n in d['nations'] if n.get('protect')}
    keys |= {k for k, f in d.get('folds', {}).items() if f['to'] in tags}
    return keys

PROTECTED = protected_keys()
PROTECTED_MIN_KM2 = 20.0
R = 6371.0088
KM2_PER_DEG2 = (math.pi / 180 * R) ** 2

def km2(g):
    # Planar area scaled by cos(latitude) of the centroid: fast and adequate for gates.
    if g.is_empty: return 0.0
    return g.area * KM2_PER_DEG2 * math.cos(math.radians(g.centroid.y))

def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if hasattr(g, 'geoms'):
        out = []
        for x in g.geoms: out += polys(x)
        return out
    return []

def as_area(g):
    p = [x for x in polys(g) if x.area > 0]
    return MultiPolygon(p) if len(p) > 1 else (p[0] if p else Polygon())

MAX_TILE_COORDS = 1500

def tiles_of(g):
    """Recursively halve along the longer side until each piece is small."""
    stack = [g]
    while stack:
        cur = stack.pop()
        if cur.is_empty: continue
        n = sum(len(p.exterior.coords) + sum(len(r.coords) for r in p.interiors) for p in polys(cur))
        minx, miny, maxx, maxy = cur.bounds
        if n <= MAX_TILE_COORDS or max(maxx - minx, maxy - miny) < 0.05:
            yield cur; continue
        if maxx - minx >= maxy - miny:
            mid = (minx + maxx) / 2
            halves = (box(minx, miny, mid, maxy), box(mid, miny, maxx, maxy))
        else:
            mid = (miny + maxy) / 2
            halves = (box(minx, miny, maxx, mid), box(minx, mid, maxx, maxy))
        for h in halves:
            stack.append(as_area(cur.intersection(h)))

def load_layer(path):
    """Exclusive polity polygons: the smallest polygon wins any overlap.

    Matches the seed compiler's rule, so a dependency drawn inside its
    overlord (an Indian princely state inside Company territory) keeps its
    own land and the overlord keeps the rest.
    """
    d = json.load(open(path))
    raw = []
    for f in d['featureCollection']['features']:
        g = shape(f['geometry'])
        if not g.is_valid: g = make_valid(g)
        g = as_area(g)
        if not g.is_empty: raw.append((g.area, f['properties']['polityKey'], g))
    raw.sort(key=lambda r: (r[0], r[1]))
    placed = []
    geoms, keys = [], []
    for _, key, g in raw:
        prior = [p for p in placed if p.intersects(g)]
        if prior:
            g = as_area(make_valid(g.difference(unary_union(prior))))
            if g.is_empty: continue
        placed.append(g)
        for t in tiles_of(g):
            prepare(t); geoms.append(t); keys.append(key)
    return d['asOf'], geoms, keys, STRtree(geoms)

LAYER_DATA = []

def shares(piece, layer):
    """Area of the piece inside each polity of one layer."""
    _, geoms, keys, tree = layer
    out = defaultdict(float)
    for j in tree.query(piece):
        g = geoms[j]
        if g.contains(piece):
            out[keys[j]] += piece.area
        else:
            a = g.intersection(piece).area
            if a > 0: out[keys[j]] += a
    return out

def split(piece, layer, sh):
    total = piece.area
    if not sh: return None
    if max(sh.values()) >= total * 0.999: return None
    total_km2 = km2(piece)
    big = [k for k, a in sh.items() if (a / total * total_km2 >= MIN_PIECE_KM2 and a / total >= MIN_PIECE_SHARE)
           or (k in PROTECTED and a / total * total_km2 >= PROTECTED_MIN_KM2)]
    if len(big) <= 1: return None
    _, geoms, keys, tree = layer
    parts = {k: [] for k in big}
    for j in tree.query(piece):
        if keys[j] in parts:
            parts[keys[j]].append(geoms[j].intersection(piece))
    merged = [[k, as_area(make_valid(unary_union(v)))] for k, v in parts.items()]
    rest = piece.difference(unary_union([m[1] for m in merged]))
    for frag in polys(rest):
        if frag.area <= 0: continue
        probe = frag.buffer(1e-7)
        tgt = max(merged, key=lambda m: m[1].intersection(probe).area)
        tgt[1] = as_area(make_valid(tgt[1].union(frag)))
    return [m[1] for m in merged if not m[1].is_empty]

def owner(sh, total):
    if not sh: return None
    k, a = max(sh.items(), key=lambda kv: kv[1])
    return k if a > 0 else None

def work(line):
    a = json.loads(line)
    g = from_wkb(bytes.fromhex(a['wkb']))
    pieces = [g]
    for layer in LAYER_DATA:
        nxt = []
        for p in pieces:
            s = split(p, layer, shares(p, layer))
            nxt += s if s else [p]
        pieces = nxt
    out = []
    for i, p in enumerate(pieces):
        rp = p.representative_point()
        owners = {layer[0]: owner(shares(p, layer), p.area) for layer in LAYER_DATA}
        out.append({**{k: a[k] for k in ('atom', 'shapeID', 'name', 'iso', 'adm1', 'adm1Name')},
                    'piece': f"{a['atom']}-{i}" if len(pieces) > 1 else a['atom'],
                    'km2': round(km2(p), 3), 'lon': round(rp.x, 5), 'lat': round(rp.y, 5),
                    'owners': owners, 'wkb': to_wkb(p, hex=True)})
    return out

if __name__ == '__main__':
    LAYER_DATA.extend(load_layer(p) for p in LAYERS)
    print('layers', [(l[0], len(l[1])) for l in LAYER_DATA], file=sys.stderr, flush=True)
    lines = ATOMS.read_text().splitlines()
    n_cut = 0; n = 0
    ctx = mp.get_context('fork')
    with ctx.Pool(int(os.environ.get('PROCS', '6'))) as pool, OUT.open('w') as out:
        for i, res in enumerate(pool.imap(work, lines, chunksize=32)):
            if len(res) > 1: n_cut += 1
            for r in res:
                out.write(json.dumps(r, ensure_ascii=False) + '\n'); n += 1
            if i % 2000 == 0: print(i, n, n_cut, file=sys.stderr, flush=True)
    print(json.dumps({'atoms': len(lines), 'pieces': n, 'cutAtoms': n_cut, 'scenarios': [l[0] for l in LAYER_DATA]}))
