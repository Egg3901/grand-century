#!/usr/bin/env bash
# Rebuild the world v8 mesh and 1830 seed. Usage: run.sh <sources-dir> <work-dir> [from-stage]
# Sources: geoBoundaries CGAZ ADM1/ADM2 GeoJSON, Natural Earth 10m populated places
# GeoJSON, NE1_LR_LC.tif and Terrarium z4 tiles (tiles/4-x-y.png). See README.md.
set -euo pipefail
SRC=$1; W=$2; FROM=${3:-atoms}
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
SCEN="1700-01-01 1776-07-04 1815-06-18 1830-01-01 1914-07-28 1936-01-01 1945-09-02"
LAYERS=$(for s in $SCEN; do echo -n "$ROOT/content/scenarios/$s/compiled/world-borders.geo.json "; done)
LEGACY_SEED=${LEGACY_SEED:-$ROOT/src/data/generated/worldSeed.json}
LEGACY_GEO=${LEGACY_GEO:-$ROOT/src/data/generated/provinces.geo.json}
export PROCS=${PROCS:-6}
step() { [[ " atoms cut group export attributes names seed runtime " == *" $FROM "* ]] || { echo "unknown stage $FROM"; exit 2; }; }
step
run() { echo "== $1"; shift; "$@"; }
go=0
for stage in atoms cut group export attributes names seed runtime; do
  [[ $stage == "$FROM" ]] && go=1
  [[ $go == 1 ]] || continue
  case $stage in
    atoms) run atoms python3 "$HERE/atoms.py" "$SRC" "$W/atoms.ndjson" ;;
    cut) run cut python3 "$HERE/cut.py" "$W/atoms.ndjson" "$W/pieces.ndjson" $LAYERS ;;
    group) run group python3 "$HERE/group.py" "$W/pieces.ndjson" "$W/provinces.ndjson" ;;
    export) run export python3 "$HERE/export.py" "$W/pieces.ndjson" "$W/provinces.ndjson" "$W/provinces-full.geojson" ;;
    attributes) run attributes python3 "$HERE/attributes.py" "$W/provinces-full.geojson" "$W/provinces.adjacency.json" "$LEGACY_GEO" "$SRC/tiles" "$SRC/NE1_LR_LC.tif" "$W/attributes.json" ;;
    names) run names python3 "$HERE/names.py" "$W/provinces-full.geojson" "$W/pieces.ndjson" "$W/provinces.ndjson" "$SRC/ne_10m_populated_places.geojson" "$ROOT/content/history/1830/cities.json" "$HERE/names-1830.json" "$W/names.json" ;;
    seed) run seed python3 "$HERE/seed.py" "$W/provinces-full.geojson" "$W/provinces.ndjson" "$W/pieces.ndjson" "$W/attributes.json" "$W/names.json" "$W/provinces.adjacency.json" "$LEGACY_SEED" "$LEGACY_GEO" "$ROOT/content/scenarios/1830-01-01/sources/gc-nation-crosswalk.json" "$HERE/capitals-1830.json" "$W/worldSeed.json" "$W/legacy-migration.json" ;;
    runtime)
      run simplify mapshaper -i "$W/provinces-full.geojson" -simplify 4% keep-shapes -o "$W/provinces-s.geojson"
      run runtime python3 "$HERE/runtime.py" "$W/provinces-s.geojson" "$W/provinces-full.geojson" "$W/provinces.geo.json" ;;
  esac
done
