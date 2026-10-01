"""Stage 8: runtime province geometry.

Input is mapshaper's topology-preserving simplification of the full
resolution export (shared borders simplified once, so neighbours stay
vertex-identical). Simplification can pinch rings; each feature is repaired
on its own, and a feature that collapses falls back to a lightly simplified
copy of its full-resolution geometry, so no province is ever dropped.
Coordinates are quantized to 1e-4 degrees (about 11 m) for size.
"""
import json, sys
from pathlib import Path
from shapely import make_valid, set_precision
from shapely.geometry import shape, mapping, MultiPolygon, Polygon

SIMPLIFIED, FULL, OUT = [Path(p) for p in sys.argv[1:4]]
GRID = 1e-4

def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if hasattr(g, 'geoms'):
        out = []
        for x in g.geoms: out += polys(x)
        return out
    return []

def area_only(g):
    p = [x for x in polys(g) if x.area > 0]
    return MultiPolygon(p) if len(p) > 1 else (p[0] if p else Polygon())

def rounded(coords):
    return [[round(x, 4), round(y, 4)] for x, y in coords]

def to_geojson(g):
    parts = polys(g)
    rings = [[rounded(p.exterior.coords)] + [rounded(r.coords) for r in p.interiors] for p in parts]
    if len(rings) == 1: return {'type': 'Polygon', 'coordinates': rings[0]}
    return {'type': 'MultiPolygon', 'coordinates': rings}

full = {f['properties']['id']: f for f in json.load(open(FULL))['features']}
simp = {f['properties']['id']: f for f in json.load(open(SIMPLIFIED))['features']}
out, repaired, fallback = [], 0, 0
for pid in sorted(full):
    f = simp.get(pid)
    g = shape(f['geometry']) if f and f.get('geometry') else Polygon()
    if not g.is_valid:
        g = area_only(make_valid(g)); repaired += 1
    g = area_only(set_precision(g, GRID)) if not g.is_empty else g
    if g.is_empty or not g.is_valid:
        src = shape(full[pid]['geometry'])
        g = area_only(set_precision(src.simplify(0.002, preserve_topology=True), GRID))
        fallback += 1
    out.append({'type': 'Feature', 'id': pid, 'properties': {'id': pid}, 'geometry': to_geojson(g)})
OUT.write_text(json.dumps({'type': 'FeatureCollection', 'features': out}, separators=(',', ':')))
print(json.dumps({'features': len(out), 'repaired': repaired, 'fallback': fallback, 'bytes': OUT.stat().st_size}))
