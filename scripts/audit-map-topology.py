"""Validate candidate geometry before map promotion. Requires shapely 2.1.2.
No automatic repair: invalid rings and interior overlaps require source decisions.
"""
import argparse
import json
from pathlib import Path
from shapely.geometry import shape
from shapely.strtree import STRtree
from shapely.validation import explain_validity

parser = argparse.ArgumentParser()
parser.add_argument('--geometry', default='src/data/generated/provinces.geo.json')
parser.add_argument('--out', default='artifacts/topology-audit.json')
args = parser.parse_args()
features = json.loads(Path(args.geometry).read_text())['features']
geometries = [shape(feature['geometry']) for feature in features]
ids = [feature.get('id', feature.get('properties', {}).get('id')) for feature in features]
errors = []
if len(ids) != len(set(ids)) or any(key is None for key in ids):
    errors.append({'kind': 'invalid-identities'})
for key, geometry in zip(ids, geometries):
    if geometry.is_empty or not geometry.is_valid:
        errors.append({'kind': 'invalid-geometry', 'id': key, 'reason': explain_validity(geometry)})
if not errors:
    tree = STRtree(geometries)
    for i, geometry in enumerate(geometries):
        for j in tree.query(geometry, predicate='intersects'):
            if int(j) <= i:
                continue
            # Shared edges have zero area. No per-province buffer/smoothing repair.
            overlap = geometry.intersection(geometries[int(j)]).area
            if overlap > 1e-9:
                errors.append({'kind': 'exclusive-overlap', 'ids': [ids[i], ids[int(j)]], 'squareDegrees': overlap})
report = {'ok': not errors, 'features': len(features), 'errors': errors}
output = Path(args.out)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + '\n')
print(f"{'PASS' if report['ok'] else 'FAIL'}: {len(features)} provinces, {len(errors)} topology errors")
raise SystemExit(0 if report['ok'] else 1)
