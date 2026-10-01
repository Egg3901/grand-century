"""Validate names-1830.json against a province name list.

Usage: check_names_1830.py <names.json or province-names-review.json>
The list is the names stage output (one object per province with key and name).
Checks: every override key exists, final names are unique under the same
case and accent folding names.py uses, and no override contains en or em
dashes, control characters or bidi marks.
"""
import json, sys, unicodedata
from collections import defaultdict
from pathlib import Path

def fold(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()

def main():
    rows = json.load(open(sys.argv[1]))
    over = json.loads((Path(__file__).parent / 'names-1830.json').read_text())
    keys = {r['key'] for r in rows}
    errors = [f'unknown key {k}' for k in over if k not in keys]
    for k, n in over.items():
        if any(c in n for c in '\u2013\u2014\u200e\u200f') or any(ord(c) < 32 for c in n):
            errors.append(f'bad character in {k}: {n!r}')
    seen = defaultdict(list)
    for r in rows:
        seen[fold(over.get(r['key'], r['name']))].append(r['key'])
    errors += [f'duplicate name {n!r}: {ks}' for n, ks in seen.items() if len(ks) > 1]
    print(f'{len(over)} overrides, {len(rows)} provinces, {len(errors)} errors')
    for e in errors: print(e)
    sys.exit(1 if errors else 0)

if __name__ == '__main__':
    main()
