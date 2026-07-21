#!/usr/bin/env python3
"""
Rebuild nationalBorders.geo.json from the V6 province shapes.

Emits a single MultiLineString of border segments between provinces owned by
DIFFERENT nations (per worldSeed ownerTag), plus coastline. Shared edges are
extracted by hashing each polygon edge's endpoint pair — segments seen twice
with different owners are international borders; segments seen once are
coastline. Same-owner shared edges are dropped (internal province lines are
already drawn by the province layer).
"""

import json
from collections import defaultdict

GC = 'src/data/generated/provinces.geo.json'
SEED = 'src/data/generated/worldSeed.json'
OUT = 'src/data/generated/nationalBorders.geo.json'

gc = json.load(open(GC))
seed = json.load(open(SEED))
owner = {p['id']: p['ownerTag'] for p in seed['provinces']}

# edge key -> (owner, coords)
edges = {}

def add_ring(ring, own):
    n = len(ring)
    for i in range(n - 1):
        a, b = ring[i], ring[i + 1]
        key = (round(a[0], 4), round(a[1], 4), round(b[0], 4), round(b[1], 4))
        rkey = (key[2], key[3], key[0], key[1])
        if key in edges:
            edges[key].append((own, [a, b]))
        elif rkey in edges:
            edges[rkey].append((own, [b, a]))
        else:
            edges[key] = [(own, [a, b])]

for f in gc['features']:
    pid = f['properties']['id']
    own = owner.get(pid, '???')
    g = f['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    for poly in polys:
        for ring in poly:
            add_ring(ring, own)

border_lines = []
for hits in edges.values():
    owners = {h[0] for h in hits}
    if len(hits) == 1:
        # coastline — keep it, it defines the land silhouette
        border_lines.append(hits[0][1])
    elif len(owners) > 1:
        border_lines.append(hits[0][1])

# Join 2-point segments into polylines: chain segments that share endpoints.
from collections import defaultdict
by_pt = defaultdict(list)
for i, seg in enumerate(border_lines):
    a, b = (round(seg[0][0], 4), round(seg[0][1], 4)), (round(seg[1][0], 4), round(seg[1][1], 4))
    by_pt[a].append((i, 0))
    by_pt[b].append((i, 1))

used = [False] * len(border_lines)
chains = []
for i, seg in enumerate(border_lines):
    if used[i]:
        continue
    used[i] = True
    chain = [tuple(seg[0]), tuple(seg[1])]
    # extend forward from chain tail, backward from chain head
    for end_idx in (1, 0):
        while True:
            pt = (round(chain[-1][0], 4), round(chain[-1][1], 4)) if end_idx == 1 else (round(chain[0][0], 4), round(chain[0][1], 4))
            nxt = None
            for (j, side) in by_pt.get(pt, []):
                if not used[j]:
                    nxt = j
                    break
            if nxt is None:
                break
            used[nxt] = True
            s = border_lines[nxt]
            a, b = tuple(s[0]), tuple(s[1])
            far = b if (round(a[0], 4), round(a[1], 4)) == pt else a
            if end_idx == 1:
                chain.append(far)
            else:
                chain.insert(0, far)
    chains.append([[round(x, 4), round(y, 4)] for x, y in chain])

# Drop degenerate chains and simplify lightly with radial-distance decimation.
def decimate(line, tol=0.02):
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

chains = [decimate(c) for c in chains if len(c) >= 2]

out = {
    'type': 'FeatureCollection',
    'features': [{
        'type': 'Feature',
        'properties': {'id': 0},
        'geometry': {'type': 'MultiLineString', 'coordinates': chains},
    }],
}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
import os
print(f'lines={len(chains)} pts={sum(len(l) for l in chains)} size={os.path.getsize(OUT)}')
