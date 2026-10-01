"""Stage 7: compile the 1830 base world seed from the v8 mesh.

Inputs are the stage outputs plus the legacy (pre-v8) seed and geometry,
which supply nation metadata, culture/minority content keys (through each
province's dominant legacy predecessor), population weights (inherited by
area so world totals are preserved) and formable cores.

Ownership on 1830-01-01:
  1. the polity in the reviewed 1830 layer, if it is a Grand Century nation
  2. else its runtime overlord chain, up to a Grand Century nation
  3. else UNC (unclaimed)
  A vassal nation that the layer draws inside its overlord (Finland, Tibet)
  keeps the provinces whose legacy owner it was.
"""
import json, math, sys, hashlib
from collections import Counter, defaultdict
from pathlib import Path
from shapely import STRtree, make_valid
from shapely.geometry import shape, Point

(PROVINCES, PROVINCE_LIST, PIECES, ATTRIBUTES, NAMES, ADJ, LEGACY_SEED, LEGACY_GEO, CROSSWALK,
 CAPITALS, OUT, MIGRATION) = [Path(p) for p in sys.argv[1:13]]
SCEN = '1830-01-01'
# Autonomous 1830 polities that the source layer draws inside a larger state:
# Moldavia (Ottoman principality under Russian occupation) and Mysore
# (princely state under the Company) keep the land of their legacy provinces.
# Only land the layer gives to the listed holders is reclaimed, never another
# real polity's own polygon (Coorg inside legacy Mysore).
KEEP_LEGACY = {'MOL': {'OTT', 'RUS', 'WAL', 'UNC'}, 'MYS': {'ENG', 'UNC'}}
NEW_NATIONS = Path(__file__).with_name('new-nations-1830.json')
STATE_MIN = 3       # provinces per state, grown by merging neighbours
STATE_MAX = 6
R = 6371.0088
KM2 = (math.pi / 180 * R) ** 2
def km2(g): return g.area * KM2 * math.cos(math.radians(g.centroid.y)) if not g.is_empty else 0.0

def spin(salt, lat, lon):
    h = hashlib.sha1(f'{salt}:{round(lat * 10)}:{round(lon * 10)}'.encode()).digest()
    return int.from_bytes(h[:4], 'big') % 1000 / 1000

def rgo_for(terrain, lat, lon, salt):
    s = spin(salt, lat, lon)
    if terrain == 'mountains': return 'iron' if s < 0.56 else 'coal'
    if terrain == 'hills': return 'iron' if s < 0.3 else ('coal' if s < 0.5 else 'cattle')
    if terrain in ('forest', 'jungle'): return 'timber' if s < 0.7 else 'cotton'
    if terrain == 'desert': return 'cotton' if s < 0.62 else 'cattle'
    if terrain == 'arctic': return 'cattle'
    if terrain == 'farmland': return 'grain' if s < 0.68 else 'cattle'
    if lon < -70 and 25 < lat < 48: return 'grain' if s < 0.5 else 'cotton'
    if lon > 100 and 18 < lat < 43: return 'grain' if s < 0.75 else 'coal'
    return 'grain' if s < 0.58 else 'cattle'

def main():
    feats = json.load(open(PROVINCES))['features']
    members = [json.loads(l)['members'] for l in PROVINCE_LIST.open()]
    att = {r['id']: r for r in json.load(open(ATTRIBUTES))}
    names = {r['id']: r for r in json.load(open(NAMES))}
    adj = json.load(open(ADJ))
    legacy = json.load(open(LEGACY_SEED))
    cross = json.load(open(CROSSWALK))
    caps = json.load(open(CAPITALS))['capitals']
    n = len(feats)

    new_nations = json.loads(NEW_NATIONS.read_text())['nations'] if NEW_NATIONS.exists() else []
    tag_of_key = {x['polityKey']: x['tag'] for x in new_nations}
    if NEW_NATIONS.exists():
        for key, fold in json.loads(NEW_NATIONS.read_text()).get('folds', {}).items(): tag_of_key[key] = fold['to']
    for x in new_nations:
        caps[x['tag']] = x['capital']
        legacy['nations'].append({k: v for k, v in x.items() if k not in ('polityKey', 'capital', 'flagSource') and v is not None}
                                 | {'coreStateIds': []})
    gc_tags = {x['tag'] for x in legacy['nations']}
    overlord = {x['polityKey']: x.get('runtimeOverlord') for x in cross['politiesWithoutGcNation']}
    def to_gc(key):
        key = tag_of_key.get(key, key)
        seen = set()
        while key and key not in gc_tags and key not in seen:
            seen.add(key); key = overlord.get(key); key = tag_of_key.get(key, key)
        return key if key in gc_tags else 'UNC'

    # legacy geometry and predecessors
    lgeo = {}
    for f in json.load(open(LEGACY_GEO))['features']:
        pid = f['properties'].get('id', f.get('id'))
        g = shape(f['geometry']); lgeo[pid] = g if g.is_valid else make_valid(g)
    lprov = {p['id']: p for p in legacy['provinces']}
    larea = {pid: km2(g) for pid, g in lgeo.items()}
    lstate = {s['id']: s for s in legacy['states']}
    nation_by_tag = {x['tag']: x for x in legacy['nations']}

    provinces = []
    for pid in range(n):
        f = feats[pid]; a = att[pid]
        ov = {int(k): v for k, v in a['legacyOverlapKm2'].items()}
        pred = max(ov, key=ov.get) if ov else None
        owner = to_gc(f['properties']['owners'].get(SCEN))
        lp = lprov.get(pred)
        if lp and lp['ownerTag'] != owner:
            lnat = nation_by_tag.get(lp['ownerTag'])
            if lnat and (lnat.get('overlordTag') == owner or owner in KEEP_LEGACY.get(lp['ownerTag'], ())): owner = lp['ownerTag']
        weight = 0.0  # filled below, once every successor of each legacy province is known
        lon, lat = a['labelPoint']
        provinces.append({
            'id': pid, 'key': names[pid]['key'], 'name': names[pid]['name'], 'ownerTag': owner,
            'terrain': a['terrain'], 'coastal': bool(a['coastal']),
            'rgoGood': rgo_for(a['terrain'], lat, lon, names[pid]['key']),
            'lon': lon, 'lat': lat, 'populationWeight': weight,
            'legacyName': lp['name'] if lp else None, 'legacyStateId': lp['stateId'] if lp else None,
            '_adm1': f['properties']['adm1Name'], '_pred': pred, '_ov': ov,
        })
    # Every legacy province names at least one successor, so region-keyed
    # content (culture minorities, placeholder natives) never drops out.
    named = Counter(p['_pred'] for p in provinces if p['_pred'] is not None)
    for lid in sorted(lprov):
        if named[lid]: continue
        cands = [p for p in provinces if lid in p['_ov'] and named[p['_pred']] > 1]
        if not cands: continue
        p = max(cands, key=lambda q: q['_ov'][lid])
        named[p['_pred']] -= 1; named[lid] += 1
        p['_pred'] = lid; p['legacyName'] = lprov[lid]['name']; p['legacyStateId'] = lprov[lid]['stateId']
    # Population: Maddison 1820 country totals (regional residuals for the
    # rest), split within each country by terrain-weighted land area and
    # modern urban population as a density proxy. Independent of the legacy
    # geometry, whose collapsed provinces (one for most of Britain) skewed it.
    assign_population(provinces, feats, names)
    # Game balance: each 1830 nation keeps the total population weight its
    # land carried on the pre-v8 map (legacy weights split by area), so great
    # power economies are unchanged. Maddison, terrain and urban data above
    # only decide how that total is distributed inside the nation.
    succ_area = defaultdict(float)
    for p in provinces:
        for k, v in p['_ov'].items(): succ_area[k] += v
    legacy_w = {p['id']: sum(lprov[k]['populationWeight'] * v / max(succ_area[k], 1e-9)
                              for k, v in p['_ov'].items() if k in lprov) for p in provinces}
    # The preserved unit is (owner, modern country): British India and the
    # British Isles each keep their own legacy total, so India's size cannot
    # drain London through the within-nation split.
    # Regions the legacy cut mis-split internally (it collapsed most of Great
    # Britain into one province beside three Irish ones) are preserved as a
    # whole, so Maddison's real ratios set the split inside them.
    MACRO = {'GBR': 'BRITISH_ISLES', 'IRL': 'BRITISH_ISLES', 'IMN': 'BRITISH_ISLES',
             'NLD': 'LOW_COUNTRIES', 'BEL': 'LOW_COUNTRIES', 'LUX': 'LOW_COUNTRIES'}
    cell = lambda p: (p['ownerTag'], MACRO.get(feats[p['id']]['properties']['iso'], feats[p['id']]['properties']['iso']))
    cell_legacy = defaultdict(float); cell_new = defaultdict(float)
    for p in provinces:
        cell_legacy[cell(p)] += legacy_w[p['id']]; cell_new[cell(p)] += p['populationWeight']
    for p in provinces:
        c = cell(p)
        if cell_new[c] > 0 and cell_legacy[c] > 0:
            p['populationWeight'] = p['populationWeight'] / cell_new[c] * cell_legacy[c]
        else:
            p['populationWeight'] = legacy_w[p['id']]
    # preserve the legacy world population total
    total_old = sum(p['populationWeight'] for p in legacy['provinces'])
    total_new = sum(p['populationWeight'] for p in provinces) or 1
    for p in provinces: p['populationWeight'] = round(p['populationWeight'] * total_old / total_new, 4)

    # neighbours
    nb = defaultdict(set)
    for a_, b_, _ in adj['land']: nb[a_].add(b_); nb[b_].add(a_)
    for a_, b_ in adj['sea']: nb[a_].add(b_); nb[b_].add(a_)
    for p in provinces: p['neighbors'] = sorted(nb[p['id']])

    # nations that own land
    owned = Counter(p['ownerTag'] for p in provinces)
    nations = [dict(x) for x in legacy['nations'] if owned[x['tag']] > 0 or x['tag'] == 'UNC']
    dropped = [x['tag'] for x in legacy['nations'] if x not in nations and owned[x['tag']] == 0 and x['tag'] != 'UNC']
    keep = {x['tag'] for x in nations}

    # states: grow from single provinces, merging the smallest into an
    # adjacent same-owner state (same predecessor state, then same region,
    # then longest shared border) until each holds STATE_MIN..STATE_MAX.
    shared = defaultdict(float)
    for a_, b_, l in adj['land']: shared[(a_, b_)] += l; shared[(b_, a_)] += l
    state_of = list(range(n)); members_of = {i: [i] for i in range(n)}
    def legacy_state(i): return provinces[i]['legacyStateId']
    changed = True
    while changed:
        changed = False
        for sid in sorted(members_of, key=lambda k: (len(members_of[k]), k)):
            if sid not in members_of or len(members_of[sid]) >= STATE_MIN: continue
            mine = members_of[sid]; owner = provinces[mine[0]]['ownerTag']
            ls = Counter(legacy_state(i) for i in mine).most_common(1)[0][0]
            region = Counter(provinces[i]['_adm1'] for i in mine).most_common(1)[0][0]
            score = defaultdict(float)
            for i in mine:
                for j_ in nb[i]:
                    t = state_of[j_]
                    if t == sid or provinces[j_]['ownerTag'] != owner: continue
                    if len(members_of[t]) + len(mine) > STATE_MAX: continue
                    w = shared.get((i, j_), 0.01)
                    if legacy_state(j_) == ls: w *= 4
                    if provinces[j_]['_adm1'] == region: w *= 2
                    score[t] += w
            if not score: continue
            t = max(score, key=lambda k: (score[k], -k))
            for i in mine: state_of[i] = t
            members_of[t] += members_of.pop(sid); changed = True
    states = [sorted(v) for _, v in sorted(members_of.items())]
    state_records = []
    used = Counter()
    for sid, ids in enumerate(states):
        lead = min(ids, key=lambda i: (tuple(names[i]['rank']), -provinces[i]['populationWeight'], i))
        name = provinces[lead]['name']
        used[name] += 1
        if used[name] > 1: name = f"{name} {used[name]}"
        score = Counter()
        for i in ids:
            for k, v in provinces[i]['_ov'].items():
                if k in lprov: score[lprov[k]['stateId']] += v
        lsid = score.most_common(1)[0][0] if score else None
        for i in ids: provinces[i]['stateId'] = sid; provinces[i]['stateName'] = name
        state_records.append({'id': sid, 'name': name, 'ownerTag': provinces[ids[0]]['ownerTag'], 'provinceIds': ids,
                              'legacyStateId': lsid, 'legacyStateName': lstate[lsid]['name'] if lsid is not None else None})

    # legacy state -> new states (for cores and formables)
    successors = defaultdict(set)
    for p in provinces:
        for k in p['_ov']:
            if k in lprov: successors[lprov[k]['stateId']].add(p['stateId'])
    def map_states(old_ids):
        out = set()
        for s in old_ids: out |= successors.get(s, set())
        return sorted(out)

    # capitals
    tree_geoms = [shape(f['geometry']) for f in feats]
    tree = STRtree(tree_geoms)
    for nat in nations:
        tag = nat['tag']
        mine = [p for p in provinces if p['ownerTag'] == tag]
        cap = caps.get(tag)
        chosen = None
        if cap:
            pt = Point(cap[1], cap[2])
            for j in tree.query(pt):
                if provinces[int(j)]['ownerTag'] == tag and tree_geoms[int(j)].contains(pt): chosen = int(j)
            if chosen is None and mine:
                chosen = min(mine, key=lambda p: (p['lon'] - cap[1]) ** 2 + (p['lat'] - cap[2]) ** 2)['id']
        if chosen is None and mine: chosen = max(mine, key=lambda p: p['populationWeight'])['id']
        nat['capitalProvinceId'] = chosen if chosen is not None else 0
        old_cores = nat.get('coreStateIds', [])
        owned_states = {s['id'] for s in state_records if s['ownerTag'] == tag}
        nat['coreStateIds'] = sorted(set(map_states(old_cores)) | owned_states)

    formables = []
    for fm in legacy.get('formables', []):
        fm = dict(fm)
        fm['candidateTags'] = [t for t in fm.get('candidateTags', []) if t in keep]
        fm['coreStateIds'] = map_states(fm.get('coreStateIds', []))
        formables.append(fm)

    out_provinces = []
    for p in provinces:
        out_provinces.append({k: p[k] for k in ('id', 'name', 'ownerTag', 'stateId', 'stateName', 'terrain', 'coastal',
                                                 'rgoGood', 'neighbors', 'lon', 'lat', 'populationWeight', 'legacyName')}
                             | {'legacyStateName': lprov[p['_pred']].get('stateName') if p['_pred'] in lprov else None})
    seed = {
        'source': 'world-v8', 'generatedAt': '1830-01-01T00:00:00.000Z', 'provinceCount': n,
        'provinces': out_provinces,
        'states': [{'id': s['id'], 'name': s['name'], 'ownerTag': s['ownerTag'], 'provinceIds': s['provinceIds'],
                    'legacyStateName': s['legacyStateName']} for s in state_records],
        'nations': nations, 'formables': formables,
    }
    OUT.write_text(json.dumps(seed, ensure_ascii=False))
    # save migration: legacy province -> [new province, share of legacy area]
    mig = defaultdict(list)
    for p in provinces:
        for k, v in p['_ov'].items(): mig[k].append([p['id'], v])
    mig_out = {}
    for k, lst in mig.items():
        tot = sum(v for _, v in lst)
        mig_out[str(k)] = [[pid, round(v / tot, 5)] for pid, v in sorted(lst, key=lambda e: -e[1])]
    MIGRATION.write_text(json.dumps({'from': 'legacy-1830-387', 'to': 'world-v8', 'provinces': mig_out,
                                     'states': {str(k): sorted(v) for k, v in successors.items()}}))
    print(json.dumps({'provinces': n, 'states': len(state_records), 'nations': len(nations), 'dropped': dropped,
                      'unclaimed': owned['UNC'], 'ownersTop': owned.most_common(8)}))

TERRAIN_DENSITY = {'farmland': 1.0, 'plains': 0.65, 'hills': 0.55, 'forest': 0.3, 'jungle': 0.25,
                   'mountains': 0.25, 'marsh': 0.2, 'desert': 0.04, 'arctic': 0.01}
REGION = {}
for r, isos in {
    'Western Europe': 'GBR IRL FRA BEL NLD LUX DEU CHE AUT LIE ITA SMR VAT MCO AND DNK NOR SWE FIN ISL ESP PRT GRC MLT CYP',
    'Eastern Europe': 'POL CZE SVK HUN ROU BGR ALB SRB HRV BIH SVN MKD MNE XKX RUS UKR BLR LTU LVA EST MDA GEO ARM AZE KAZ UZB TKM KGZ TJK',
    'Western Offshoots': 'USA CAN AUS NZL',
    'Middle East': 'TUR SYR LBN ISR PSE JOR IRQ IRN SAU YEM OMN ARE QAT BHR KWT EGY LBY TUN DZA MAR ESH',
    'Asia (East)': 'CHN JPN KOR PRK TWN MNG HKG MAC',
    'Asia (South and South-East)': 'IND PAK BGD LKA NPL BTN AFG MMR THA LAO KHM VNM MYS SGP IDN PHL BRN TLS MDV',
}.items():
    for iso in isos.split(): REGION[iso] = r

def region_of(iso, lon, lat):
    if iso in REGION: return REGION[iso]
    if lon < -30: return 'Latin America'
    if lon > 110 and lat < -10: return 'Western Offshoots'
    if lon > 90: return 'Asia (South and South-East)'
    return 'Sub-Sahara Africa'

def assign_population(provinces, feats, names):
    mad = json.loads(Path(__file__).with_name('maddison-1820.json').read_text())
    pop = dict(mad['population'])
    if 'GBR' in pop and 'IRL' in pop: pop['GBR'] -= pop['IRL']  # Maddison's UK includes Ireland
    unit_of = {}
    for g, isos in mad['groups'].items():
        for iso in isos: unit_of[iso] = g
    def unit(iso): return unit_of.get(iso, iso) if (unit_of.get(iso, iso) in pop) else None
    members = defaultdict(list)
    for p, f in zip(provinces, feats):
        iso = f['properties']['iso']; u = unit(iso)
        key = ('unit', u) if u else ('region', region_of(iso, p['lon'], p['lat']))
        members[key].append(p)
    # regional residual for countries without a figure
    listed = defaultdict(float)
    for (kind, k), ps in members.items():
        if kind == 'unit': listed[region_of(ps[0]['_iso'] if '_iso' in ps[0] else feats[ps[0]['id']]['properties']['iso'], ps[0]['lon'], ps[0]['lat'])] += pop[k]
    totals = {}
    for (kind, k), ps in members.items():
        totals[(kind, k)] = pop[k] if kind == 'unit' else max(mad['regions'].get(k, 0) - listed[k], 0.05 * mad['regions'].get(k, 0))
    for key, ps in members.items():
        land = [feats[p['id']]['properties']['km2'] * TERRAIN_DENSITY.get(p['terrain'], 0.4) ** 2 for p in ps]
        urb = [names[p['id']]['urban'] for p in ps]
        sl, su = sum(land) or 1, sum(urb)
        for p, a, u in zip(ps, land, urb):
            share = 0.5 * a / sl + 0.5 * (u / su if su > 0 else a / sl)
            p['populationWeight'] = totals[key] * share

def split_contiguous(ids, k, nb, provinces):
    import heapq
    mem = set(ids)
    pts = {i: (provinces[i]['lon'], provinces[i]['lat']) for i in ids}
    seeds = [min(ids, key=lambda i: pts[i])]
    while len(seeds) < k:
        far = max(ids, key=lambda i: min((pts[i][0] - pts[s][0]) ** 2 + (pts[i][1] - pts[s][1]) ** 2 for s in seeds))
        if far in seeds: break
        seeds.append(far)
    label = {s: c for c, s in enumerate(seeds)}; size = [1] * len(seeds); heap = []
    for c, s in enumerate(seeds):
        for j in nb[s]:
            if j in mem and j not in label: heapq.heappush(heap, (size[c], c, j))
    while heap:
        sz, c, j = heapq.heappop(heap)
        if j in label: continue
        if sz != size[c]: heapq.heappush(heap, (size[c], c, j)); continue
        label[j] = c; size[c] += 1
        for t in nb[j]:
            if t in mem and t not in label: heapq.heappush(heap, (size[c], c, t))
    for i in ids:
        if i not in label:
            label[i] = min(range(len(seeds)), key=lambda c: (pts[i][0] - pts[seeds[c]][0]) ** 2 + (pts[i][1] - pts[seeds[c]][1]) ** 2)
    out = defaultdict(list)
    for i, c in label.items(): out[c].append(i)
    return list(out.values())

if __name__ == '__main__':
    main()
