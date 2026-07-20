# Master Document — "Grand Century" (working title)

A single-player, browser-based grand strategy game in the spirit of **Victoria 2** (not Vic 3).

---

## 1. Context — why this document exists

The goal is a from-scratch, single-player web game that recreates the *feeling* of Victoria 2: a living 19th-century world you steer as a nation, watching population, industry, and armies evolve on a historical map. It must run entirely in the browser (client-side, no server sim), feel performant and look beautiful, and be buildable by driving **Cursor + Kimi K3 (kimi CLI)** against a well-specified spec.

This is greenfield — there is no existing codebase. This document is the **master spec**: it defines the vision, the simulation model, the tech architecture, the data pipeline, the milestone roadmap, and the AI-assisted execution workflow. Every subsequent Cursor/Kimi session should be scoped against a section here.

### Confirmed decisions (from scoping)
| Decision | Choice | Consequence |
|---|---|---|
| **Scope** | Broad-but-shallow full loop | All Vic2 pillars present (economy, pops, politics, diplomacy, war) but each simplified; the *whole* loop is playable end-to-end from an early milestone. |
| **Setting** | Historical 1836 Earth | Vic2's actual premise. Requires a province map + historical seed data → a real content pipeline (Section 6). |
| **Pillar** | **War & expansion** | War is the star: it gets the most mechanical depth; every other system is designed to *feed* war (economy funds it, pops man it, politics gates it, diplomacy sets it up). |
| **Stack** | "Most performant & beautiful" → my call | TS + Vite + React UI + WebGL map + Web-Worker sim (Section 4). |

---

## 2. Design vision & pillars

**One-line pitch:** *Take a nation in 1836 and carry it through a century of industry, reform, and conquest — with a world market and population that live and react on their own.*

**Design pillars (ranked, war-first):**
1. **War & expansion is the payoff.** Mobilizing pops into armies, fronts that push and break, war goals, occupation, peace deals, the great-power pecking order, and the colonial land-grab. This is where the player spends the climaxes of a game.
2. **A world that lives without you.** Pops grow/migrate/promote, factories boom and bust, prices move on a shared world market, AI nations pursue their own wars. The player nudges a system, they don't micromanage a spreadsheet.
3. **Everything feeds the war engine.** Economy → money & goods for armies. Pops → soldiers & taxes. Politics → what reforms/mobilization you can enact. Diplomacy → alliances, casus belli, spheres. No pillar is a dead end.
4. **Legible depth.** Vic2 is famously opaque; we keep the depth but expose *why* things happen (tooltips that trace every number to its inputs).

**Explicit non-goals (to protect scope):** multiplayer; modding tools; a scripted event tree the size of Vic2's; historically exact pop/goods numbers (we seed *plausible* history, then let the sim diverge).

---

## 3. Simulation model (broad-but-shallow, war-weighted)

The sim is **real-time-with-pause** (Vic2-style): five speeds + pause. Base unit is a **day/tick**; heavier systems resolve on coarser cadences to stay cheap.

### 3.1 Tick cadences
| Cadence | Systems |
|---|---|
| **Daily** | Army movement, combat resolution, siege/occupation progress, construction progress, market price adjustment. |
| **Weekly** | Pop needs satisfaction & consumption, factory production run, trade clearing. |
| **Monthly** | Budget (taxes/tariffs/spending), pop growth, migration, pop promotion/demotion, research points, diplomacy AI, prestige/GP ranking recompute. |

### 3.2 Core entities
- **Province**: owner, controller (for occupation), terrain, RGO (resource good + level), fort/naval-base level, buildings, list of pops, connectivity.
- **State/Region**: groups provinces; where factories live; the unit of colonial expansion.
- **Pop**: type (aristocrat, capitalist, clerk, craftsman, clergy, **soldier**, officer, farmer, laborer, slave), size, culture, religion, ideology mix, consciousness/militancy, money, needs-satisfaction. Pops are the source of *soldiers, taxes, and unrest*.
- **Nation**: treasury, tech, reforms, government type, ruling party, national value, prestige, infamy, sphere, great-power rank, army/navy, diplomatic relations, war goals.
- **Good**: e.g. grain, iron, coal, machine parts, small arms, artillery, canned food, etc. — a compact goods list (~30) rather than Vic2's full set.
- **Market**: one shared **world market** with per-good supply/demand → price, plus tariffs. (Simplification: skip Vic2's per-sphere markets initially; one global market with tariff frictions.)

### 3.3 Pillar summaries (each intentionally simplified)

**Economy (supporting — funds war).** RGOs produce raw goods; factories in states convert raw → manufactured; pops demand goods by need tier (life/everyday/luxury). Supply vs demand on the world market sets prices weekly. Nation earns from taxes (per pop-type slider), tariffs, and state-owned production; spends on army upkeep, construction, admin, and reform costs. **Bankruptcy** is possible and cripples war capacity.

**Population (supporting — mans war & pays for it).** Pops grow with need-satisfaction, migrate toward jobs/higher living standards, and **promote/demote** between types (e.g. farmer→laborer→craftsman; anyone→soldier when soldier jobs & culture allow). Militancy rises with unmet needs & political suppression → rebellions.

**Politics (gate — decides what war you can wage).** A short reform tree (economic, political, social, military). Upper house / party in power gates which reforms are legal and sets tax/economic policy. Military reforms directly unlock **mobilization size, conscription, and army tech throughput**. Elections (if the government type allows) shift the ruling party.

**Diplomacy (setup — creates wars).** Relations, alliances, guarantees, **casus belli / war goals**, **infamy (badboy)** as the aggression brake, **great-power ranking** (score = industry + military + prestige), **sphere of influence** over secondary/unciv nations via influence points. Declaring war requires a valid CB; peace is settled by **war score** against attached war goals.

**★ War & expansion (the star — deepest system).**
- **Land**: recruit **regiments from soldier pops** (each soldier pop supports N regiments by military reform level); armies are stacks with a **general** (traits/skill). Movement province-to-province with terrain & supply-range limits. **Combat**: dice + tech + terrain + general + org/morale; units take **organization** damage then **strength** damage; broken units retreat. **Fronts** emerge naturally from adjacency (no need for an explicit front system — stacks meeting at borders create the push/pull).
- **Sieges/occupation**: occupying enemy provinces builds war score; forts slow it.
- **Naval**: fleets for **transport** (amphibious landings), **blockade**, and **naval supremacy** (required to land troops overseas — key for colonial powers).
- **War goals & peace**: attach goals (annex state, liberate, humiliate, add to sphere, take colony) each worth war-score %; enforce when score allows, or negotiate white peace.
- **Great-power & colonial expansion**: top-8 GPs get sphere/colonization privileges. **Colonization**: spend colonial points (from naval bases + reforms) to plant/expand colonies in uncolonized regions; races with rival GPs can flip to crisis/war.
- **War exhaustion / war score cap** keep wars from being infinite.

### 3.4 Simplifications table (what we deliberately cut vs Vic2)
| Vic2 feature | Our simplification |
|---|---|
| Per-nation/per-sphere markets | One global market + tariffs |
| ~50+ goods, multi-input recipes | ~30 goods, ≤3-input recipes |
| Full event/decision tree | Small hand-authored event set + generated flavor |
| Rebel factions & civil wars in depth | Militancy → uprising stacks + reform pressure |
| Exact historical pops | Plausible seeded pops, sim diverges |
| ~2500 provinces | ~800–1500 provinces (perf, Section 7) |

---

## 4. Technical architecture (performant + beautiful)

**Guiding principle:** the UI thread only *renders*; the world only *simulates* in a worker. They exchange snapshots. This is what keeps a heavy grand-strategy tick from ever stuttering the map.

```
┌────────────────────────── Main thread (60fps) ──────────────────────────┐
│  React + TypeScript  ── panel UI (ledgers, diplomacy, budget, army)      │
│  Zustand store       ── UI state + latest world snapshot (read-only)     │
│  WebGL map renderer  ── MapLibre GL / deck.gl, GPU province fills        │
└───────────────▲───────────────────────────────────┬────────────────────┘
                │ snapshot (structured-clone/SharedArrayBuffer)            │ commands (player intents)
┌───────────────┴───────────────────────────────────▼────────────────────┐
│  Web Worker — the simulation                                            │
│  Pure-TS deterministic engine: pops · market · politics · diplo · WAR   │
│  Fixed-timestep tick loop; seeded RNG; produces snapshots per frame     │
└─────────────────────────────────────────────────────────────────────────┘
        │ save/load
   IndexedDB (via idb) — compressed save blobs
```

### 4.1 Stack (my recommendation for "most performant & beautiful")
- **Language:** TypeScript, strict mode, everywhere (UI + sim share domain types).
- **Build:** Vite (fast HMR, worker & WASM support out of the box).
- **UI:** React 18 + TypeScript. Panels/ledgers are the bulk of the screen; React's ecosystem is the most Cursor/Kimi-friendly and the UI is *not* the perf bottleneck (the worker is).
- **Map (the "beautiful" part):** **WebGL, GPU-accelerated.** Province fills recolor by owner/mapmode without CPU redraw. Two viable renderers — pick in M1 spike:
  - **MapLibre GL JS** — real 1836 geography from GeoJSON/vector tiles, paper-map styling, pan/zoom for free. Best "beautiful historical map" out of the box.
  - **deck.gl (+ optional MapLibre base)** — better for data overlays (mapmodes: political/economic/pop/military) and huge feature counts.
  - *Decision:* prototype MapLibre first; add deck.gl overlay layer for mapmodes if fills alone aren't enough.
- **State:** Zustand (tiny, fast, no boilerplate) for UI + snapshot; the sim owns its own plain-object world model inside the worker.
- **Sim performance:** typed arrays / struct-of-arrays for pops & provinces; consider **SharedArrayBuffer** for zero-copy snapshots (requires COOP/COEP headers). Hot loops stay allocation-free.
- **Persistence:** IndexedDB via `idb`, saves gzipped (`fflate`).
- **Determinism:** single seeded PRNG (e.g. `mulberry32`) threaded through the sim so saves/replays are reproducible — also makes bugs reproducible.
- **Testing:** Vitest for sim units (economy conservation, combat math, save/load round-trip); Playwright for smoke (load → advance 1 year → no crash).
- **Optional later:** move the hottest sim inner loops to **AssemblyScript/WASM** only if profiling demands it — do *not* start there.

### 4.2 Why this beats the alternatives
- **Svelte** is lovely but has a thinner AI-codegen corpus; React keeps Cursor/Kimi on rails.
- **Phaser/Pixi as the app framework** is wrong here — 80% of a grand-strategy screen is data panels, which engines handle worse than React. We still get WebGL where it matters (the map) via MapLibre/deck.gl.
- **Server-side sim** is unnecessary (single-player) and would kill the "runs anywhere in a tab" goal.

---

## 5. Repository layout & conventions

```
/grand-century
  /src
    /sim            # pure TS, no DOM — runs in worker; the whole game model
      /systems      # market.ts, pops.ts, politics.ts, diplomacy.ts, war/*.ts
      /model        # entity types, world state, struct-of-arrays stores
      world.ts      # tick loop, cadence dispatch, snapshot serialization
      rng.ts
    /worker         # worker entry: command intake + snapshot emit
    /ui             # React components (panels, mapmodes, hud)
    /map            # MapLibre/deck.gl setup, province paint, camera
    /data           # loaders for the built game data (from /content)
    /shared         # domain types shared by sim + ui
  /content          # SOURCE data + build scripts → baked game data (Section 6)
  /public
  /tests
```

**Conventions:** sim code imports nothing from `ui/` or the DOM (enforced by lint boundary). All player actions are **commands** posted to the worker; all reads come from the **snapshot**. One `shared/types.ts` is the contract both sides trust.

---

## 6. Content pipeline (1836 Earth data)

Historical Earth is the biggest *content* risk. Treat data as a **build step**, not hand-typed constants.

**Sources → baked artifacts:**
1. **Province geometry:** start from an open historical/Natural-Earth-derived province GeoJSON (or a Vic2-style province map converted to polygons). Simplify to ~800–1500 provinces (Section 7). Bake to compact binary + a province-id ↔ polygon index.
2. **Nations (1836):** a JSON table of starting countries, capitals, government type, primary/accepted cultures, starting techs/reforms, GP status.
3. **Province seed:** owner, terrain, RGO good+level, starting fort/naval-base, starting pop stacks (type/size/culture/religion) — *plausible*, generated from a small ruleset + a few historical anchors, not exhaustively hand-authored.
4. **Goods & recipes:** the ~30-good list + factory recipes + pop need baskets.
5. **Tech/reform trees:** compact JSON.

**Build script** (`/content/build.ts`, run via node) validates and emits versioned artifacts into `/src/data`. Kimi CLI is well-suited to *generating and validating these large data tables* in batch — a natural delegation target (Section 8).

---

## 7. Performance budget

- **Target:** 60fps map interaction at all times; a monthly tick for the full world resolves in **< 16ms of worker time** at fastest speed (worker stutter never touches the UI thread anyway).
- **Province count:** 800–1500. Real Vic2 (~2500) is a stretch for a JS/browser monthly pop pass; we cap and can raise later once profiled. **Log the cap** so it's never mistaken for "the whole world."
- **Pops:** struct-of-arrays; process by type in tight loops; cap pop *count* by merging tiny same-attribute pops (Vic2 does this too).
- **Snapshots:** send diffs or a compact typed-array snapshot, not a deep clone of the whole world every frame. Map only re-uploads province colors that changed.
- **Guardrail:** a perf test in CI that advances the world 5 sim-years headless and asserts a wall-clock ceiling.

---

## 8. Execution workflow — Cursor + Kimi K3 (kimi CLI)

This doc is the source of truth; each work session is a **scoped slice** of it.

**Division of labor:**
- **Cursor (interactive, main-model quality):** architecture, the tick loop, combat/market math, anything where a wrong abstraction is expensive. Work milestone-by-milestone (Section 9); paste the relevant section as context.
- **Kimi K3 via kimi CLI (batch/grunt/generation):** high-volume, well-specified, verifiable work — generating the 1836 data tables, boilerplate React panels from a component spec, unit-test scaffolding, repetitive system stubs. You orchestrate and **verify** its output; keep the judgment-heavy math and abstractions in Cursor.

**Per-session ritual:**
1. Name the milestone + acceptance criteria from Section 9.
2. Point the tool at the exact files/dirs in Section 5.
3. After generation: run `vitest` + the relevant smoke check *before* accepting.
4. Keep the sim/UI boundary (Section 5) as a hard review gate — reject any sim code that touches the DOM.

**Prompt hygiene:** give the tool the domain types from `shared/types.ts` first; ask for one system at a time; require tests alongside code.

---

## 9. Milestone roadmap

Each milestone is **independently playable/verifiable** — the "broad-but-shallow full loop" means we get end-to-end early, then deepen war.

| # | Milestone | Deliverable | Acceptance |
|---|---|---|---|
| **M0** | Scaffold | Vite + TS + React + worker + Zustand skeleton; empty MapLibre map renders; tick loop posts snapshots; save/load stub. | App boots; clock advances; map pans at 60fps. |
| **M1** | Map & provinces | 1836 province GeoJSON baked & painted; click a province → info panel; **mapmodes** (political first). | ~1000 provinces selectable & recolor instantly. |
| **M2** | Pops & economy | Pops, RGOs, factories, world market, weekly production/consumption, monthly budget & pop growth. | Prices move with supply/demand; a nation can go bankrupt; pops grow. |
| **M3** | Politics | Reform tree, ruling party/upper house, taxes/tariffs sliders, militancy → unrest, elections. | Player can enact a legal reform; unmet needs raise militancy. |
| **M4** | Diplomacy | Relations, alliances, CB/war goals, infamy, GP ranking, spheres. | Player can form an alliance and fabricate/declare a valid war. |
| **M5** | ★ War & expansion | Recruit regiments from soldier pops, armies + generals, movement, combat, sieges/occupation, navies + landings, war score & peace, colonization. | A full war can be fought and won; a colonial claim can be planted. |
| **M6** | AI, balance & polish | AI nations play the loop (economy + war), event/flavor pass, tooltips-that-trace-numbers, save/load hardening, perf pass, audio/art polish. | AI wages its own wars; a 20-year game runs stable end-to-end. |

**Vertical-slice note:** M2–M5 each add a pillar but the game is *playable* after each. War (M5) is deliberately the fattest milestone and may split into M5a land / M5b naval+colonial.

---

## 10. Verification strategy

- **Sim unit tests (Vitest):** market conservation (no goods/money created from nothing), combat determinism under fixed seed, pop promotion invariants, budget balance, save→load→save byte-identical.
- **Headless sim harness:** advance the full world N years with no player input; assert no NaNs, no negative pops, treasury bounded, wall-clock under budget (Section 7). Run in CI.
- **Playwright smoke:** boot → select nation → run 1 year at fast speed → declare & resolve a scripted war → no crash.
- **Manual "feel" checks** per milestone against the acceptance column in Section 9.
- **Determinism harness:** same seed + same command log → identical end state (catches order-dependence bugs early).

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Historical map/data is a content black hole** | Cap provinces at 800–1500; generate seeds from rules + anchors, not by hand; make data a build step (Section 6) and delegate table generation to Kimi. |
| **Monthly full-world pop pass is slow** | Struct-of-arrays, pop merging, worker isolation, WASM only if profiled. Perf test in CI. |
| **War (the star) balloons in scope** | Split M5 into land / naval+colonial; ship land war playable first. |
| **"Broad-but-shallow" silently becomes broad-but-broken** | Each milestone has hard acceptance criteria; don't advance until green. |
| **AI is the make-or-break for single-player fun** | M6 gives AI real weight; start with a competent economy+war heuristic AI, not a scripted one. |
| **SharedArrayBuffer needs COOP/COEP headers** | Fall back to structured-clone snapshots if hosting can't set headers; measure before committing. |
| **Opacity (Vic2's classic flaw)** | Tooltips that trace every displayed number to its inputs, built in as a shared component from M2. |

---

## 12. Open questions (resolve before or during M0)

1. **Map renderer:** MapLibre-only vs MapLibre+deck.gl overlay — decide via a 1-day M1 spike.
2. **Art direction:** painterly Vic2 paper-map vs cleaner modern flat — pick a reference before M1 styling.
3. **Time span & end date:** 1836 → 1936 like Vic2, or open-ended?
4. **Save size / autosave cadence** acceptable to you (IndexedDB quota is generous but not infinite).
5. **Hosting** target (static host is enough; only matters for the SharedArrayBuffer header question).

---

*This is the living master document. Each Cursor/Kimi session should cite the section it implements and update this file when a milestone's acceptance criteria change.*
