"""Stage 1: global atoms from geoBoundaries CGAZ ADM2, parented to ADM1.

Atoms are the smallest land units the map is assembled from. Every province
border in the shipped map is an atom edge, so borders follow real
administrative lines (rivers, ridges, historic counties) instead of generated
chords. Output is newline-delimited JSON with WKB-hex geometry.
"""
import json, math, sys, hashlib
from pathlib import Path
from shapely import from_geojson, to_wkb, make_valid, area, STRtree
from shapely.geometry import shape, mapping, MultiPolygon, Polygon
from shapely.ops import transform

SRC = Path(sys.argv[1])  # directory holding geoBoundariesCGAZ_ADM{1,2}.geojson
OUT = Path(sys.argv[2])

R = 6371.0088
def equal_area_km2(geom):
    # Lambert cylindrical equal-area; adequate for relative sizing and gates.
    g = transform(lambda x, y, z=None: (math.radians(x) * R, math.sin(math.radians(max(-89.9999, min(89.9999, y)))) * R), geom)
    return g.area

def polygons(geom):
    if geom.is_empty: return []
    if geom.geom_type == 'Polygon': return [geom]
    if geom.geom_type == 'MultiPolygon': return list(geom.geoms)
    if hasattr(geom, 'geoms'):
        out = []
        for g in geom.geoms: out += polygons(g)
        return out
    return []

def clean(geom):
    if not geom.is_valid: geom = make_valid(geom)
    parts = [p for p in polygons(geom) if p.area > 0]
    return MultiPolygon(parts) if len(parts) > 1 else (parts[0] if parts else Polygon())

def load(name):
    d = json.loads((SRC / name).read_text())
    return d['features']

adm1 = load('geoBoundariesCGAZ_ADM1.geojson')
adm1_geoms = [clean(shape(f['geometry'])) for f in adm1]
tree = STRtree(adm1_geoms)
adm2 = load('geoBoundariesCGAZ_ADM2.geojson')
stats = {'adm2': len(adm2), 'empty': 0, 'unparented': 0}
with OUT.open('w') as out:
    for i, f in enumerate(adm2):
        g = clean(shape(f['geometry']))
        if g.is_empty:
            stats['empty'] += 1; continue
        p = f['properties']
        rp = g.representative_point()
        parent = None
        for j in tree.query(g):
            inter = adm1_geoms[j].intersection(g).area if adm1_geoms[j].intersects(rp) or True else 0
            if inter > 0 and (parent is None or inter > parent[1]): parent = (int(j), inter)
        if parent is None: stats['unparented'] += 1
        a1 = adm1[parent[0]]['properties'] if parent else {}
        rec = {
            'atom': hashlib.sha1(p['shapeID'].encode()).hexdigest()[:12],
            'shapeID': p['shapeID'], 'name': p['shapeName'], 'iso': p['shapeGroup'],
            'adm1': a1.get('shapeID'), 'adm1Name': a1.get('shapeName'),
            'km2': round(equal_area_km2(g), 3),
            'lon': round(rp.x, 5), 'lat': round(rp.y, 5),
            'parts': len(polygons(g)),
            'wkb': to_wkb(g, hex=True),
        }
        out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        if i % 5000 == 0: print(i, file=sys.stderr, flush=True)
print(json.dumps(stats))
