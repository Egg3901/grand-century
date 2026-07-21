#!/usr/bin/env python3
"""
V6 border replacement — swap GC's low-poly province shapes for Natural Earth
10m admin-1 geometry, dissolved to match each GC province's footprint.

Strategy per GC province:
  1. Exact name match against NE admin-1 `name` (accent-folded, case-insens).
  2. Centroid proximity match (nearest NE centroid within a distance gate that
     scales with the GC province's bbox diagonal).
  3. Coverage dissolve: all NE units whose centroid falls inside the GC
     province's (buffered) polygon are dissolved — this handles GC provinces
     that are unions of modern admin-1 units (e.g. historical Germany/Italy).
  4. Hand-curated map for the historical DE/IT states where modern Länder
     don't align (explicit NE name lists, dissolved).
  5. Fallback: keep the original GC shape (no regression).

Adjacency / IDs / names / centroids are NOT recomputed — worldSeed owns
neighbors; we only replace the rendering geometry. Each output feature keeps
properties {id, n} verbatim from the input.

Outputs the new provinces.geo.json to stdout path arg. Prints a coverage
report to stderr.
"""

import json
import sys
import unicodedata
from shapely.geometry import shape, mapping, Point, box
from shapely.ops import unary_union
from shapely.validation import make_valid

NE_PATH = '/tmp/ne_admin1.geojson'
GC_PATH = 'src/data/generated/provinces.geo.json'

# ---------------------------------------------------------------------------
# Hand-curated: historical 19th-century states -> modern NE admin-1 units to
# dissolve. Names are NE `name` values (10m, admin=Germany/Italy/etc).
# ---------------------------------------------------------------------------
CURATED = {
    'Baden':            ['Baden-Württemberg'],      # approx: modern BW ⊃ old Baden
    'Bavaria':          ['Bayern'],
    'Hanover':          ['Niedersachsen'],
    'Hesse':            ['Hessen'],
    'Prussia':          ['Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Brandenburg',
                         'Berlin', 'Sachsen-Anhalt', 'Mecklenburg-Vorpommern',
                         'Schleswig-Holstein'],
    'Saxony':           ['Sachsen'],
    # Italy: NE 10m features are provinces; the 19c states map to REGIONS.
    # Liguria was Piedmontese from 1815 — include it.
    'Piedmont':         ['Piemonte', "Valle d'Aosta", 'Liguria'],
    'Lombardy-Venetia': ['Lombardia', 'Veneto'],
    'Tuscany':          ['Toscana'],
    # Parma & Modena split Emilia-Romagna along the Via Emilia: Parma/Piacenza
    # to the west, Modena/Reggio/Bologna/Ferrara to the east. Romagna was
    # Papal — but GC has a single 'Papal States' centred on Lazio/Umbria/
    # Marche, so Bologna+Ferrara ride with Modena to keep shapes contiguous.
    'Papal States':     ['Lazio', 'Umbria', 'Marche'],
    'Parma':            ['Parma', 'Piacenza'],
    'Modena':           ['Modena', 'Reggio Emilia', 'Bologna', 'Ferrara'],
}

def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower().strip()

def gc_geom(f):
    g = shape(f['geometry'])
    if not g.is_valid:
        g = g.buffer(0)
    return g

def main():
    ne = json.load(open(NE_PATH))
    gc = json.load(open(GC_PATH))

    ne_feats = ne['features']
    ne_by_fold = {}
    for f in ne_feats:
        nm = f['properties'].get('name')
        if nm:
            ne_by_fold.setdefault(fold(nm), []).append(f)

    ne_geoms = []
    for f in ne_feats:
        g = shape(f['geometry'])
        if not g.is_valid:
            g = g.buffer(0)
        if g.is_empty:
            continue
        ne_geoms.append((f, g, g.centroid))

    report = {'exact': 0, 'centroid': 0, 'coverage': 0, 'curated': 0, 'fallback': 0}
    out_feats = []

    for f in gc['features']:
        pid = f['properties']['id']
        name = f['properties']['n']
        ggeom = gc_geom(f)
        if ggeom.is_empty:
            report['fallback'] += 1
            out_feats.append({'type': 'Feature', 'id': pid, 'properties': {'id': pid, 'n': name},
                              'geometry': f['geometry']})
            continue
        gc_cent = ggeom.centroid
        minx, miny, maxx, maxy = ggeom.bounds
        diag = ((maxx - minx) ** 2 + (maxy - miny) ** 2) ** 0.5

        chosen = None
        method = 'fallback'

        # 4. curated first — historical states beat heuristics. Match against
        # BOTH the NE unit name and its parent region (Italy's features are
        # provinces whose 19th-century-relevant grouping is `region`).
        if name in CURATED:
            names = set(fold(n) for n in CURATED[name])
            members = [g for (nf, g, _) in ne_geoms
                       if fold(nf['properties'].get('name') or '') in names
                       or fold(nf['properties'].get('region') or '') in names]
            if members:
                chosen = unary_union(members)
                method = 'curated'

        # 1. exact name
        if chosen is None and fold(name) in ne_by_fold:
            members = []
            for nf in ne_by_fold[fold(name)]:
                g = shape(nf['geometry'])
                members.append(g.buffer(0) if not g.is_valid else g)
            chosen = unary_union(members)
            method = 'exact'

        # 3. coverage dissolve — NE units whose centroid sits inside the GC
        # polygon (buffered by 8% of diag to absorb coastline wobble). Only
        # worth it when the GC province is big enough to plausibly contain
        # several admin-1 units.
        if chosen is None:
            buf = ggeom.buffer(diag * 0.08)
            members = [g for (_, g, c) in ne_geoms if buf.covers(c)]
            if members:
                # keep the dissolved shape clipped near the GC bbox to stop
                # coastal mega-units (e.g. an entire country) bleeding out
                dissolved = unary_union(members)
                clip = box(minx - diag * 0.25, miny - diag * 0.25,
                           maxx + diag * 0.25, maxy + diag * 0.25)
                inter = dissolved.intersection(clip)
                if not inter.is_empty:
                    chosen = inter
                    method = 'coverage'

        # 2. centroid proximity, gated
        if chosen is None:
            best = None
            bd = 1e18
            for (_, g, c) in ne_geoms:
                d = (c.x - gc_cent.x) ** 2 + (c.y - gc_cent.y) ** 2
                if d < bd:
                    bd = d
                    best = g
            gate = max(0.35, diag * 0.75)  # degrees
            if bd ** 0.5 <= gate:
                chosen = best
                method = 'centroid'

        if chosen is None:
            chosen = ggeom  # fallback: original low-poly shape
        else:
            if not chosen.is_valid:
                chosen = chosen.buffer(0)
            if chosen.is_empty:
                chosen = ggeom
                method = 'fallback'
            else:
                # snap the replacement's extent to roughly the GC bbox so a bad
                # match can't drag a province across the map: reject if the new
                # centroid moved more than 1.5 diagonals
                nc = chosen.centroid
                moved = ((nc.x - gc_cent.x) ** 2 + (nc.y - gc_cent.y) ** 2) ** 0.5
                if moved > max(1.5, diag * 1.5):
                    chosen = ggeom
                    method = 'fallback'
                else:
                    # IoU guard. Replacement-vs-original overlap <15% means
                    # the match is almost certainly wrong (city-level unit for
                    # a whole province, sliver dissolve) — GC's own shape
                    # beats a confident-looking wrong answer. 15–30% is the
                    # grey zone: keep the replacement only if it's *richer*
                    # geometry (2x the points); a plausible partial match with
                    # real borders still improves on a 25-pt rectangle.
                    inter = ggeom.intersection(chosen).area
                    union = ggeom.union(chosen).area
                    iou = inter / union if union > 0 else 0
                    if iou < 0.30:
                        old_pts = sum(len(r) for r in (f['geometry']['coordinates'] if f['geometry']['type'] == 'Polygon'
                                      else [r for p in f['geometry']['coordinates'] for r in p]))
                        new_coords = mapping(chosen)['coordinates']
                        new_pts = sum(len(r) for r in (new_coords if chosen.geom_type == 'Polygon'
                                      else [r for p in new_coords for r in p]))
                        if iou < 0.15 or new_pts < old_pts * 2:
                            chosen = ggeom
                            method = 'fallback'

        report[method] += 1
        # Simplify before emitting: target detail proportional to province
        # size — small provinces need tighter tolerance to keep their shape.
        # 10m NE data is ~10x denser than a web map needs at these extents.
        tol = max(0.008, min(0.05, diag * 0.02))
        if method != 'fallback':
            chosen = chosen.simplify(tol, preserve_topology=True)
            if chosen.is_empty:
                chosen = ggeom
                method = 'fallback'
        geom = mapping(chosen)
        # keep only Polygon/MultiPolygon
        if geom['type'] == 'GeometryCollection':
            polys = [p for p in geom['geometries'] if p['type'] in ('Polygon', 'MultiPolygon')]
            if not polys:
                geom = mapping(ggeom)
            elif len(polys) == 1:
                geom = polys[0]
            else:
                geom = {'type': 'MultiPolygon',
                        'coordinates': [p['coordinates'] if p['type'] == 'Polygon' else p['coordinates'][0] for p in polys]}

        out_feats.append({
            'type': 'Feature',
            'id': pid,
            'properties': {'id': pid, 'n': name},
            'geometry': geom,
        })

    total = len(out_feats)
    print(f"total={total} " + ' '.join(f"{k}={v}" for k, v in sorted(report.items())), file=sys.stderr)
    fb = report['fallback']
    print(f"fallback pct = {fb/total*100:.1f}%", file=sys.stderr)

    out = {'type': 'FeatureCollection', 'features': out_feats}

    # Round coordinates to 4 decimals (~11m) — plenty for a web map.
    def round_coords(o):
        if isinstance(o, list):
            if o and isinstance(o[0], (int, float)):
                return [round(v, 4) for v in o]
            return [round_coords(x) for x in o]
        return o
    for f in out['features']:
        f['geometry']['coordinates'] = round_coords(f['geometry']['coordinates'])

    json.dump(out, open(sys.argv[1], 'w'), separators=(',', ':'))

if __name__ == '__main__':
    main()
