# Grand Century — 0.3.0 Roadmap

Status: IN PROGRESS · Target after 0.2.0 (Fun/Legible/Formable, released 2026-07-20)

## Framing

0.2.0 made a campaign fun, legible, and goal-driven. 0.3.0 deepens the **war-first
identity** (the pillar), adds **narrative agency** via events & decisions, and pays
down **platform debt** (perf, discoverability). Plus a balance follow-up on the
0.2.0 needs-met residual.

## Epics (0.3.0 scope)

### E5 — War depth & UI (lead epic; the pillar)
Make waging war deliberate and readable, not just mechanically present.
- **Peace-conference UI**: stack multiple war goals in one settlement, each with its
  war-score cost shown; see what the current score can enforce; AI counter-offers.
- **Front / stack visualization** on the map: clear army-stack counters, movement
  arrows, battle + siege indicators, occupation shading, blockades; select a stack to
  see its composition and orders.
- **Unit types & army composition**: expose infantry/cavalry/artillery/guard
  (already in the model) — let the player choose composition when recruiting, with
  tech and terrain effects that matter; reinforcement + mobilization UX.
- **Rebellions / civil wars**: turn the existing militancy → rebel spawn into a real
  threat — rebel armies with demands (enact reform / independence), that can flip
  provinces or force concessions if unbeaten.

### E4 — Events & decisions (narrative agency)
- A **data-driven events engine** (triggers, weights, mtth, choices, effects) with a
  curated set: 1848 Springtime of Nations (militancy-driven), economic panics /
  depressions, colonial scramble triggers, succession/leader events, resource
  discoveries, reform agitation.
- **Decisions**: player-initiated actions with prerequisites and trade-offs (national
  focus, infrastructure pushes, one-off diplomatic gambits).
- Fires as event popups (reusing the alert system) with real, distinct choices.

### E6 — Performance & platform (pay down debt) · resolves #4
- **Lighter first load**: shrink/lazy the MapLibre-heavy map chunk further; faster
  ticks for denser worlds; keep the ~225s test suite in check (split the long-run
  balance sims behind a `test:balance` script so the main gate is fast).
- **PWA / installable + offline** (it's fully client-side already).
- **Discoverability**: add Grand Century to the Lakeside `/games` landing menu.
- **Shareable permalinks**: encode seed + nation in the URL so a start can be shared.

### B1 — Balance follow-up (from 0.2.0)
- Fix pops sitting at ~40% needs-met in long sims (raise living standards / wage or
  need-basket tuning) so needsMet reads healthy, without breaking the E1 bands.

## Execution
Same rhythm: Claude orchestrates; cursor-agent builds each epic; gated on
`npm run build` + `npm run test` + screenshot/behavior checks; redeploy live per epic;
determinism + sim/UI boundary inviolable; ADD to the contract, never break it.

## Definition of done for 0.3.0
1. A war can be planned, fought, read on the map, and settled at a real peace table.
2. Events give the campaign texture and choices with consequences.
3. First load is lighter; the game is installable, discoverable on Lakeside, and a
   start is shareable by link.
4. Pops read as healthily-fed in long campaigns.
5. Tagged v0.3.0, CHANGELOG updated, GitHub release, live.
