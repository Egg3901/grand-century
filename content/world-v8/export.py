"""Stage 4: dissolve pieces into province polygons.

Writes full-resolution province GeoJSON with provisional ids, the owner per
scenario, area, modern ISO and first-level region names. Topology-safe
simplification and runtime assets are produced downstream by mapshaper so
shared borders stay vertex-identical.
"""
import json, math, sys, os
from collections import Counter
from pathlib import Path
import multiprocessing as mp
from shapely import from_wkb, unary_union, make_valid, set_precision
from shapely.geometry import mapping, MultiPolygon, Polygon

PIECES = Path(sys.argv[1]); PROVINCES = Path(sys.argv[2]); OUT = Path(sys.argv[3])
GRID = 1e-6

PIECE = {}

def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if hasattr(g, 'geoms'):
        out = []
        for x in g.geoms: out += polys(x)
        return out
    return []

def dissolve(args):
    pid, members = args
    rows = [PIECE[m] for m in members]
    geoms = [set_precision(from_wkb(bytes.fromhex(r['wkb'])), GRID) for r in rows]
    g = make_valid(unary_union(geoms))
    parts = [p for p in polys(g) if p.area > 0]
    g = MultiPolygon(parts) if len(parts) > 1 else parts[0]
    area = sum(r['km2'] for r in rows)
    owners = {}
    for r in rows:
        for scen, o in r['owners'].items():
            if o is not None: owners.setdefault(scen, Counter())[o] += r['km2']
    big = max(rows, key=lambda r: r['km2'])
    return {
        'type': 'Feature', 'id': pid,
        'properties': {
            'id': pid, 'km2': round(area, 1),
            'iso': Counter(r['iso'] for r in rows).most_common(1)[0][0],
            'adm1Name': Counter(r['adm1Name'] for r in rows).most_common(1)[0][0],
            'largestUnit': big['name'],
            'owners': {s: c.most_common(1)[0][0] for s, c in sorted(owners.items())},
            'pieces': len(rows),
        },
        'geometry': mapping(g),
    }

if __name__ == '__main__':
    for line in PIECES.open():
        r = json.loads(line); PIECE[r['piece']] = r
    provs = [json.loads(l)['members'] for l in PROVINCES.open()]
    with mp.get_context('fork').Pool(int(os.environ.get('PROCS', '6'))) as pool:
        feats = list(pool.imap(dissolve, list(enumerate(provs)), chunksize=8))
    OUT.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats}, ensure_ascii=False))
    print(json.dumps({'provinces': len(feats), 'bytes': OUT.stat().st_size}))
