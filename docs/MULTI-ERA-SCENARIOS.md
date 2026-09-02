# Multi-era scenarios

## Product direction

Grand Century is a historical grand-strategy engine with curated scenarios spanning roughly 1700 through 1945. Victoria II remains an important design and data reference, not the product boundary and not a runtime dependency.

Each selectable date is a complete Scenario. It must seed political geography, the polity roster and relationships, population, economy, technology, institutions, diplomacy, wars, claims, and date-specific content. A date-filtered map alone is not a playable scenario.

The 1933-1945 period may be represented in mechanics and neutral historical text, but shipped visual assets must contain no Nazi imagery. Do not ship swastikas, Nazi Party or SS insignia, propaganda, uniforms, or portraits. Use a neutral German identifier and a non-Nazi flag treatment approved with the scenario art pass.

## Recommended first scenario ladder

These are production milestones, not promises that a year is ready because a map exists:

| Scenario | Why it earns a slot | Main engine pressure |
|---|---|---|
| 1700 | War of the Spanish Succession opening world | Dynastic unions, pre-industrial states, sailing logistics |
| 1756 | Seven Years' War | Global war, colonial theaters, limited communications |
| 1789 | French Revolution opening | Revolution, legitimacy, mass politics transition |
| 1815 | Congress settlement | Postwar order, restoration, claims and conferences |
| 1830 | Current baseline | Existing content and compatibility anchor |
| 1861 | National wars and US Civil War | Secession, mobilization, industrial war |
| 1900 | Imperial high point | Mature industry, colonial administration, naval competition |
| 1914 | First World War opening | Alliances, mobilization, total-war economy |
| 1919 | Postwar settlement | Mandates, new states, demobilization, revolutions |
| 1936 | Rearmament and ideological blocs | Air power, mechanization, sanctions, faction diplomacy |
| 1945 | End-of-war settlement | Occupation, reconstruction, decolonization pressure |

Build 1830 through the new pipeline first. Then add one early scenario and one late scenario before filling the ladder. That forces the engine seam to handle the full period instead of merely renaming the existing nineteenth-century assumptions.

The catalog now contains development Source Packs for 1700-01-01 and 1936-01-01. They are deliberately absent from playable menus. Each has a live-tested OHM geometry probe, a classified roster slice, relationship data, exact-date provenance, and the same prohibited-imagery policy as the playable baseline. The 1700 slice classifies Carolina as an English colonial administration. The 1936 slice presents Germany with the neutral `GER` tricolor while retaining the OHM source name only in provenance.

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
```

Discovery output is a review queue, not a roster. Compilation verifies the exact date, expected name and Wikidata identity, element license, closed boundary rings, and hole placement. It emits GeoJSON plus a provenance ledger. The 1830 pilot currently curates Baden relation `2660798` for boundary validation.

The checked-in 1700 discovery currently contains 186 active relations grouped into 180 stable identity keys. The 1936 discovery contains 206 relations grouped into 200 identities. Every identity receives an explicit review disposition before a scenario can become playable. Valid dispositions distinguish playable polities and dependencies from constituents, claims, duplicate geometry, map fragments, and exclusions. The validator blocks playable status unless coverage is global and no identity remains unreviewed.

The conservative source-acceptance pass classifies 124 of 180 OHM identities and 70 of 77 Cliopatria-only identities for 1700. It classifies 154 of 200 OHM identities and 32 of 39 Cliopatria-only identities for 1936. It accepts only explicit OHM taxonomy and Cliopatria polities without a parent membership value. Ambiguous OHM records and coarse empire memberships remain unreviewed. Newly accepted development entries use `TBD_NEUTRAL` as an explicit flag placeholder; playable validation rejects every unresolved placeholder.

The global geometry audit recursively expands nested OHM boundary relations, then assembles and validates every discovered relation independently. At the current source snapshot, 181 of 186 relations for 1700 and 202 of 206 relations for 1936 assemble as closed licensed polygon geometry. The remaining entries are checked in as explicit correction work, not silently omitted. Individual validity does not prove global coverage; later compilation must still detect ownership holes, exclusive overlaps, duplicate claims, and coastline mismatches.

The complementary global candidate layer is the pinned Cliopatria 0.2.0 archive at commit `ad28a691b7c07c1fca89d0e0636d324667d2a258`, verified by SHA-256 before parsing. Its CC BY 4.0 source manifest records attribution and transformations. Crosswalking stable Wikidata IDs first, then unique normalized names, finds 77 Cliopatria-only identities for 1700 and 39 for 1936. Those candidates have a separate review queue and block playable promotion until classified. See [Historical roster and boundary sources](research/HISTORICAL-ROSTER-SOURCES.md) for the primary-source and licensing audit.

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
  1830-01-01/
    world-seed.json
    provinces.geo.json
    national-borders.geo.json
    provenance.json
```

Source Packs use stable semantic IDs. Compiled numeric province, state, and polity IDs are local to one Scenario. Saves therefore include the Scenario ID and fingerprint; no code may assume province `42` means the same place in 1700 and 1945.

## Required engine migration

The current code bakes 1830 into the clock, research, politics, events, formables, UI copy, multiplayer defaults, save fingerprints, tests, and generated-asset URLs. The migration order is:

1. Add `ScenarioManifest`, `ScenarioId`, and `CompiledScenario`; register current 1830 as the default.
2. Store `scenarioId` and `startDate` in `World`, snapshots, multiplayer initialization, permalinks, and saves.
3. Replace local `EPOCH_YEAR = 1830` helpers with one calendar module driven by the Scenario start date.
4. Make world seed and map geometry resolve through the ScenarioCatalog.
5. Move initial technology, reform, economy, population, diplomatic, and war state out of bootstrap heuristics and into Source Packs.
6. Make content availability absolute-year driven and add explicit scenario inclusion/exclusion where chronology alone is insufficient.
7. Compile the current 1830 content through the new path and require byte- or behavior-equivalence where intended.
8. Add 1700 and 1936 vertical slices, then repair assumptions exposed at both ends.
9. Fill the remaining scenario ladder only after those vertical slices pass long-run simulation and content audits.

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
