# ROADMAP 1.0 — The Unification Arc

Phase goal: **one great campaign, playable start to finish.** Every prior
milestone added breadth; 1.0 adds the arc that makes a full 1836→1936 run
worth finishing. Marquee: playing Prussia or Piedmont and forging Germany or
Italy — the payoff of the 0.8 nationalism engine and the existing formables.

## Standing mission rule (applies to every slice, forever)

> **Every change leaves the UX generally better — especially on mobile.**
> Each PR includes at least one incidental UX improvement in the screens it
> touches, verified at 390×844, not just desktop. Country names in UI carry
> their era-appropriate flag (see U0); numbers players see should trace to
> their inputs on tap/hover.

## Slices

| # | Slice | Deliverable | Acceptance |
|---|---|---|---|
| **U0** ✅ | Nation flags | Era-appropriate 1836–1936 flags (hand-drawn SVG plates, muted atlas palette) for all 48 nations + GER/ITA formables; `NationFlag` component with procedural-shield fallback; used in HUD, diplomacy, great powers, event feed, panel chrome, nation browser. Self-hosted in `public/flags/`, PWA-precached. | Every country name in those screens shows its flag on desktop AND mobile; unknown tags fall back to shields; no runtime hotlinking. |
| **U1** ✅ | Prussia arc | Chained decisions/events riding existing systems: Zollverein (customs-union decision line), rivalry escalation with Austria (Schleswig → Brothers War CB), North German Confederation intermediate formable, France reacts to unification progress. No scripted outcomes — levers and CBs only. | A Prussia campaign can plausibly form Germany by ~1875 through play; AI Austria resists; losing the Brothers War delays but doesn't dead-end. |
| **U2** ✅ | Piedmont arc | Risorgimento mirror: alliance-with-France lever vs Austria, Expedition-of-the-Thousand decision (Two Sicilies), Rome question (Papal States gated on France's stance). | An Italy campaign completes through play; the Rome decision has a real diplomatic cost. |
| **U3** ✅ | Pacing pass | AI-driven century runs scored for mid-game flatness (war frequency, price drift, tech cadence 1860–1900); fix the worst 3 lulls found. Hand-playtest notes from at least one full human campaign. | A scored run shows no 15-year window with zero meaningful player-relevant events; playtest notes filed and acted on. |
| **U4** ✅ | War readability | Unit icons on the map (deferred since V6), front/occupation legibility at atlas zoom, battle outcome feedback that names the *why* (dice, org, terrain, general). | A war's state is readable from the map alone at a glance on a phone. |
| **U5** ✅ | The finish line | End-of-campaign scoring + recap (Wrapped-style plates: territory gained, GDP curve, wars, formables), shown at 1936 or on nation death. | A campaign *ends* with a screen worth screenshotting. |

Ship order U0 → U1 → U3 → U4 → U2 → U5 (Prussia first — it playtests the
arc machinery U2 reuses; pacing before Piedmont so U2 lands on a fun base).

## Non-goals for 1.0

- New simulation systems (no navy rework, no colonial deep-dive).
- Multiplayer campaign features beyond keeping MP-M1 green.
- Map re-projection / renderer changes.

## Verification

Existing gates (vitest suite incl. generated-mapdata invariants, Playwright
smokes, balance envelope) plus per-slice acceptance above. Every slice
screenshots desktop + 390×844 mobile before merge.

## E-track — economy depth (opened 2026-07-21, owner: "econ very weak vs Vic2")

The sim already runs the Vic2 core loop (factories buy inputs at market
prices, pay pops, self-expand on profit, close on losses; AI builds by
profit and job openings) — the failures were exposure and starting breadth.

| # | Slice | Status |
|---|---|---|
| **E1** | Visible economy: build buttons show chain + live margin, sorted by profitability; 7 pre-industrial crafts un-gated (11 civilian recipes at 1820, Vic2 parity) | DONE |
| **E2** | Market topology: national markets clearing before the world pool, tariffs that bite imports, sphere-of-influence market access, blockades cutting access | next big econ slice — validate in worldsim-style long runs before shipping |
| **E3** | Pop purchasing depth: strata budgets visible, unemployment surfaced, artisans producing craft goods outside factories | after E2 |
