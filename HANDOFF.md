# Handoff — Victoria II map re-cut + 1830 start

Branch `vic2-1830-map`, written 2026-08-27, **merged to `master` and deployed
2026-08-28**. This is now a record of what changed and what to watch, not a list
of work in progress.

## What this branch did

Grand Century's province map used to be Natural Earth's modern admin-1 units with
a hand-written 1820 overlay on top. It is now cut to **Victoria II's 549 state
regions**, with ownership taken from Vic2's own province history and rolled back
to **1 January 1830**.

| | before | after |
|---|---|---|
| Provinces | 657 (modern admin-1) | **545** (Vic2 state regions) |
| States | 657 (1:1, degenerate) | **216**, single-owner, cut along nationality |
| Nations | 80 | **93 with land**, 102 tags in the library |
| Epoch | 1820-01-01 | **1830-01-01** |
| `provinces.geo.json` | 159 KB gzip | **86 KB gzip** |
| Cultures | 33 | **34** (`indigenous_american` added) |

Full pipeline documentation is in **`docs/VIC2-PIPELINE.md`** — read that first.

## State of play

Unit suite 211 passed / 0 failed, balance 11 passed, `tsc -b` clean, lint clean,
the opt-in pacing probe green with a regenerated baseline. The geometry gate
(`tests/generated.mapdata.test.ts`, 7/7) passes; it was the hardest thing to get
green and it stayed green through everything below.

**The re-cut silently broke every derived layer, and no test caught any of it.**
That is the single most useful thing on this page. The map was correct while the
world built on top of it was not:

- **67 of 96 `MINORITY_RULES` keys named provinces that no longer existed.**
  The table is keyed by generated province name and the re-cut renamed
  everything. Ireland had no Irish, Hungary no Hungarians, Greece no Greeks.
- **36 of 93 nations came out British.** `cultureIndex` falls back to index 0,
  which is `british`, and the re-cut writes raw Vic2 culture keys into the seed.
  Serbia, Tibet, Zululand and Oman were all British; Greece was French.
- **412 of 545 provinces were their own neighbour.** topojson's `neighbors()`
  reports a merged MultiPolygon as adjacent to itself, and every Vic2 region is
  merged from several polygons.
- **Finland was deleted.** Vic2 ships the Grand Duchy as plain Russian territory,
  so deferring to Vic2 ownership dropped a polity the game already modelled.
- **States were cut by geography alone**, so Österreich, Bohemia, Central
  Hungary, West Galicia and Slovakia shared one state. A movement heartland is a
  state where a culture holds 35%, so no nationality in Austria could ever have
  one and Hungary could not revolt.
- **`statesOf` returned one id per province**, so a state repeated once per
  province in it. `evaluateNationFormable` deduped and `seedCoreShare` did not,
  so formable alarm thresholds were compared against an inflated baseline.

All fixed, and each now has a lint that fails loudly instead: see the
`cultural seeding tables resolve against the generated map` and
`generated map adjacency` blocks in `tests/content.lint.test.ts`.

**Still open, all design calls rather than bugs**

1. **The tech tree ends in 1915 and the campaign runs to 1930.** Tech year gates
   were deliberately not shifted, since they are absolute historical dates and
   Vic2 does the same across its bookmarks. The pacing probe no longer asserts a
   tech cadence past the last tech year, but the last fifteen years of a
   campaign still have nothing left to research. Extending the late tree by a
   decade is the real fix.
2. **`MainMenu` seed default is still 1820.** It is an RNG seed, not a date.
   Changing it alters procedural worlds and invalidates shared permalinks, so it
   is left alone on purpose.
3. **Sim throughput is ~3.3 ms per province-year**, about 0.55 sim-years per
   second. The perf ceiling was raised 4 -> 5.5 to cover 93 nations and a
   culture system that now does real work. That is a recording, not an
   aspiration, but the game is not fast.

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

**States are cut by owner, then nationality, then geography.**
`compileHistoricalWorld` rejects a state that crosses owners, so
`clusterRegionsIntoStates` groups by `ownerTag|nationality` before clustering
geographically, where the nationality comes from `NATIONALITY_GROUPS` in
`content/build-map.mjs`. The nationality term is load-bearing, not cosmetic:
without it k-means merges whichever peoples happen to be adjacent, and since a
national movement's heartland is a state where its culture holds 35%, no
minority in a multinational empire can ever hold one. Clusters also split until
every member sits within `MAX_STATE_RADIUS_DEG` (10°) of its centre — without
that, Denmark's six regions become one "state" spanning Jutland, Iceland,
Greenland and the Gold Coast.

**Anything keyed by generated province name will rot on the next rebuild.**
`MINORITY_RULES`, `PLACEHOLDER_NAME_RULES`, `SOUTH_ASIAN_SUNNI` and
`NATIONALITY_GROUPS` are all name-keyed, and a rename does not throw, it just
silently stops matching. The content lint asserts every key still resolves. Add
to that lint whenever you add a name-keyed table.

**`cultureIndex` has a silent fallback to index 0.** Pass it an unknown culture
key and you get `british`, with no warning. `VIC2_CULTURE_TO_GC` maps Vic2's
~200 cultures onto this game's 34, and the content lint asserts every seeded
primary culture resolves without hitting the fallback.

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
content/vic2/vic2-1830-deltas.json        18 sourced 1836 -> 1830 rollback deltas
docs/VIC2-PIPELINE.md                     full pipeline documentation
```

`content/history/1820/` moved to `content/history/1830/`. `ownership.json` is now
empty by design — ownership comes from Vic2 at build time; the file remains as
the escape hatch for corrections that cannot be expressed as a region delta.
