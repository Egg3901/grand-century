"""Stage 5: per-province physical attributes and the legacy overlap table.

terrain     classified from Mapzen Terrarium elevation (z4 tiles) and Natural
            Earth NE1 land cover, instead of latitude/longitude boxes
coastal     the province has a boundary not shared with another province
labelPoint  pole of inaccessibility approximation (inside the polygon)
legacy      area share of every legacy (pre-v8) province overlapping this one;
            drives populationWeight inheritance and save migration
"""
import json, math, sys, os
from collections import Counter, defaultdict
from pathlib import Path
import multiprocessing as mp
import numpy as np
from PIL import Image
from shapely import STRtree, make_valid, prepare, contains_xy
from shapely.ops import polylabel
from shapely.geometry import shape

PROVINCES = Path(sys.argv[1]); ADJ = Path(sys.argv[2]); LEGACY = Path(sys.argv[3])
TILES = Path(sys.argv[4]); LANDCOVER = Path(sys.argv[5]); OUT = Path(sys.argv[6])
Image.MAX_IMAGE_PIXELS = None
R = 6371.0088
KM2_PER_DEG2 = (math.pi / 180 * R) ** 2

def km2(g):
    return g.area * KM2_PER_DEG2 * math.cos(math.radians(g.centroid.y)) if not g.is_empty else 0.0

# ------------------------------------------------------------- rasters
def load_height():
    Z = 4; N = 256 * 2 ** Z
    h = np.zeros((N, N), dtype=np.float32)
    for x in range(2 ** Z):
        for y in range(2 ** Z):
            a = np.asarray(Image.open(TILES / f'{Z}-{x}-{y}.png').convert('RGB'), dtype=np.float32)
            h[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
    return h, N

HEIGHT, HN = None, 0
SLOPE = None
LC = None

def height_at(lon, lat):
    lat = np.clip(lat, -85.0511, 85.0511)
    x = ((lon + 180) / 360 * HN).astype(int).clip(0, HN - 1)
    y = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * HN).astype(int).clip(0, HN - 1)
    return HEIGHT[y, x]

def slope_at(lon, lat):
    lat = np.clip(lat, -85.0511, 85.0511)
    x = ((lon + 180) / 360 * HN).astype(int).clip(0, HN - 1)
    y = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * HN).astype(int).clip(0, HN - 1)
    return SLOPE[y, x]

def cover_at(lon, lat):
    H, W, _ = LC.shape
    x = ((lon + 180) / 360 * W).astype(int).clip(0, W - 1)
    y = ((90 - lat) / 180 * H).astype(int).clip(0, H - 1)
    return LC[y, x].astype(np.int32)

def classify_cover(rgb, lat):
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    green = g - (r + b) / 2
    bright = (r + g + b) / 3
    ice = (b > r + 5) & (bright > 222)
    tundra = (np.abs(r - b) < 14) & (green < 8) & (np.abs(lat) > 55)
    # Sand and rock: a red cast, or the near-white of the Sahara and Arabia.
    desert = ((r > g + 6) | ((b > 205) & (r > 235) & (r >= g))) & ~ice
    forest = (r < 200) & (green > 14)
    jungle = forest & (np.abs(lat) < 16) | ((np.abs(lat) < 12) & (green > 18) & (r < 215))
    return ice | tundra, desert, forest & ~jungle, jungle

# ------------------------------------------------------------- work
FEATS = []; LEG = []; LEG_TREE = None; DENSE = None

def sample_points(g, n=260):
    minx, miny, maxx, maxy = g.bounds
    out_x, out_y = np.empty(0), np.empty(0)
    step = math.sqrt(max((maxx - minx) * (maxy - miny), 1e-9) / n)
    for _ in range(4):
        xs = np.arange(minx + step / 2, maxx, step); ys = np.arange(miny + step / 2, maxy, step)
        gx, gy = np.meshgrid(xs, ys); gx, gy = gx.ravel(), gy.ravel()
        inside = contains_xy(g, gx, gy)
        out_x, out_y = gx[inside], gy[inside]
        if len(out_x) >= n / 3: break
        step /= 2
    if len(out_x) == 0:
        p = g.representative_point(); out_x, out_y = np.array([p.x]), np.array([p.y])
    return out_x, out_y

def work(i):
    f = FEATS[i]
    g = shape(f['geometry']); g = g if g.is_valid else make_valid(g)
    prepare(g)
    xs, ys = sample_points(g)
    h = np.maximum(height_at(xs, ys), 0)
    p10, p50, p90 = np.percentile(h, [10, 50, 90])
    slope = float(np.mean(slope_at(xs, ys)))  # metres of rise per km
    ice, desert, forest, jungle = classify_cover(cover_at(xs, ys), ys)
    share = lambda m: float(m.mean()) if len(m) else 0.0
    lat = float(np.mean(ys))
    # Calibrated on sampled ranges: Alps 48, Caucasus 39, Rockies 35, Massif
    # Central 18, Appalachians 13, North German Plain 3, Ganges 1.
    if slope >= 28 or (slope >= 16 and p50 > 2500): terrain = 'mountains'
    elif share(ice) > 0.5 or abs(lat) > 68: terrain = 'arctic'
    elif share(desert) > 0.5: terrain = 'desert'
    elif slope >= 13: terrain = 'hills'
    elif share(jungle) > 0.4: terrain = 'jungle'
    elif share(forest) > 0.45: terrain = 'forest'
    else: terrain = 'farmland' if DENSE(f['properties']['iso'], float(np.mean(xs)), lat) else 'plains'
    # legacy overlap shares
    legacy = {}
    for j in LEG_TREE.query(g):
        lg = LEG[j][1]
        if not lg.intersects(g): continue
        a = km2(lg.intersection(g))
        if a > 0.5: legacy[LEG[j][0]] = round(a, 2)
    try:
        lp = polylabel(max(g.geoms, key=lambda x: x.area) if hasattr(g, 'geoms') else g, tolerance=0.01)
    except Exception:
        lp = g.representative_point()
    return {'id': f['properties']['id'], 'terrain': terrain,
            'elevation': {'p10': round(float(p10)), 'p50': round(float(p50)), 'p90': round(float(p90)), 'slope': round(slope, 1)},
            'cover': {'ice': round(share(ice), 3), 'desert': round(share(desert), 3), 'forest': round(share(forest), 3), 'jungle': round(share(jungle), 3)},
            'labelPoint': [round(lp.x, 4), round(lp.y, 4)], 'legacyOverlapKm2': legacy}

def main():
    global HEIGHT, HN, SLOPE, LC, FEATS, LEG, LEG_TREE, DENSE
    src = (Path(__file__).parent / 'group.py').read_text().split('# ---------------------------------------------------------------- load')[0]
    ns = {}; exec(src.replace('PIECES = Path(sys.argv[1]); OUT = Path(sys.argv[2])', ''), ns)
    # Settled agricultural cores: regions whose base province target is dense.
    DENSE = lambda iso, lon, lat: ns['_target_km2'](iso, lon, lat) <= 20000
    HEIGHT, HN = load_height()
    HEIGHT = np.maximum(HEIGHT, 0)
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (np.arange(HN) + .5) / HN))))
    mpp = 40075016.686 * np.cos(np.radians(lat))[:, None] / HN
    dy, dx = np.gradient(HEIGHT)
    SLOPE = (np.hypot(dx / mpp, dy / mpp) * 1000).astype(np.float32)
    del dx, dy
    LC = np.asarray(Image.open(LANDCOVER).convert('RGB'))
    FEATS = json.load(open(PROVINCES))['features']
    for lf in json.load(open(LEGACY))['features']:
        lg = shape(lf['geometry']); lg = lg if lg.is_valid else make_valid(lg)
        LEG.append((lf['properties']['id'] if 'id' in lf['properties'] else lf['id'], lg))
    LEG_TREE = STRtree([g for _, g in LEG])
    with mp.get_context('fork').Pool(int(os.environ.get('PROCS', '6'))) as pool:
        rows = list(pool.imap(work, range(len(FEATS)), chunksize=8))
    adj = json.load(open(ADJ))
    shared = defaultdict(float)
    for a, b, l in adj['land']: shared[a] += l; shared[b] += l
    for f, r in zip(FEATS, rows):
        g = shape(f['geometry'])
        perim = g.length
        r['coastal'] = (perim - shared[r['id']]) > max(0.02, 0.03 * perim)
    OUT.write_text(json.dumps(rows))
    c = Counter(r['terrain'] for r in rows)
    print(json.dumps({'provinces': len(rows), 'terrain': c, 'coastal': sum(r['coastal'] for r in rows)}))

if __name__ == '__main__':
    main()
