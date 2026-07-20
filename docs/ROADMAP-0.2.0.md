# Grand Century — 0.2.0 Roadmap

Status: PROPOSED · Target after 0.1.0 (first playable, released 2026-07-20)

## Framing

0.1.0 proved the whole Victoria-2 loop runs in a browser and is technically sound
(30 tests, 20-year AI stability, live). But "runs and is stable" ≠ "is fun to play
for an hour." 0.1.0's own honest gaps: balance is tuned to *stability bounds* not
*fun*; the game is opaque to a new player (Vic2's classic flaw); and the map still
has polish debt (province names, crowding). Two open issues remain (#3 balance, #4
perf).

**0.2.0 theme: make a full campaign genuinely FUN and LEGIBLE, and give the player a
grand goal.** Depth over new systems. We already have every pillar; 0.2.0 makes them
worth engaging with.

## The three core epics (0.2.0 scope)

### E1 — Balance & feel (the campaign is fun to play) · resolves #3
The single biggest gap. Make a 1836→1936 campaign have a satisfying arc.
- Headless **"season report"** harness: run 30/60/100-year AI games, emit metrics
  (GDP/inflation curves, war count/outcomes, pop growth, GP churn, bankruptcies,
  hegemon share over time). Tune `src/sim/balance.ts` against it.
- Fix feel problems tuning reveals: economy pacing (no hyper-inflation/deflation,
  factories that actually pay off), war frequency/decisiveness, tech/reform pace,
  believable pop growth, prices that move but don't thrash.
- Player-facing pacing: is a turn-to-turn decision meaningful? Add economic feedback
  loops the player can actually steer.
- Guard everything with expanded stability/behavior tests (ranges, not exacts).

### E2 — Legibility & onboarding (a new player isn't lost)
Vic2 loses players to opacity. Fix that.
- **Interactive first-session tutorial / coach**: a short guided flow (pick a nation
  → read the map → adjust a tax → build a factory → declare a war) with dismissable
  spotlights.
- **Tooltips-that-trace on every number** (extend the existing Trace component to all
  panels: budget lines, prices, war score, combat odds, GP score, militancy).
- **Actionable alerts**: the outliner/alert feed links to the relevant panel and
  suggests an action (bankruptcy → budget, unrest → politics, war offer → peace UI).
- Map polish (finishes 0.1.0 debt): **province name labels** at high zoom; resolve
  the big-central-power **crowding** at world zoom; per-mapmode legends with real
  scales.

### E3 — Formable nations & national identity (a grand goal) · signature feature
The motivating long-game objective, and it uses the German/Italian minors we added.
- **Cores/claims** per nation (which states are "rightfully ours").
- **Formation decisions**: unify the German states → **German Empire**; unify Italy →
  **Kingdom of Italy** (own/sphere the requisite cores, be a great power, etc.).
  Analogous formables where cheap (e.g. reunify Iberia, Scandinavia).
- Forming grants prestige, merges territory/pops, adopts a new tag/flag/colors, and
  is a genuine win condition players chase.
- AI pursues formations too (a unifier rising is a great emergent story).

## Stretch / likely 0.3.0 (explicitly out of 0.2.0 unless time allows)
- **E4 Events & decisions** — curated historical + dynamic events (1848 Springtime of
  Nations, economic panics, colonial scramble) with real choices.
- **E5 War depth & UI** — peace-conference UI (stack multiple war goals with score
  costs), front/stack visualization, unit types + army composition, rebellion/civil
  war handling.
- **E6 Performance & platform (#4)** — lighter map chunk, faster ticks for denser
  worlds, PWA/installable, add to the Lakeside `/games` menu, shareable permalinks.

## Execution (same rhythm as 0.1.0)
- Claude orchestrates; cursor-agent (gpt-5.3-codex-high) builds each epic; every epic
  gated on `npm run build` + `npm run test` + a fresh screenshot/behavior check
  before commit; redeploy to lakesidegames.net/games/grand-century/ per epic.
- Determinism + the sim/UI boundary stay inviolable. New systems ADD to the shared
  contract, never break it.
- Ship 0.2.0 when E1–E3 are done and a full 60-year AI campaign both passes the
  stability harness AND reads as fun in a manual playthrough.

## Definition of done for 0.2.0
1. A new player can sit down, be guided, and understand what they're doing.
2. A full campaign has a satisfying economic + military arc (validated by the season
   report + a manual playthrough), no runaway/stall pathologies.
3. The player has a grand goal: form a great nation (German Empire / Kingdom of Italy).
4. Map is clean: province labels, no overlap, legible mapmodes.
5. Tagged v0.2.0, CHANGELOG updated, GitHub release, live.
