# Changelog

All notable changes to Grand Century are documented here.

## [0.2.0] — 2026-07-20

Theme: make a full campaign fun and legible, and give the player a grand goal.

### Balance & feel (E1)
- Deterministic **season-report harness** (`npm run season-report`) runs 60/100-year
  AI games across seeds and emits economy/population/geopolitics metrics.
- Tuned the economy/war/pop constants against it. A 60-year, 3-seed campaign now
  holds healthy bands: inflation ~1.3%/yr, factories profitable in aggregate, ~6%
  peak bankruptcy, ~2.2 wars/yr all resolving, no runaway hegemon (largest nation
  ~21% at year 20), believable pop growth.
- New long-run balance test guards the bands + determinism; perf test made robust to
  machine load.

### Legibility & onboarding (E2)
- **Interactive 7-step tutorial coach** on first play (replayable), on desktop and
  mobile.
- **Tooltips-that-trace** on every important number (budget, prices, war score,
  great-power score, militancy, pop needs) — each breaks down into its inputs.
- **Actionable alerts**: outliner/election/war items now jump to the relevant panel
  and suggest the next action, and can be dismissed.
- Map polish: **province name labels** at high zoom, reduced world-zoom label
  crowding, and per-mapmode **legends** with real scales.

### Formable nations (E3)
- **Cores/claims** per nation and **formation decisions**: unify the German states →
  **German Empire**, the Italian states → **Kingdom of Italy** (plus cheap analogues).
- Forming transfers the core territory, merges pops, adopts a new tag/colors, awards
  prestige, and updates the great-power ranking. The **AI pursues formation too** — a
  rising Prussia can proclaim the German Empire.
- New Formables panel shows eligibility + a live requirements checklist; a Cores
  mapmode highlights your core states.

### Notes
- Test suite is heavier now (~225s) due to the long-run balance sims.
- Pops run ~40% needs-met in long sims (stable, low militancy) — a candidate for
  further tuning.

[0.2.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.2.0

## [0.1.0] — 2026-07-20

First playable release. A single-player, browser-based grand strategy game in the
spirit of Victoria 2, on a historical 1836 Earth. Runs fully client-side; the
simulation lives in a Web Worker so the map stays at 60fps.

**Live:** https://lakesidegames.net/games/grand-century/

### Systems (the full Victoria-2 loop, broad-but-shallow)
- **Economy** — pops with life/everyday/luxury needs, RGO + factory production, one
  global world market with supply/demand pricing and conservation, monthly budget
  with real bankruptcy.
- **Population** — growth, migration, promotion/demotion, militancy → unrest.
- **Politics** — reform tree (economic/political/social/military), ruling party +
  elections, tax/tariff policy; military reforms gate mobilization.
- **Diplomacy** — relations, alliances/rivalries, casus belli + war goals, infamy,
  great-power ranking, spheres of influence.
- **War & expansion** (the pillar) — recruit regiments from soldier pops, armies +
  generals, movement/supply/attrition, combat (organization then strength), sieges
  and occupation, navies + amphibious landings gated on naval supremacy, war score +
  exhaustion, peace with war-goal enforcement (annex/liberate/humiliate/sphere/
  colony), colonization.
- **AI** — non-player nations run the economy + war loop: ally against real threats,
  target winnable wars with fitting goals, concentrate armies and siege, make peace
  by war score + exhaustion.

### World & map
- 1450 real Natural-Earth province polygons, 55 nations including the 1836 German
  and Italian states, painterly parchment paper-map aesthetic.
- Mapmodes: political, ruling ideology, unrest, population, economy, military,
  diplomatic.
- Zoom level-of-detail: country regions + national borders when zoomed out, province
  borders when zoomed in.
- Self-hosted atlas-serif labels, centered per country and staggered by
  zoom/prominence to avoid overlap.

### Platform
- Responsive/mobile layout (compact top bar, bottom nav, sheet panels, touch
  pan/zoom); desktop side-rail layout preserved.
- Save/load via IndexedDB + gzip with yearly autosave; deterministic (seeded RNG),
  so loads and replays reproduce exactly.
- Audio manager with mute toggle (synthesized tones).

### Quality
- 30 unit/integration tests including a 20-year AI-driven stability run (wars occur,
  no runaway hegemon, bounded prices/treasuries), a save/load round-trip, and a
  performance ceiling. End-to-end Playwright smoke.

### Known limitations
- Europe’s big central powers can still crowd at full world zoom; province *name*
  labels not yet printed (borders + hover tooltips only).
- Map JS chunk is MapLibre-heavy (code-split from the main bundle).
- Balance is tuned to stability bounds, not yet hand-playtested for a full campaign.

[0.1.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.1.0
