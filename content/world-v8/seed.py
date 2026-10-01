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

    gc_tags = {x['tag'] for x in legacy['nations']}
    overlord = {x['polityKey']: x.get('runtimeOverlord') for x in cross['politiesWithoutGcNation']}
    def to_gc(key):
        seen = set()
        while key and key not in gc_tags and key not in seen:
            seen.add(key); key = overlord.get(key)
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
            if lnat and lnat.get('overlordTag') == owner: owner = lp['ownerTag']
        weight = sum(lprov[k]['populationWeight'] * v / max(larea.get(k, 1e-9), 1e-9) for k, v in ov.items() if k in lprov)
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
        lead = max(ids, key=lambda i: (provinces[i]['populationWeight'], -i))
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
                                                 'rgoGood', 'neighbors', 'lon', 'lat', 'populationWeight', 'legacyName')})
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
