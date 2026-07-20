# Grand Century — overnight build report

Repo: https://github.com/Egg3901/grand-century (private)
Build model: orchestrated by Claude (Opus) + cursor-agent (gpt-5.3-codex) builders.
Design: `docs/MASTER.md` · Rules: `docs/ARCHITECTURE.md`

## Locked decisions (no pausing overnight, per instruction)
- Scope: broad-but-shallow full loop; Pillar: **war & expansion**.
- Setting: historical 1836 Earth. Timespan 1836→1936. Player nation: Britain.
- Stack: TS + Vite + React UI + MapLibre WebGL map + Web-Worker sim + Zustand.
- Aesthetic: painterly Victoria-2 paper-map.
- VCS: local git + private GitHub `Egg3901/grand-century`, `master` as main.

## Verification gate (run for every milestone before commit)
`npm run build` (tsc+vite) · `npm run test` (vitest) · dev server serves · milestone acceptance.

## Progress log
### M0 — Scaffold + rails ✅ (committed)
- Rails (hand-written): shared contract `src/shared/types.ts`, seeded RNG, tick-loop dispatch `src/sim/world.ts`, worker message loop, Zustand store, docs.
- cursor-agent filled: gameData, bootstrap (synthetic 48-province world, 8 nations), commands, snapshot, detail, all 7 system modules (shallow), MapLibre map, HUD, ProvincePanel + BudgetPanel.
- Gate: build ✅ · 4 tests ✅ · dev serves 200 ✅.
- Note: bundle 1.2MB (MapLibre) — code-split in M6 perf pass. Real browser pan/click smoke deferred to M6 Playwright.

### M1 — 1836 province map ✅ (committed)
- content/build-map.mjs fetched Natural Earth 50m admin-1, baked 1021 provinces (in 800–1500 target), adjacency, plausible 1836 owners (21 nations). MapLibre paints by mapmode; click→province panel. Build + 6 tests green.
- Residual: Europe under-provinced vs empty regions (NE admin-1 artifact); some 1836 inaccuracies (Texas→USA, German/Italian minors merged). Refine in a later content pass.

### M2 — Economy ✅ (committed)
- Pops with life/everyday/luxury needs, RGO+factory production, one global world market (supply/demand pricing + conservation), monthly budget with real bankruptcy, pop growth/migration/promotion.
- Build + 10 tests (conservation, bankruptcy, pop growth, determinism) + independent 2-year probe green.

### M3 — Politics ✅ (committed)
- Reform tree (econ/political/social/military), ruling party + elections, tax/tariff, militancy→rebellion, conscription reform gates mobilization capacity (feeds war).
- Build + 14 tests green (legal/illegal reform, unrest→rebellion, conscription→mobilization, deterministic elections).

### M4 — Diplomacy ✅
- Relations/alliances/rivalries, CB fabrication, declarations, war goals, infamy threshold, GP ranking + spheres, coalition pressure.
- Added diplomacy detail/snapshot surfaces and command plumbing for alliance/rival/cancel/influence/CB/war/peace.

### M5 — War & expansion ✅
- Army/navy recruitment and movement, generals, mobilization/demobilization, amphibious landing + naval supremacy checks.
- Daily combat, attrition/supply, sieges/occupation, warscore/exhaustion, peace enforcement, colonial claims.

### M6 — AI, balance, performance, polish ✅ (current)
#### Shipped
- **AI system (`src/sim/systems/ai.ts`)**  
  Monthly non-player AI now runs economy + war loop: tax/tariff steering, tech/reform behavior, factory/military growth, alliance behavior, CB fabrication/war declarations, front movement, mobilization, and peace logic by warscore/exhaustion.  
  Heavy planning is staggered by nation-month stride for perf.
- **Balance constants hub (`src/sim/balance.ts`)**  
  Centralized core tuning constants with comments (economy bounds, population growth bounds, AI pacing/peace thresholds, verification limits).
- **Headless balance/perf verification**  
  Added:
  - `tests/m6.ai.stability.test.ts` (20-year run; no NaN; bounded prices/treasuries; wars occur; hegemon cap by year 10)
  - `tests/m6.performance.test.ts` (5-year wall-clock guardrail)
  - `npm run test:stability`
- **Tooltips-that-trace-numbers expansion**  
  Extended trace usage across major ledgers and war/politics views (prices/supply-demand, budget net/lines, GP score, militancy surfaces, war score and combat odds).
- **Save/load hardening**  
  Real gzip persistence added:
  - `src/sim/persistence.ts` (world + runtime serialization/deserialization)
  - `src/worker/saveSlots.ts` (IndexedDB slots)
  - Worker handles save/load/list + yearly autosave rotation (`autosave-1..3`)
  - Save/load panel wired in UI
  - Round-trip determinism test: `tests/m6.save-load.test.ts`
- **Performance pass**  
  - Map is lazy-loaded (code split) via `React.lazy`.
  - GeoJSON is fetched at runtime (`/generated/provinces.geo.json`) instead of inlining into the main JS.
  - Vite plugin emits `generated/*.json` assets and serves them during dev/build.
- **Polish pass**  
  - Main menu / nation select + `newGame` flow.
  - Outliner + alert feed (war/peace/bankruptcy/rebellion/election/save events).
  - Map legend by mapmode.
  - Additional map counters/icons (army/fleet/battle/blockade/siege).
  - Audio manager with mute toggle and synthesized ambient/notification tones (no external licensed assets).
- **E2E smoke**  
  - Added Playwright setup + smoke test (`tests/e2e/smoke.spec.ts`)
  - Script: `npm run test:e2e`

#### Stubbed / intentionally shallow in M6
- AI remains heuristic and intentionally imperfect (alive, not omniscient); diplomacy coalition/peace quality can still be improved in a dedicated AI-depth pass.
- Audio is synthesized/minimal; no external music pack included.

#### Known issues / residual risks
- Map chunk is now split from initial JS and geojson is fetched, but the map chunk itself is still large (MapLibre-heavy).
- Historical granularity remains tied to admin-1 source artifacts (not yet a hand-curated Vic2-density map).
