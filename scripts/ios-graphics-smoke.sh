#!/usr/bin/env bash
set -euo pipefail
app="$RUNNER_TEMP/grand-century-derived/Build/Products/Release-iphonesimulator/GrandCentury.app"
evidence="$RUNNER_TEMP/graphics-evidence"
mkdir -p "$evidence"
device=$(xcrun simctl list devices available --json | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; print(next(d["udid"] for devices in ds.values() for d in devices if "iPhone" in d["name"]))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
xcrun simctl launch "$device" net.lakesidegames.grandcentury
container=$(xcrun simctl get_app_container "$device" net.lakesidegames.grandcentury data)
for attempt in $(seq 1 90); do
  if [ -f "$container/Documents/graphics-smoke.json" ]; then
    cp "$container/Documents/graphics-smoke.json" "$evidence/result.json"
    xcrun simctl io "$device" screenshot "$evidence/native-high.png"
    python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(json.dumps(r,indent=2)); assert r["ok"] and len(r["results"])==3; assert r["results"][2]["height"] < r["results"][1]["height"] - 100' "$evidence/result.json"
    exit 0
  fi
  sleep 2
done
xcrun simctl io "$device" screenshot "$evidence/native-timeout.png"
echo "Native graphics did not present a verified frame before the deadline." >&2
exit 1
