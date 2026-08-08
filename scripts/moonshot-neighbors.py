#!/usr/bin/env python3
"""Recompute province neighbors + coastal flags from the V7 tessellation.
Shared 4dp edge segments => neighbors. A province with any boundary segment
unshared by another province touches sea => coastal (approximation that holds
because V7 tessellates land completely)."""
import json
from collections import defaultdict

geo = json.load(open('src/data/generated/provinces.geo.json'))
seed = json.load(open('src/data/generated/worldSeed.json'))

def segments(geom):
    rings = []
    if geom['type'] == 'Polygon':
        rings = geom['coordinates']
    elif geom['type'] == 'MultiPolygon':
        rings = [r for poly in geom['coordinates'] for r in poly]
    for ring in rings:
        for a, b in zip(ring, ring[1:]):
            ka = (round(a[0], 4), round(a[1], 4))
            kb = (round(b[0], 4), round(b[1], 4))
            yield (ka, kb) if ka <= kb else (kb, ka)

edge_owner = defaultdict(set)
for f in geo['features']:
    pid = f['properties']['id']
    for seg in segments(f['geometry']):
        edge_owner[seg].add(pid)

neighbors = defaultdict(set)
unshared = defaultdict(int)
for seg, owners in edge_owner.items():
    if len(owners) >= 2:
        for a in owners:
            for b in owners:
                if a != b:
                    neighbors[a].add(b)
    else:
        (a,) = owners
        unshared[a] += 1

for p in seed['provinces']:
    p['neighbors'] = sorted(neighbors.get(p['id'], set()))
    p['coastal'] = unshared.get(p['id'], 0) > 3

isolated = [p['name'] for p in seed['provinces'] if not p['neighbors']]
print('isolated (islands):', len(isolated), isolated[:12])
json.dump(seed, open('src/data/generated/worldSeed.json', 'w'))
print('neighbors + coastal rewritten for', len(seed['provinces']), 'provinces')
