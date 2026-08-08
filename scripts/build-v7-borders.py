#!/usr/bin/env python3
"""
V7 border rebuild — a true tessellation from Natural Earth 10m admin-1.

V6 matched NE geometry per-province independently, which cannot tessellate:
neighbouring provinces claimed overlapping NE units (150+ overlapping pairs in
Europe alone) and unclaimed units became holes (Thuringia). Independent
per-province simplify also broke the exact edge-hash matching that
build-v6-national-borders.py relies on, so every province edge rendered as
heavy "coastline" ink.

V7 inverts the direction: every NE admin-1 unit is assigned to EXACTLY ONE
GC province, then each province is the union of its units. Guarantees:
  - no overlaps (each unit appears once)
  - no interior holes (every land unit near the game world is assigned)
  - shared edges between provinces are identical NE vertex chains, so the
    national-border edge hashing works again.

Assignment per NE unit:
  1. Curated force-map (historical DE/IT states; NE name or region).
  2. Max intersection area with the V5 procedural tessellation (the last
     known-good planar claim map).
  3. Nearest province seed point (worldSeed lon/lat), gated at 8 degrees;
     units beyond the gate (Antarctica etc.) are dropped.

GC provinces left empty (their footprint sits inside one NE unit that a
neighbour won) get the unit split by Voronoi of the claimant seed points, so
tiny historical states never vanish.

No RDP simplification — coordinates are only rounded to 4dp, identically on
both sides of every shared edge. Usage:
  python3 scripts/build-v7-borders.py <v5-provinces.geo.json> <out.geo.json>
Requires /tmp/ne_admin1.geojson (NE 10m admin-1) and worldSeed.json.
"""

import json
import sys
import unicodedata
from shapely.geometry import shape, mapping, Point, MultiPoint, box
from shapely.ops import unary_union, voronoi_diagram
from shapely.strtree import STRtree
from shapely.validation import make_valid

NE_PATH = '/tmp/ne_admin1.geojson'
SEED_PATH = 'src/data/generated/worldSeed.json'

# Historical 19th-century states -> NE `name`/`region` values (10m admin-1).
# A unit matching any entry is force-assigned to that GC province.
CURATED = {
    # --- Germany (NE länder) -------------------------------------------------
    'Baden':            ['Baden-Württemberg'],
    'Bavaria':          ['Bayern'],
    'Hanover':          ['Niedersachsen', 'Bremen', 'Hamburg'],
    'Hesse':            ['Hessen'],
    'Rhineland':        ['Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland'],
    'Brandenburg':      ['Brandenburg', 'Berlin'],
    'Province of Saxony': ['Sachsen-Anhalt', 'Thüringen'],
    'Saxony':           ['Sachsen'],
    'Schleswig-Holstein': ['Schleswig-Holstein'],
    # --- the Prussian partition (NE uses ENGLISH voivodeship names) ----------
    'Silesia':          ['Lower Silesian', 'Opole', 'Silesian'],
    'Posen':            ['Greater Poland', 'Lubusz'],
    'West Prussia':     ['Pomeranian', 'Kuyavian-Pomeranian'],
    'Pomerania':        ['Mecklenburg-Vorpommern', 'West Pomeranian'],
    'East Prussia':     ['Warmian-Masurian', 'Kaliningrad'],
    # --- Congress Poland (Russian) -------------------------------------------
    'Mazovia':          ['Masovian', 'Podlachian', 'Lublin', 'Łódź'],
    'Lesser Poland':    ['Świętokrzyskie'],
    # --- Habsburg lands -------------------------------------------------------
    'Galicia-Lodomeria': ['Lesser Poland', 'Subcarpathian'],
    'Bohemia':          ['Prague', 'Central Bohemia', 'South Bohemia', 'Plzeň',
                         'Karlovy Vary', 'Ústí nad Labem', 'Liberec',
                         'Hradec Králové', 'Pardubice',
                         'Praha', 'Středočeský', 'Jihočeský', 'Plzeňský',
                         'Karlovarský', 'Ústecký', 'Liberecký',
                         'Královéhradecký', 'Pardubický'],
    'Moravia':          ['Vysočina', 'South Moravian', 'Olomouc', 'Zlín',
                         'Moravian-Silesian', 'Jihomoravský', 'Olomoucký',
                         'Zlínský', 'Moravskoslezský'],
    'Tyrol':            ['Tirol', 'Vorarlberg'],
    # --- Switzerland: keep every canton Swiss ---------------------------------
    'Zurich-East':      ['Ticino', 'Graubünden', 'Appenzell Ausserrhoden',
                         'Appenzell Innerrhoden'],
    'Bern-Mittelland':  ['Valais', 'Basel-Stadt'],
    # --- French frontier départements the Voronoi bled to neighbours ----------
    'Champagne':        ['Ardennes'],
    'Franche-Comté':    ['Territoire de Belfort'],
    'Lyonnais-Auvergne': ['Ain'],
    'Provence':         ['Alpes-de-Haute-Provence', 'Haute-Corse', 'Corse-du-Sud'],
    'Dauphiné':         ['Hautes-Alpes'],
    'Gascony':          ['Pyrénées-Atlantiques'],
    'Languedoc':        ['Ariège', 'Pyrénées-Orientales'],
    'Guyenne':          ['Guyane française'],
    'Brittany':         ['Martinique', 'Guadeloupe'],
    # --- Savoy and Nice are Sardinian in 1820 ---------------------------------
    'Piedmont':         ['Piemonte', "Valle d'Aosta", 'Liguria',
                         'Savoie', 'Haute-Savoie', 'Alpes-Maritimes'],
    # --- Iberia / islands ------------------------------------------------------
    'Andalusia':        ['Santa Cruz de Tenerife', 'Las Palmas'],
    'Portugal':         ['Madeira', 'Azores'],
    # --- Italy ----------------------------------------------------------------
    'Lombardy-Venetia': ['Lombardia', 'Veneto', 'Friuli-Venezia Giulia',
                         'Trentino-Alto Adige'],
    'Tuscany':          ['Toscana'],
    'Papal States':     ['Lazio', 'Umbria', 'Marche'],
    'Parma':            ['Parma', 'Piacenza'],
    'Modena':           ['Modena', 'Reggio Emilia', 'Bologna', 'Ferrara'],
    'Two Sicilies':     ['Abruzzo', 'Molise', 'Campania', 'Puglia',
                         'Basilicata', 'Calabria', 'Sicily'],
}

NEAREST_GATE_DEG = 8.0


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s)
                   if not unicodedata.combining(c)).lower().strip()


def clean(g):
    if not g.is_valid:
        try:
            g = make_valid(g, method='structure', keep_collapsed=False)
        except Exception:
            g = g.buffer(0)
    return g


def poly_only(geom):
    """Strip a geometry down to its Polygon/MultiPolygon content."""
    if geom.geom_type in ('Polygon', 'MultiPolygon'):
        return geom
    if geom.geom_type == 'GeometryCollection':
        polys = [g for g in geom.geoms if g.geom_type in ('Polygon', 'MultiPolygon')]
        if polys:
            return unary_union(polys)
    return None


def main():
    v5_path, out_path = sys.argv[1], sys.argv[2]
    ne = json.load(open(NE_PATH))
    v5 = json.load(open(v5_path))
    seed = json.load(open(SEED_PATH))

    prov_meta = {p['id']: p for p in seed['provinces']}
    prov_ids = [f['properties']['id'] for f in v5['features']]
    prov_names = {f['properties']['id']: f['properties']['n'] for f in v5['features']}
    name_to_pid = {prov_names[pid]: pid for pid in prov_ids}

    curated_lookup = {}  # folded NE name/region -> pid
    for prov_name, ne_names in CURATED.items():
        pid = name_to_pid.get(prov_name)
        if pid is None:
            print(f"WARN curated province not found: {prov_name}", file=sys.stderr)
            continue
        for n in ne_names:
            curated_lookup[fold(n)] = pid

    v5_geoms, v5_pids = [], []
    for f in v5['features']:
        g = clean(shape(f['geometry']))
        if g.is_empty:
            continue
        v5_geoms.append(g)
        v5_pids.append(f['properties']['id'])
    tree = STRtree(v5_geoms)

    seed_pts = {pid: Point(prov_meta[pid]['lon'], prov_meta[pid]['lat'])
                for pid in prov_ids if pid in prov_meta}

    assigned = {pid: [] for pid in prov_ids}   # pid -> [unit geom]
    unit_best_v5 = []                          # (unit geom, winner pid) for splitting
    stats = {'curated': 0, 'area': 0, 'nearest': 0, 'dropped': 0}

    for f in ne['features']:
        g = clean(shape(f['geometry']))
        g = poly_only(g)
        if g is None or g.is_empty:
            continue
        props = f['properties']
        nm, region = fold(props.get('name') or ''), fold(props.get('region') or '')

        pid = curated_lookup.get(nm)
        if pid is None and region and region in curated_lookup:
            pid = curated_lookup[region]
        if pid is not None:
            assigned[pid].append(g)
            unit_best_v5.append((g, pid))
            stats['curated'] += 1
            continue

        best_pid, best_area = None, 0.0
        for j in tree.query(g):
            j = int(j)
            try:
                a = g.intersection(v5_geoms[j]).area
            except Exception:
                a = clean(g).intersection(clean(v5_geoms[j])).area
            if a > best_area:
                best_area, best_pid = a, v5_pids[j]
        if best_pid is not None and best_area > 0:
            assigned[best_pid].append(g)
            unit_best_v5.append((g, best_pid))
            stats['area'] += 1
            continue

        c = g.centroid
        nd, npid = 1e18, None
        for pid2, pt in seed_pts.items():
            d = (pt.x - c.x) ** 2 + (pt.y - c.y) ** 2
            if d < nd:
                nd, npid = d, pid2
        if npid is not None and nd ** 0.5 <= NEAREST_GATE_DEG:
            assigned[npid].append(g)
            unit_best_v5.append((g, npid))
            stats['nearest'] += 1
        else:
            stats['dropped'] += 1

    # ---- rescue empty provinces by Voronoi-splitting their best unit -------
    v5_by_pid = {pid: g for pid, g in zip(v5_pids, v5_geoms)}
    unit_tree = STRtree([u for u, _ in unit_best_v5])
    split_requests = {}  # unit index -> set of extra claimant pids
    empties = [pid for pid in prov_ids if not assigned[pid]]
    for pid in empties:
        claim = v5_by_pid.get(pid)
        probe = claim if claim is not None and not claim.is_empty else \
            (seed_pts[pid].buffer(0.5) if pid in seed_pts else None)
        if probe is None:
            continue
        best_i, best_a = None, 0.0
        for j in unit_tree.query(probe):
            j = int(j)
            a = probe.intersection(unit_best_v5[j][0]).area
            if a > best_a:
                best_a, best_i = a, j
        if best_i is not None:
            split_requests.setdefault(best_i, set()).add(pid)

    for i, extra_pids in split_requests.items():
        unit, owner_pid = unit_best_v5[i]
        claimants = sorted(extra_pids | {owner_pid})
        pts = [seed_pts[p] for p in claimants if p in seed_pts]
        if len(pts) < 2:
            continue
        try:
            cells = voronoi_diagram(MultiPoint(pts), envelope=unit.buffer(1.0))
        except Exception:
            continue
        # remove the whole unit from its owner, hand out the pieces
        assigned[owner_pid] = [g for g in assigned[owner_pid] if g is not unit]
        for cell in cells.geoms:
            piece = poly_only(clean(cell.intersection(unit)))
            if piece is None or piece.is_empty:
                continue
            rep = piece.representative_point()
            nearest = min((p for p in claimants if p in seed_pts),
                          key=lambda p: (seed_pts[p].x - rep.x) ** 2 + (seed_pts[p].y - rep.y) ** 2)
            assigned[nearest].append(piece)

    # ---- emit ---------------------------------------------------------------
    def snap_ring(ring):
        ded = []
        for lon, lat in ring:
            p = (round(lon, 4), round(lat, 4))
            if not ded or p != ded[-1]:
                ded.append(p)
        if len(ded) >= 2 and ded[0] != ded[-1]:
            ded.append(ded[0])
        return ded if len(ded) >= 4 else None

    def round_coords(coords, gtype):
        if gtype == 'Polygon':
            rings = [snap_ring(r) for r in coords]
            rings = [r for r in rings if r]
            return rings or None
        polys = []
        for poly in coords:
            rings = [snap_ring(r) for r in poly]
            rings = [r for r in rings if r]
            if rings:
                polys.append(rings)
        return polys or None

    out_feats, still_empty = [], []
    for f in v5['features']:
        pid = f['properties']['id']
        name = f['properties']['n']
        parts = assigned.get(pid) or []
        if parts:
            geom = poly_only(clean(unary_union(parts)))
        else:
            geom = None
        if geom is None or geom.is_empty:
            still_empty.append(name)
            geom = clean(shape(f['geometry']))  # V5 fallback, never vanish
        gm = mapping(geom)
        coords = round_coords(gm['coordinates'], gm['type'])
        if coords is None:  # fully collapsed by snapping — keep V5 shape
            still_empty.append(name)
            gm = mapping(clean(shape(f['geometry'])))
            coords = round_coords(gm['coordinates'], gm['type'])
        out_feats.append({'type': 'Feature', 'id': pid,
                          'properties': {'id': pid, 'n': name},
                          'geometry': {'type': gm['type'], 'coordinates': coords}})

    print('units:', ' '.join(f'{k}={v}' for k, v in stats.items()),
          f'| split-units={len(split_requests)} | empty-after={len(still_empty)}',
          file=sys.stderr)
    if still_empty:
        print('  still-empty (V5 fallback):', ', '.join(still_empty), file=sys.stderr)

    topo_simplify(out_feats, tol=0.012, min_island=0.0008)

    # Final validity pass: rounding + arc simplification can pinch a ring or
    # cross two arcs. Repair only the offenders (make_valid splits pinches
    # into MultiPolygon parts and nodes true crossings); untouched features
    # keep their vertex chains so border edge-hashing stays intact.
    repaired = 0
    for f in out_feats:
        g = shape(f['geometry'])
        if g.is_valid:
            continue
        g = poly_only(clean(g))
        if g is None or g.is_empty:
            continue
        gm = mapping(g)
        coords = round_coords(gm['coordinates'], gm['type'])
        if coords:
            f['geometry'] = {'type': gm['type'], 'coordinates': coords}
            repaired += 1
    print(f'validity-repaired features: {repaired}', file=sys.stderr)

    json.dump({'type': 'FeatureCollection', 'features': out_feats},
              open(out_path, 'w'), separators=(',', ':'))


# ---------------------------------------------------------------------------
# Shared-arc simplification (topojson-style). The tessellation is decomposed
# into arcs — maximal vertex chains whose undirected edges are used by the
# same set of provinces. Each arc is RDP-simplified ONCE and substituted back
# into every ring that uses it, so both sides of a border stay vertex-
# identical (required by build-v6-national-borders.py's edge hashing) and no
# cracks or slivers open between provinces.
# ---------------------------------------------------------------------------

def rdp(pts, tol):
    """Iterative Ramer-Douglas-Peucker on a list of (x, y) tuples."""
    n = len(pts)
    if n < 3:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        dmax, imax = -1.0, -1
        for i in range(i0 + 1, i1):
            px, py = pts[i]
            if norm == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                d = abs(dx * (ay - py) - dy * (ax - px)) / norm
            if d > dmax:
                dmax, imax = d, i
        if dmax > tol:
            keep[imax] = True
            stack.append((i0, imax))
            stack.append((imax, i1))
    return [pts[i] for i in range(n) if keep[i]]


def ring_signed_area(r):
    s = 0.0
    for i in range(len(r) - 1):
        s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return s / 2.0


def topo_simplify(out_feats, tol, min_island):
    from collections import defaultdict

    def ekey(a, b):
        return (a, b) if a <= b else (b, a)

    # 1. owner set per undirected edge
    edge_owners = defaultdict(set)
    ring_refs = []  # (feature, poly list, poly idx, ring idx)
    for f in out_feats:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for pi, poly in enumerate(polys):
            for ri, ring in enumerate(poly):
                ring_refs.append((f, polys, pi, ri))
                for i in range(len(ring) - 1):
                    edge_owners[ekey(ring[i], ring[i + 1])].add(f['id'])

    # 2. split each ring into arcs of constant owner-set; simplify via cache
    arc_cache = {}

    def simplified(arc):
        a, b = arc[0], arc[-1]
        closed = a == b
        if closed:
            body = arc[:-1]
            mi = min(range(len(body)), key=lambda i: body[i])
            rot = body[mi:] + body[:mi] + [body[mi]]
            rev = list(reversed(rot))
            key = tuple(rot) if tuple(rot) <= tuple(rev) else tuple(rev)
            if key not in arc_cache:
                s = rdp(list(key), tol)
                if len(s) < 4:  # keep a degenerate-proof quad
                    n = len(key)
                    s = [key[0], key[n // 3], key[2 * n // 3], key[0]]
                arc_cache[key] = s
            return list(arc_cache[key]), True
        fwd = a <= b
        key = tuple(arc) if fwd else tuple(reversed(arc))
        if key not in arc_cache:
            arc_cache[key] = rdp(list(key), tol)
        s = arc_cache[key]
        return (list(s) if fwd else list(reversed(s))), False

    for f, polys, pi, ri in ring_refs:
        ring = polys[pi][ri]
        n = len(ring) - 1
        owners = [edge_owners[ekey(ring[i], ring[i + 1])] for i in range(n)]
        # find a breakpoint where owner-set changes; rotate ring to start there
        start = 0
        for i in range(n):
            if owners[i] != owners[i - 1]:
                start = i
                break
        else:
            # uniform ring: one closed arc
            new_ring, _ = simplified(ring)
            if abs(ring_signed_area(new_ring)) > 0 and (ring_signed_area(ring) > 0) != (ring_signed_area(new_ring) > 0):
                new_ring.reverse()
            polys[pi][ri] = new_ring
            continue
        rot_pts = ring[start:-1] + ring[:start]
        rot_owner = owners[start:] + owners[:start]
        arcs = []
        cur = [rot_pts[0]]
        for i in range(n):
            nxt = rot_pts[(i + 1) % n] if i + 1 < n else rot_pts[0]
            cur.append(nxt)
            last = rot_owner[i]
            nxt_owner = rot_owner[(i + 1) % n]
            if i + 1 == n or nxt_owner != last:
                arcs.append(cur)
                cur = [nxt]
        new_ring = []
        for arc in arcs:
            s, _ = simplified(arc)
            if new_ring:
                s = s[1:]
            new_ring.extend(s)
        if new_ring[0] != new_ring[-1]:
            new_ring.append(new_ring[0])
        if len(new_ring) >= 4:
            polys[pi][ri] = new_ring

    # 3. drop micro-island rings (never a feature's largest) + rebuild geoms
    for f in out_feats:
        g = f['geometry']
        if g['type'] == 'Polygon':
            continue
        polys = g['coordinates']
        sized = [(abs(ring_signed_area(p[0])), p) for p in polys]
        sized.sort(key=lambda t: -t[0])
        kept = [p for a, p in sized if a >= min_island] or [sized[0][1]]
        g['coordinates'] = kept


if __name__ == '__main__':
    main()
