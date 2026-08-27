# Handoff — Victoria II map re-cut + 1830 start

Branch: `vic2-1830-map`. Written 2026-08-27.

## What this branch does

Grand Century's province map used to be Natural Earth's modern admin-1 units with
a hand-written 1820 overlay on top. It is now cut to **Victoria II's 549 state
regions**, with ownership taken from Vic2's own province history and rolled back
to **1 January 1830**.

| | before | after |
|---|---|---|
| Provinces | 657 (modern admin-1) | **545** (Vic2 state regions) |
| States | 657 (1:1, degenerate) | **202**, all single-owner |
| Nations | 80 | **92 with land**, 101 tags in the library |
| Epoch | 1820-01-01 | **1830-01-01** |
| `provinces.geo.json` | 159 KB gzip | **86 KB gzip** |

Full pipeline documentation is in **`docs/VIC2-PIPELINE.md`** — read that first.

## State of play

**Done and verified**
- Vic2 extraction, projection calibration, region placement, the 1830 rollback,
  the map re-cut, the epoch move, flags for all 92 nations.
- `npx tsc -b` is clean.
- `tests/generated.mapdata.test.ts` passes (7/7) — this is the geometry gate and
  it was the hardest thing to get green.
- `tests/historical.map.test.ts` rewritten for the Vic2 map and passing.
- `node content/build-map.mjs && npm run map:history` runs clean end to end.

**Not finished — pick up here**

1. **Unit suite: 188 passing, 17 failing across 7 files** (last full run, before
   the Zollverein fix below — so roughly 16 remain). Get the current list with:

   ```bash
   npx vitest run --project unit 2>&1 | grep -E "^ FAIL|Tests "
   ```

   Verified green individually: `generated.mapdata` (7/7, the geometry gate),
   `historical.map`, `u2.risorgimento`, `u5.chronicle`, `content.lint`.

   Known remaining failure: `u1.unification` — *"great powers sour on a
   near-complete unifier"* asserts `expected 0 to be less than 0`. Prussia's
   core share of Germany changed with the new map, so the balance-of-power
   pressure it is measuring no longer triggers. This is a real consequence of
   the re-cut, not a mechanical port error, and wants a look at whether the
   German core set or the threshold is what should move.

   The Zollverein test *was* failing because the campaign now opens in 1830 and
   the decision gate moved to 1834 (see point 3); its `jumpToYear` was still
   1830. Fixed — treat it as the template for any other test that jumps to a
   year that is now the start year.

2. **`tests/baselines/pacing.baseline.json` is stale.** It records century-pacing
   observations from the old 620-province world. The map changed completely, so
   these numbers are meaningless now and the test will fail. Regenerating it is a
   balance judgement — look at the new numbers before pinning them.
3. **Three content gates were shifted so the date move did not unlock things on
   day one:** Zollverein 1828 -> 1834 (the real German Customs Union date; 1828
   would now be open at start), Gran Colombia formable 1825 -> 1835, and the
   border-incident event 1820 -> 1830. Tests that assumed the old years need the
   same treatment.

4. **Tech year gates were deliberately not shifted.** They are absolute
   historical dates (Vic2 does the same across its 1836/1861 bookmarks), so the
   tree still completes at 1920 while the campaign now runs 1830–1930. You may
   want to extend the late-game tree by a decade. That is a design call, not a
   port bug.
5. **`MainMenu` seed default is still 1820.** It is an RNG seed, not a date, so
   changing it alters procedural worlds and invalidates shared permalinks. Left
   alone on purpose.

## Getting the repo running on the VPS

```bash
git clone <repo> && cd grand-century
git checkout vic2-1830-map
npm install
npm run dev
```

The generated map is committed, so **the app runs without Victoria II and
without the Natural Earth sources.** You only need those to *rebuild* the map.

### To rebuild the map

`content/raw/` is gitignored (8.8 MB of Natural Earth data). Re-fetch it:

```bash
mkdir -p content/raw && cd content/raw
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_50m_admin_1_states_provinces.geojson \
         ne_110m_admin_1_states_provinces.geojson \
         ne_110m_admin_0_countries.geojson \
         ne_10m_populated_places_simple.geojson; do
  curl -sSL -o "$f" "$BASE/$f"
done
cd ../..
node content/build-map.mjs
npm run map:history
```

**You do not need Victoria II installed to rebuild the map.** The extracted Vic2
tables are committed under `content/vic2/` (764 KB). A Vic2 install is only
needed to *re-extract* them, which is only necessary after a Paradox patch:

```bash
node content/vic2/extract-vic2-reference.mjs "/path/to/Victoria 2"
node content/vic2/calibrate-projection.mjs   "/path/to/Victoria 2"
node content/vic2/build-region-points.mjs    "/path/to/Victoria 2"
```

On this Windows box Vic2 lives at
`C:\Program Files (x86)\Steam\steamapps\common\Victoria 2` (Steam app 42960).

## Things worth knowing before you change anything

**Vic2's map is hand-drawn, not a projection.** Longitude is near-perfect
equirectangular, but a global latitude fit is off by up to 8° in a *regional*
pattern — the Americas read about +7°, Asia about −4.5°. That is why
`build-region-points.mjs` matches 1,519 Vic2 province names against a gazetteer
and fits a *local* affine warp (mean error 0.49° lon / 0.40° lat). Do not
replace this with a global formula; it will not work.

**Do not set `artificialCuts: true` on the Vic2 units.** The debox jitter pass
was written for straight bbox cuts. Voronoi chords are already shared exactly
between neighbouring cells, and jittering each side independently tears the
shared edge apart. That single flag was worth 753 overlap slivers and 480 KB of
gzip.

**Clipping concave coastlines needs a deep repair.** `repairSelfIntersectingRing`
had a `depth > 12` ceiling that silently returned unrepaired rings; it is now 96.
Export quantization can also *re-introduce* self intersections after repair, so
`compactGeojson` repairs once more on the quantized result. Both were needed to
get the geometry test green.

**States must be single-owner.** `compileHistoricalWorld` rejects a state that
crosses owners, so `clusterRegionsIntoStates` groups by `ownerTag|regionPrefix`
before clustering geographically. Clusters also split until every member sits
within `MAX_STATE_RADIUS_DEG` (10°) of its centre — without that, Denmark's six
regions become one "state" spanning Jutland, Iceland, Greenland and the Gold
Coast.

**Micro-states are absorbed on purpose.** At 549-region granularity a nation that
never *dominates* a region has nowhere to sit. Parma is a minority owner inside
Vic2's Emilia region, so it is gone; `buildNations` logs every minor it drops and
throws only if a great power ends up landless. This was explicitly agreed — not
every country needs to be simulated.

**Content keyed to state names is fragile.** State names now come from the Vic2
cut, so a rebuild can rename one out from under a formable. `statesNamed()`
records unresolved lookups in `UNRESOLVED_STATE_NAMES` and
`tests/content.lint.test.ts` asserts it is empty, so this fails loudly instead of
shipping empty cores. Five formables were re-pointed already (Germany, Italy,
Gran Colombia, Scandinavia, Iberia).

**The 1830 deltas assert their own preconditions.** Each entry in
`content/vic2/vic2-1830-deltas.json` records the owner Vic2 ships and the build
fails by name if the install disagrees — so a Paradox patch surfaces as an error
rather than a quietly wrong map.

## Tag mapping

Vic2 spellings are mapped onto the tags existing content already uses, via
`VIC2_TAG_ALIAS` in `content/build-map.mjs`:

`CHI→QNG`, `TUR→OTT`, `SPA→ESP`, `NET→NLD`, `BRZ→BRA`, `JAP→JPN`, `DAI→VIE`,
`VNZ→VEN`, `URU→URY`, `SIC→TSC`, `ALD→ALG`.

Everything else keeps its Vic2 tag and is filled in from Vic2's country table
(name, colour, government, primary culture).

## New files

```
content/vic2/extract-vic2-reference.mjs   Vic2 install -> reference tables
content/vic2/calibrate-projection.mjs     provinces.bmp -> pixel centroids + global fit
content/vic2/build-region-points.mjs      regions -> real lon/lat via local warp
content/vic2/vic2-reference.json          549 regions, 220 tags, 1836 ownership
content/vic2/vic2-province-points.json    per-province pixel centroids
content/vic2/vic2-region-points.json      per-region lon/lat (the map's seed points)
content/vic2/vic2-1830-deltas.json        16 sourced 1836 -> 1830 rollback deltas
docs/VIC2-PIPELINE.md                     full pipeline documentation
```

`content/history/1820/` moved to `content/history/1830/`. `ownership.json` is now
empty by design — ownership comes from Vic2 at build time; the file remains as
the escape hatch for corrections that cannot be expressed as a region delta.
