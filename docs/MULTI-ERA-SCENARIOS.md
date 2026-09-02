# Multi-era scenarios

## Product direction

Grand Century is a historical grand-strategy engine with curated scenarios spanning roughly 1700 through 1945. Victoria II remains an important design and data reference, not the product boundary and not a runtime dependency.

Each selectable date is a complete Scenario. It must seed political geography, the polity roster and relationships, population, economy, technology, institutions, diplomacy, wars, claims, and date-specific content. A date-filtered map alone is not a playable scenario.

The 1933-1945 period may be represented in mechanics and neutral historical text, but shipped visual assets must contain no Nazi imagery. Do not ship swastikas, Nazi Party or SS insignia, propaganda, uniforms, or portraits. Use a neutral German identifier and a non-Nazi flag treatment approved with the scenario art pass.

## Registered scenario ladder

These are production milestones, not promises that a year is ready because a map exists:

| Scenario | Runtime state | Map provenance |
|---|---|---|
| 1700-01-01 | Development anchor | Reviewed 1700 OHM and Cliopatria source pack |
| 1776-07-04 | Development anchor | Reviewed exact-date 1776 OHM and Cliopatria source pack |
| 1815-06-18 | Development anchor | Reviewed exact-date 1815 OHM and Cliopatria source pack |
| 1830-01-01 | Playable compatibility anchor | Existing reviewed baseline |
| 1914-07-28 | Selectable preview anchor | Reviewed exact-date 1914 OHM and Cliopatria source pack |
| 1936-01-01 | Selectable preview anchor | Reviewed 1936 OHM and Cliopatria source pack |
| 1945-09-02 | Selectable preview anchor | Reviewed 1945 OHM and Cliopatria source pack, with two cited OHM temporal geometry fallbacks for occupied Germany |

Every registered date now has its own source pack, compiled borders, roster, relationships, and seed. The 1700, 1776, and 1815 anchors remain hidden because 98, 94, and 89 inherited province centroids respectively fall outside reviewed ownership polygons. Their `UNC` assignments are explicit diagnostics, not inherited ownership.

The 1914, 1936, and 1945 anchors are exposed as clearly labeled previews: all 548 province centroids are assigned through reviewed geometry plus explicit projection ledgers. Coarse microstate and small-dependency representation still blocks playable promotion. Germany uses the neutral `GER` tricolor where the late-era visual policy applies, while the 1945 map represents territorial control through four Allied occupation administrations.

## OpenHistoricalMap's role

OpenHistoricalMap is a strong Historical Source and a poor sole database of record.

Useful inputs:

- Dated administrative-boundary geometry with `start_date` and `end_date`.
- Stable external identity links, commonly Wikidata IDs.
- Names in local and translated forms.
- Source and license tags on individual features.
- Fine-grained regional work that is much better than projecting modern borders backward.

Insufficient by itself:

- `admin_level=2` relations are not a playable roster. They mix sovereigns, colonies, constituents, disputed claims, and separately mapped fragments.
- Coverage is uneven by region and date, and overlapping relations can all be valid evidence.
- The map does not provide the economy, population, military, institutions, technology, diplomacy, or game balance needed by a Scenario.
- A rendered OHM date is a filtered view of community data, not an assertion that every place on Earth has complete coverage.

OHM data is CC0 by default, but individual elements can carry another open license. Every imported feature must retain its element ID, source tags, and license tags so the compiler can produce a provenance report and reject unreviewed share-alike content. See the [OHM copyright page](https://www.openhistoricalmap.org/copyright) and the [date-filter plugin contract](https://github.com/OpenHistoricalMap/maplibre-gl-dates).

### Live feasibility audit

On 2026-09-01, a tags-only query of the public [OHM Overpass endpoint](https://overpass-api.openhistoricalmap.org/api/interpreter) returned 3,953 `boundary=administrative`, `admin_level=2` relations. All 3,953 had a start or end date, 3,943 had names, and 3,546 had Wikidata IDs. Grouping relations active in each year by Wikidata ID, falling back to name, produced this evidence inventory:

| Year | Active relations | Unique identity keys |
|---:|---:|---:|
| 1700 | 187 | 180 |
| 1756 | 200 | 193 |
| 1789 | 182 | 176 |
| 1815 | 236 | 217 |
| 1830 | 223 | 215 |
| 1854 | 226 | 218 |
| 1861 | 236 | 217 |
| 1900 | 205 | 193 |
| 1914 | 202 | 195 |
| 1919 | 210 | 201 |
| 1936 | 212 | 202 |
| 1945 | 223 | 204 |

These are not polity counts. Some identities have several simultaneous relations, while dependent territories and claims can have their own level-2 relation. The counts show useful coverage across the whole requested era, not completeness.

A representative geometry query for relation `2660798`, Baden from 1819-09-08 through 1871-05-04, returned all 255 boundary ways with geometry. This is sufficient to justify an OHM import adapter and a polygon-assembly prototype. It does not remove the need for regional gap, overlap, validity, and provenance checks.

### Authoring commands

The OHM adapter is offline by default. A command reads a query-fingerprinted cache and fails if the cache is missing or belongs to another query. `--refresh` is the only mode that contacts the public Overpass endpoint.

```bash
# Discover dated level-2 relations for roster research.
npm run scenario:ohm -- discover \
  --date 1830-01-01 \
  --cache .scenario-cache/ohm/admin-2.json \
  --refresh \
  --out artifacts/scenarios/ohm-1830-candidates.json

# Fetch and compile only relations curated in the Scenario Source Pack.
npm run scenario:ohm -- compile \
  --spec content/scenarios/1830-01-01/sources/ohm.json \
  --cache .scenario-cache/ohm/1830-curated.json \
  --refresh \
  --out artifacts/scenarios/ohm-1830-compiled.json

# Omit --refresh to reproduce the exact compilation without network access.

# Validate catalog dates, source references, roster links, and visual policy.
npm run scenario:validate

# Regenerate the stable identity review queue while preserving prior decisions.
npm run scenario:roster -- scaffold \
  --discovery content/scenarios/1700-01-01/sources/ohm-discovery.json \
  --out content/scenarios/1700-01-01/sources/roster-review.json

# Report classified and unreviewed identities for one scenario.
npm run scenario:roster -- audit \
  --scenario-dir content/scenarios/1700-01-01

# Accept only explicit source-level classifications. Manual lanes remain blocked.
npm run scenario:roster -- accept-source \
  --scenario-dir content/scenarios/1700-01-01 \
  --reviewer "Codex source policy" \
  --date 2026-09-02

# Audit every discovered relation in cached network batches.
npm run scenario:ohm -- geometry-audit \
  --discovery content/scenarios/1700-01-01/sources/ohm-discovery.json \
  --cache-dir .scenario-cache/ohm/geometry-1700 \
  --refresh \
  --out content/scenarios/1700-01-01/sources/ohm-geometry-audit.json

# Audit cited, near-contemporaneous OHM fallbacks for missing exact-date geometry.
npm run scenario:ohm -- geometry-supplement-audit \
  --spec content/scenarios/1945-09-02/sources/geometry-supplements.json \
  --cache-dir .scenario-cache/ohm/geometry-1945-recursive \
  --refresh \
  --out content/scenarios/1945-09-02/sources/geometry-supplement-audit.json

# Rebuild the roster deterministically from its curated base and decision pack.
npm run scenario:roster -- rebuild \
  --scenario-dir content/scenarios/1700-01-01

# Compile a compact, provenance-carrying world border layer entirely offline.
npm run scenario:geometry -- compile \
  --scenario-dir content/scenarios/1700-01-01 \
  --ohm-cache-dir .scenario-cache/ohm/geometry-1700-recursive \
  --cliopatria-cache .scenario-cache/cliopatria/cliopatria-0.2.0.zip \
  --out content/scenarios/1700-01-01/compiled/world-borders.geo.json

# Compile every reviewed colonial, vassal, tributary, and joint relationship.
npm run scenario:relationships -- compile \
  --scenario-dir content/scenarios/1700-01-01

# Project the dated border layer onto the stable province mesh.
npm run scenario:seed -- compile \
  --scenario-dir content/scenarios/1700-01-01 \
  --base-seed src/data/generated/worldSeed.json \
  --out-dir src/data/scenarios/1700-01-01

# Regenerate local historical and neutral procedural flag assets.
node scripts/build-flags.mjs
```

Discovery output is a review queue, not a roster. Compilation verifies the exact date, expected name and Wikidata identity, element license, closed boundary rings, and hole placement. It emits GeoJSON plus a provenance ledger. The 1830 pilot currently curates Baden relation `2660798` for boundary validation.

The checked-in discoveries contain 186 active relations grouped into 180 stable identity keys for 1700, 197 into 190 for 1776, 212 into 206 for 1815, 194 into 189 for 1914, 206 into 200 for 1936, and 195 into 188 for 1945. Every identity receives an explicit review disposition before a scenario can become playable. Valid dispositions distinguish playable polities and dependencies from constituents, claims, duplicate geometry, map fragments, and exclusions. The validator blocks playable status unless coverage is global and no identity remains unreviewed.

The conservative source-acceptance pass handles explicit OHM taxonomy. Checked-in manual decision packs then classify or exclude every remaining identity, including source-label corrections and exact-date exclusions. The current result is 180 of 180 OHM plus 77 of 77 Cliopatria-only identities for 1700, 190 of 190 plus 95 of 95 for 1776, 206 of 206 plus 93 of 93 for 1815, 189 of 189 plus 39 of 39 for 1914, 200 of 200 plus 39 of 39 for 1936, and 188 of 188 plus 30 of 30 for 1945. Cliopatria remains a candidate and geometry-comparison source because its date intervals can carry anachronistic labels. Every roster polity now has a local flag asset. Unreviewed art uses a deterministic neutral banner derived from its map color and is labeled as procedural in the roster notes.

The global geometry audit recursively expands nested OHM boundary relations, then assembles and validates every discovered relation independently. At the current source snapshot, 181 of 186 relations for 1700, 194 of 197 for 1776, 208 of 212 for 1815, 193 of 194 for 1914, 202 of 206 for 1936, and all 195 for 1945 assemble as closed licensed polygon geometry. Resolution packs account for every failure: nonexclusive or duplicate fragments are skipped, reviewed endpoint gaps use recorded thresholds, and selected identities use hash-pinned Cliopatria fallbacks. The 1945 French and Soviet occupation zones are explicit temporal fallbacks because exact-date OHM relations were absent; their near-contemporaneous OHM geometries, source dates, reasons, and documentary evidence are retained in compiled provenance. The compiled layers contain 226 exclusive 1700 polities, 220 exclusive 1776 polities, 228 exclusive 1815 polities, 191 exclusive 1914 polities, 207 exclusive 1936 polities, and 187 exclusive 1945 polities. Individual validity does not prove global coverage; promotion still requires gap and exclusive-overlap analysis against the final province topology.

Relationship policies resolve all 69 source-classified dependencies in 1700, 80 in 1776, 79 in 1815, 123 in 1914, 130 in 1936, and 112 in 1945. The 1945 dependency graph records the four German occupation administrations under the United States, United Kingdom, France, and Soviet Union. Joint-administration records remain explicit. The runtime uses one primary authority only where the current diplomacy model requires it, and the source artifact preserves the other participants and the reason for the projection.

The seed compiler overlays the stable 548 province centroids on the reviewed dated polygons, chooses the smallest exclusive polygon for recorded overlaps, permits only a 1.5 degree nearest-boundary repair, and leaves all other gaps under the `UNC` diagnostic owner. Explicit province overrides run before geometric assignment and must carry review notes, reviewer identity, review date, projected polity sources, and a matching diagnostics record. The compiler splits inherited states when dated owners differ and emits dated national borders, relationship links, technology horizons, and a diagnostics ledger. Playable promotion rejects gaps, inferred nearest assignments, unresolved overlaps, missing territorial polities, and absent relationship participants.

The complementary global candidate layer is the pinned Cliopatria 0.2.0 archive at commit `ad28a691b7c07c1fca89d0e0636d324667d2a258`, verified by SHA-256 before parsing. Its CC BY 4.0 source manifest records attribution and transformations. Crosswalking stable Wikidata IDs first, then unique normalized names, produces a separate Cliopatria-only review queue for every exact-date source pack. Those candidates block playable promotion until classified. See [Historical roster and boundary sources](research/HISTORICAL-ROSTER-SOURCES.md) for the primary-source and licensing audit.

CShapes, China Historical GIS, and Correlates of War must remain outside downloads, tests, generated artifacts, and product validation under their current non-commercial or no-redistribution terms. They require written permission before operational use.

## Deep modules and seams

### Runtime scenario module

The runtime interface should stay small:

```ts
type ScenarioId = string;

interface ScenarioCatalog {
  list(): readonly ScenarioManifest[];
  load(id: ScenarioId): Promise<CompiledScenario>;
}

interface CompiledScenario {
  manifest: ScenarioManifest;
  worldSeed: WorldSeedData;
  geometry: ScenarioGeometryUrls;
}
```

`createWorld` receives a `CompiledScenario` plus the random seed and optional procedural mode. No runtime caller knows whether OHM, Natural Earth, a period atlas, or a hand-drawn correction supplied a border.

### Authoring compiler module

The authoring interface should also stay small:

```ts
compileScenario(scenarioId, options): Promise<CompileResult>
```

Its implementation may use multiple internal adapters:

- OHM adapter for dated relations and geometry.
- Natural Earth adapter for physical geography and coastline repair.
- Legacy Vic2 adapter for the current 1830 reference and migration checks.
- Curated overlay adapter for reviewed corrections and gameplay-specific subdivisions.

The compile result contains runtime artifacts, diagnostics, coverage metrics, and a provenance ledger. A build fails on unknown polity references, geometry gaps, overlapping exclusive owners, invalid relationships, unsafe visual assets, or an imported license requiring review.

## Source Pack layout

```text
content/scenarios/
  catalog.json
  1830-01-01/
    manifest.json
    polities.json
    relationships.json
    ground-situation.json
    economy.json
    populations.json
    technology.json
    diplomacy.json
    corrections.geo.json
    sources.json
    visual-policy.json
src/data/scenarios/
  1700-01-01/
    worldSeed.json
    nationalBorders.geo.json
    seed-diagnostics.json
```

Source Packs use stable semantic IDs. Compiled numeric province, state, and polity IDs are local to one Scenario. Saves therefore include the Scenario ID and fingerprint; no code may assume province `42` means the same place in 1700 and 1945.

## Completed engine migration

The runtime now resolves scenario identity and date through one catalog. The completed migration includes:

1. `ScenarioManifest`, `ScenarioId`, and `CompiledScenario`, with 1830 as the compatibility default.
2. Scenario identity and exact start date in worlds, snapshots, workers, multiplayer, permalinks, and saves.
3. One scenario-driven calendar instead of an 1830 epoch constant.
4. Scenario-aware world seed and generated map URL resolution.
5. Absolute-year research and military progression from 1700 through 1945.
6. Dated initial technology horizons and late-era land, air, and naval capabilities.
7. Reviewed exact-date source packs and compiled seeds for all seven registered dates.

## Scenario acceptance gates

A Scenario is selectable only when it passes all of these:

- Exact opening date and named scope.
- Province coverage with no exclusive-owner holes or accidental overlaps.
- Reviewed polity roster, status, overlord relationships, claims, and ground control.
- Capitals, cultures, religions, population, goods, and industrial base appropriate to the date.
- Initial technologies, institutions, reforms, armies, fleets, wars, truces, alliances, and crises.
- Source provenance and license report with no unresolved restrictions.
- No Nazi imagery in any shipped asset.
- Deterministic bootstrap, save/load, multiplayer join, and replay.
- At least a 25-year stability run plus era-specific historical counterfactual tests.
- Map and roster review at world scale and for every high-density regional theater.
