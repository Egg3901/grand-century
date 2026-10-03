#!/usr/bin/env bash
# Install a finished world v8 build into the repo and regenerate everything
# derived from it. Usage: install.sh <work-dir> <terrain-tile-cache> [--no-terrain]
#   <terrain-tile-cache> holds Terrarium z3/z4 PNG tiles and NE1_LR_LC.zip.
set -euo pipefail
W=$1; CACHE=$2; TERRAIN=${3:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"
cp "$W/worldSeed.json" src/data/generated/worldSeed.json
cp "$W/provinces.geo.json" src/data/generated/provinces.geo.json
cp "$W/legacy-migration.json" src/data/generated/legacy-migration.json
node scripts/build-flags.mjs
npm run -s map:history
for s in 1700-01-01 1776-07-04 1815-06-18 1914-07-28 1936-01-01 1945-09-02; do
  npm run -s scenario:seed -- compile --scenario-dir "content/scenarios/$s" \
    --base-seed src/data/generated/worldSeed.json --out-dir "src/data/scenarios/$s"
done
npm run -s mobile:atlas
node scripts/build-province-edges.mjs
node scripts/sync-mobile-flags.mjs
if [[ "$TERRAIN" != "--no-terrain" ]]; then
  python3 scripts/build-terrain-atlas.py --cache "$CACHE" --landcover "$CACHE/NE1_LR_LC.zip"
  python3 scripts/build-terrain-atlas.py --cache "$CACHE" --landcover "$CACHE/NE1_LR_LC.zip" --quality high
  npm run -s mobile:atlas   # re-bake native terrain from the new atlases
fi
node scripts/check-terrain-fingerprint.mjs
npx tsx scripts/generate-save-fixture.ts tests/fixtures/current-v1.save.gz
npx tsx scripts/generate-save-fixture.ts tests/fixtures/pre-fingerprint-v1.save.gz --legacy
