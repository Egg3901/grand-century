# The Victoria II map pipeline

Grand Century's province map is cut to **Victoria II's 549 state regions**, with
geometry from Natural Earth and ownership from Vic2's own province history,
rolled back to 1 January 1830.

Vic2 data is *not* checked in — it is read from a local install. What is checked
in are the extracted tables under `content/vic2/`, so the map builds on a machine
that has never seen Victoria II.

## Why regions and not provinces

Vic2 ships 2,702 land provinces. That is roughly four times the province budget
this sim runs comfortably in a browser tab, so the unit of play is Vic2's
**state region** (549 of them, median 5 Vic2 provinces each) rather than its
province. Regions carry real historical names and a granularity that is already
dense in Europe and sparse in the interior of Africa and Asia, which is the
distribution we want.

The tradeoff is that a state which never *dominates* a region disappears. Parma
and Lucca are minority owners inside Vic2's Emilia region, so they are absorbed;
the map build logs every minor it drops. This is deliberate, not a bug.

## The stages

### 1. `content/vic2/extract-vic2-reference.mjs`

Reads a Vic2 install and writes `vic2-reference.json`: 549 regions with
localised names and member provinces, 220 country tags with colours, capitals,
cultures and governments, and province ownership at the 1836 baseline.

Vic2 text is Windows-1252, which Node cannot decode natively, so the script
carries its own 0x80–0x9F table. Three region keys Vic2 never localises are
named explicitly.

```bash
node content/vic2/extract-vic2-reference.mjs ["path/to/Victoria 2"]
```

### 2. `content/vic2/calibrate-projection.mjs`

Reads `provinces.bmp` (5616×2160, 24-bit) and computes a pixel centroid and
area for every province, then fits pixel → lon/lat against provinces Vic2 names
after real cities.

**Vic2's map is hand-drawn, not a projection.** Longitude is very nearly
equirectangular, but a single global latitude fit is off by up to 8°, and the
error is regional rather than latitudinal — the Americas read about +7°, Asia
about −4.5°. A global fit is therefore unusable, which is why there is a
step 3.

### 3. `content/vic2/build-region-points.mjs`

Places every region at a real lon/lat:

1. matches Vic2 province names against Natural Earth's populated-places
   gazetteer, using the reliable longitude fit to pick between same-name places;
2. drops outliers over two leave-one-out rounds;
3. fits a **local** affine warp (24 nearest anchors, distance-weighted least
   squares) so the regional distortion is absorbed;
4. reports leave-one-out residuals.

Current fit: 1,519 anchors, mean error 0.49° longitude and 0.40° latitude,
worst-case 2.9° latitude — against 8.4° for the naive global fit.

### 4. `content/vic2/vic2-1830-deltas.json`

Vic2's earliest bookmark is 1836, so 16 hand-sourced deltas roll the baseline
back six years: Algiers still Ottoman, Belgium still Dutch, Texas still Mexican,
Gran Colombia still intact, Ottoman Syria not yet Egyptian, Congress Poland
still a constituent kingdom.

Each delta records the owner Vic2 ships and fails loudly if the install
disagrees, so a Vic2 patch surfaces as an error rather than a quietly wrong map.

### 5. `content/build-map.mjs`

Voronoi-partitions each Natural Earth parent by the region seeds near it and
merges the pieces by region, so each Vic2 region becomes exactly one province.
States are k-means clusters of regions grouped by owner and region-key prefix —
grouping by owner matters because the historical compiler requires every state
to have exactly one owner.

`NATION_LIBRARY` keeps its hand-written Grand Century entries and fills the rest
in from Vic2's country table. `VIC2_TAG_ALIAS` maps Vic2 spellings onto the tags
existing content is keyed to (`CHI`→`QNG`, `TUR`→`OTT`, `JAP`→`JPN`, and so on).

```bash
node content/build-map.mjs      # regenerate the map
npm run map:history             # apply the 1830 polity overlay
```

## Refreshing from a new Vic2 version

```bash
node content/vic2/extract-vic2-reference.mjs
node content/vic2/calibrate-projection.mjs
node content/vic2/build-region-points.mjs
node content/build-map.mjs
npm run map:history
```

The 1830 deltas assert their expected pre-state, so any region Paradox moved
between versions fails the run by name.

## Current output

| | |
|---|---|
| Provinces | 545 (4 island regions have no land at Natural Earth 50m) |
| States | 216, single-owner, cut along nationality |
| Nations | 93 with land, 102 tags in the library |
| Epoch | 1830-01-01 |
