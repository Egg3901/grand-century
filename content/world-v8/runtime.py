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
from shapely import STRtree
from shapely.geometry import shape, mapping, MultiPolygon, Polygon, Point

SIMPLIFIED, FULL, OUT = [Path(p) for p in sys.argv[1:4]]
ROOT = Path(__file__).resolve().parents[2]
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

def rounded(coords, digits=4):
    return [[round(x, digits), round(y, digits)] for x, y in coords]

def ring_ok(ring):
    """A closed ring needs at least three distinct points after rounding."""
    return len({tuple(pt) for pt in ring}) >= 3 and len(ring) >= 4

def dedupe(ring):
    out = []
    for pt in ring:
        if not out or out[-1] != pt: out.append(pt)
    return out

def to_geojson(g, digits=4):
    parts = polys(g)
    rings = []
    for p in parts:
        shell = dedupe(rounded(p.exterior.coords, digits))
        if not ring_ok(shell): continue
        holes = [h for h in (dedupe(rounded(r.coords, digits)) for r in p.interiors) if ring_ok(h)]
        rings.append([shell] + holes)
    if len(rings) == 1: return {'type': 'Polygon', 'coordinates': rings[0]}
    return {'type': 'MultiPolygon', 'coordinates': rings}

full = {f['properties']['id']: f for f in json.load(open(FULL))['features']}

# Places that must stay on land: curated 1830 cities and geography-contract
# points. Simplification can erase lagoon and harbour islands (Venice).
anchors = [(c['lon'], c['lat']) for c in json.loads((ROOT / 'content/history/1830/cities.json').read_text())['cities']]
contract = json.loads((ROOT / 'content/history/1830/geography-contract.json').read_text())
anchors += [tuple(p['point']) for p in contract.get('points', []) if 'point' in p]
full_geoms = {pid: shape(f['geometry']) for pid, f in full.items()}
ids = list(full_geoms)
tree = STRtree([full_geoms[i] for i in ids])
restore = {}
for lon, lat in anchors:
    pt = Point(lon, lat)
    for j in tree.query(pt):
        pid = ids[j]
        g = full_geoms[pid]
        if not g.contains(pt): continue
        # Only the real land within ~5 km of the anchor, so a restore never
        # overlaps neighbouring provinces' simplified edges.
        local = area_only(g.intersection(pt.buffer(0.05)))
        if not local.is_empty: restore.setdefault(pid, []).append((pt, local))
simp = {f['properties']['id']: f for f in json.load(open(SIMPLIFIED))['features']}
out, repaired, fallback, restored = [], 0, 0, 0
final = {}
for pid in sorted(full):
    f = simp.get(pid)
    g = shape(f['geometry']) if f and f.get('geometry') else Polygon()
    if not g.is_valid:
        g = area_only(make_valid(g)); repaired += 1
    for pt, local in restore.get(pid, []):
        if not g.contains(pt):
            g = area_only(make_valid(g.union(local.simplify(0.0005, preserve_topology=True))))
            restored += 1
    # Coordinates arrive already snapped on the shared topology (mapshaper
    # precision); snapping per feature here would split shared vertices.
    if g.is_empty or not g.is_valid:
        src = shape(full[pid]['geometry'])
        g = area_only(set_precision(src.simplify(0.002, preserve_topology=True), GRID))
        fallback += 1
    final[pid] = g
# Residual overlaps (simplifier repairs, per-feature validity fixes): the
# larger province keeps the overlap and the smaller takes the difference, so
# the edge it gains follows its neighbour's exactly.
order = sorted(final)
resolved = 0
# Resolved edges meet the neighbour at intersection points off the 1e-4 grid;
# those provinces are written at 1e-7 so rounding cannot reopen the overlap.
precise = set()
for _pass in range(3):
  gtree = STRtree([final[pid] for pid in order])
  for i, pid in enumerate(order):
    for j in gtree.query(final[pid]):
        other = order[int(j)]
        if other <= pid: continue
        a, b = final[pid], final[other]
        if not a.intersects(b): continue
        inter = a.intersection(b)
        if inter.area <= 1e-10: continue
        small, big = (pid, other) if a.area < b.area else (other, pid)
        # Snap the cut to the output grid so rounding cannot reopen the overlap.
        cut = area_only(make_valid(final[small].difference(final[big])))
        if not cut.is_empty:
            final[small] = cut; resolved += 1; precise.add(small)
for pid in order:
    out.append({'type': 'Feature', 'id': pid, 'properties': {'id': pid},
                'geometry': to_geojson(final[pid], 7 if pid in precise else 4)})
OUT.write_text(json.dumps({'type': 'FeatureCollection', 'features': out}, separators=(',', ':')))
print(json.dumps({'features': len(out), 'repaired': repaired, 'fallback': fallback, 'restored': restored, 'overlapsResolved': resolved, 'bytes': OUT.stat().st_size}))
