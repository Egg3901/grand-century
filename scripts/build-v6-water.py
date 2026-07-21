#!/usr/bin/env python3
"""
Bake Natural Earth 10m rivers + lakes to static geojson for the map.

Rivers: keep only named rivers (name field present), decimate lightly.
Lakes: keep all, decimate ring density.
Both output to src/data/generated/rivers.geo.json / lakes.geo.json.
"""

import json
import os

def decimate_line(line, tol=0.05):
    if len(line) <= 2:
        return line
    out = [line[0]]
    lx, ly = line[0]
    for x, y in line[1:-1]:
        if (x - lx) ** 2 + (y - ly) ** 2 >= tol * tol:
            out.append([x, y])
            lx, ly = x, y
    out.append(line[-1])
    return out

def decimate_ring(ring, tol=0.035):
    return decimate_line(ring, tol)

def round_coords(o, nd=4):
    if isinstance(o, list):
        if o and isinstance(o[0], (int, float)):
            return [round(v, nd) for v in o]
        return [round_coords(x, nd) for x in o]
    return o

# --- rivers: scalerank ≤ 6 = major + regional rivers (atlas-plate detail) ---
r = json.load(open('/tmp/ne_rivers.geojson'))
river_feats = []
for f in r['features']:
    name = f['properties'].get('name')
    rank = f['properties'].get('scalerank', 9)
    if not name or rank > 6:
        continue
    g = f['geometry']
    lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    lines = [decimate_line(l) for l in lines]
    lines = [l for l in lines if len(l) >= 2]
    if not lines:
        continue
    geom = {'type': 'LineString', 'coordinates': lines[0]} if len(lines) == 1 else {'type': 'MultiLineString', 'coordinates': lines}
    river_feats.append({'type': 'Feature', 'properties': {'n': name}, 'geometry': geom})

out = {'type': 'FeatureCollection', 'features': river_feats}
for f in out['features']:
    f['geometry']['coordinates'] = round_coords(f['geometry']['coordinates'])
json.dump(out, open('src/data/generated/rivers.geo.json', 'w'), separators=(',', ':'))
print('rivers:', len(river_feats), 'size:', os.path.getsize('src/data/generated/rivers.geo.json'))

# --- lakes: scalerank ≤ 5 = the ones an 1850 atlas would name ---
l = json.load(open('/tmp/ne_lakes.geojson'))
lake_feats = []
for f in l['features']:
    if f['properties'].get('scalerank', 9) > 5:
        continue
    g = f['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    polys = [[decimate_ring(ring) for ring in poly] for poly in polys]
    polys = [p for p in polys if len(p[0]) >= 4]
    if not polys:
        continue
    geom = {'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1 else {'type': 'MultiPolygon', 'coordinates': polys}
    lake_feats.append({'type': 'Feature', 'properties': {'n': f['properties'].get('name', '')}, 'geometry': geom})

out = {'type': 'FeatureCollection', 'features': lake_feats}
for f in out['features']:
    f['geometry']['coordinates'] = round_coords(f['geometry']['coordinates'])
json.dump(out, open('src/data/generated/lakes.geo.json', 'w'), separators=(',', ':'))
print('lakes:', len(lake_feats), 'size:', os.path.getsize('src/data/generated/lakes.geo.json'))
