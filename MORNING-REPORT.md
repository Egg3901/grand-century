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

### M1 — 1836 province map — IN PROGRESS

## Open items / risks being tracked
- Real 1836 geometry via Natural Earth fetch (M1) — has procedural fallback if network fails.
- Browser runtime smoke (map pan/click) not yet automated — M6.
