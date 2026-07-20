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

### M4 — Diplomacy — IN PROGRESS

## Open items / risks being tracked
- Europe under-provinced (M1 NE artifact) — content refinement pass later.
- Bundle ~1.6MB (MapLibre + bundled geojson) — code-split + fetch geojson at runtime in M6 perf pass.
- Browser runtime smoke (map pan/click) not yet automated — Playwright in M6.
