#!/usr/bin/env bash
set -euo pipefail
app="$RUNNER_TEMP/grand-century-derived/Build/Products/Release-iphonesimulator/GrandCentury.app"
evidence="$RUNNER_TEMP/graphics-evidence"
mkdir -p "$evidence"
device=$(xcrun simctl list devices available --json | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; print(next(d["udid"] for devices in ds.values() for d in devices if "iPhone" in d["name"]))')
# Preserve diagnostics even if simulator startup or the render gate times out.
collect_failure() {
  local result=$?
  if [ "$result" -ne 0 ]; then
    python3 - "$device" "$evidence" "${container:-}" <<'PYTHON'
import subprocess, sys
from pathlib import Path
try:
    container = sys.argv[3] or subprocess.check_output(['xcrun', 'simctl', 'get_app_container', sys.argv[1], 'net.lakesidegames.grandcentury', 'data'], timeout=10, text=True).strip()
    progress = Path(container) / 'Documents/graphics-smoke-progress.json'
    if progress.exists(): (Path(sys.argv[2]) / 'progress.json').write_bytes(progress.read_bytes())
    subprocess.run(['xcrun', 'simctl', 'io', sys.argv[1], 'screenshot', str(Path(sys.argv[2]) / 'native-failure.png')], timeout=20, check=False)
except Exception as error:
    (Path(sys.argv[2]) / 'diagnostic-error.txt').write_text(str(error))
PYTHON
  fi
}
trap collect_failure EXIT
echo "Booting simulator"
if ! xcrun simctl list devices booted --json | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; sys.exit(0 if any(d["udid"] == sys.argv[1] for devices in ds.values() for d in devices) else 1)' "$device"; then
  xcrun simctl boot "$device"
fi
xcrun simctl bootstatus "$device" -b
echo "Installing native graphics check"
xcrun simctl install "$device" "$app"
echo "Launching native graphics check"
xcrun simctl launch "$device" net.lakesidegames.grandcentury
container=$(xcrun simctl get_app_container "$device" net.lakesidegames.grandcentury data)
# Multiple native readbacks for day, night and weather serialize GPU work.
# Keep a bounded six-minute evidence window; visual and camera gates are unchanged.
for attempt in $(seq 1 180); do
  if [ -f "$container/Documents/graphics-smoke.json" ]; then
    cp "$container/Documents/graphics-smoke.json" "$evidence/result.json"
    xcrun simctl io "$device" screenshot "$evidence/native-high.png"
    python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(json.dumps(r,indent=2)); assert r["ok"] and len(r["results"])==3; assert r["campaignStorage"]["ok"] and r["campaignStorage"]["separateSaves"]; assert r["results"][2]["height"] < r["results"][1]["height"] - 100' "$evidence/result.json"
    exit 0
  fi
  sleep 2
done
xcrun simctl io "$device" screenshot "$evidence/native-timeout.png"
echo "Native graphics did not present a verified frame before the deadline." >&2
exit 1
