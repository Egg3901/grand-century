# Changelog

All notable changes to Grand Century are documented here.

## [1.0.0] — 2026-07-22

The Unification Arc. A campaign now has a beginning, a story, and an end.

### The arcs
- **Prussia** — Found the Zollverein, raise the German Question, force the
  Brothers' War (free CBs vs Austria). North German Confederation as the
  historical stepping stone; Germany from 1848 (the era gate shows in the
  Formables panel). GERMANY cores healed to the actual German Confederation.
- **Piedmont** — Champion the Risorgimento, court the French entente,
  sail the Expedition of the Thousand, pose the Roman Question (France
  will not smile on it). ITALY cores now include Austrian Lombardy-Venetia:
  fight Vienna for it, or unite every last minor.
- **AI nations play the arcs too** — the AI now takes national decisions
  (conservatively, deterministically); AI Austria competes for
  grossdeutsch; balance-of-power pressure makes the great powers watch any
  near-unifier.

### The visible economy (E1)
- Build buttons carry production chains and LIVE per-unit margins at
  market prices, sorted most-profitable-first. 11 civilian industries
  from 1820 (pre-industrial crafts un-gated).

### War readability (U4)
- Battle reports name the WHY (dice, organization, leadership,
  technology, terrain, fortress) from the player's perspective.
- Nation flag chips on every army and fleet counter.
- War alerts and the war list name belligerents, not ids.

### The finish line (U5)
- A yearly campaign chronicle; at 1920 (or on elimination) it becomes a
  recap of atlas plates — territory, population, prestige curves, wars
  fought, best rank — with "keep playing" always available.

### Pacing (U3)
- Century-probe harness (`npm run probe:pacing`) encoding the pacing
  contract: no dead decades, anchored prices, era-gated unifications.
- Great-power score rebalanced (diminishing industrial returns): the GP
  table moved twice in 80 years before; rank churn is back.
- Prussia healed: real 1820 population weight and coal (Silesia, the
  Ruhr) instead of a uniform-weight timber lot.

### Also
- Living title screen: the camera drifts across the world behind the
  title card. Era-appropriate nation flags everywhere (U0). Tap a
  country name to open its diplomacy view. Mobile panel scrolling fixed
  (iOS dvh); tutorial coach never blocks the nav.

[1.0.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.0.0

## [0.9.0] — 2026-07-21

The visual overhaul: the game now looks like the atlas it always wanted to be.

### The atlas plate (V1–V7)
- **Title screen** — hero backdrop, searchable nation browser, resume row,
  seed behind Advanced.
- **Panel & HUD chrome** — engraved rules, title shields, event-kind borders,
  wax-seal close buttons, alternating rows; typography/focus/micro-interaction
  polish; mobile refinements.
- **Map engraving** — deeper nation fills, land aquatint, player border halo,
  settlement dots, real rivers (478) & lakes (324) from Natural Earth 10m,
  capital star glyphs.
- **Real borders, done right (V7)** — provinces rebuilt as a true Natural
  Earth 10m tessellation (every NE admin-1 unit assigned to exactly one
  province): 0 overlapping provinces worldwide (V6 had 150+ in Europe alone),
  0 holes, real coastlines, national-border ink only on actual national
  borders. Topojson-style shared-arc simplification keeps both sides of every
  border vertex-identical.

### Nation flags (1.0-U0)
- Era-appropriate flags for all 48 nations + the German/Italian formables —
  hand-drawn plates in a muted atlas palette (Habsburg black-gold, 25-star US,
  pre-1910 blue-white Portugal, Bourbon Two Sicilies, Tokugawa mon) — shown in
  the HUD, diplomacy, great powers, event feed, panel chrome, and nation
  browser. Unknown tags (procedural nations) fall back to procedural shields.

### Procedural map modes (PR #5)
- Start on the historical map, or a seeded procedural remap — contiguous
  reshuffled realms using real nation identities or invented countries —
  wired through the menu, permalinks, and saves.

### Fixes
- Political fills / hover / occupation overlays render again (V6 had dropped
  the GeoJSON feature ids that feature-state needs; promoteId guards it now).
- Country labels anchor at each nation's CAPITAL (UK labeled over Bengal
  before — the seed's capitals were population-picked; 20 healed to real 1820
  capitals) and no longer flash: label layout re-ran every sim tick, now only
  when ownership actually changes.
- Diplomacy/great-power rows keep flag and name together; seed reroll is a
  text button (the die glyph had no font coverage).

[0.9.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.9.0

## [0.8.0] — 2026-07-21

Nationalism, performance, and a mobile fix pass.

### The Age of Nationalism (culture / national identity)
- Cultures 8→32, religions 5→7. Multi-cultural empires now carry real **minorities**
  (Austria ~31% German / 22% Hungarian / 18% Italian / 16% South-Slav / 13% Czech;
  Russia's Poles/Finns/Balts/Ukrainians; British India; Dutch Indies; Ottoman
  Balkans/Arab vilayets).
- **Accepted vs non-accepted cultures** (non-accepted → more militancy, no crown
  recruitment), **assimilation** (isolated minorities melt toward the primary culture,
  conserving people; rate by isolation/literacy/policy), and **national movements** —
  a boiling non-accepted culture launches a separatist independence rebellion (through
  the existing rebellion caps). Player levers: cultural policy (exclusionary/
  assimilationist/pluralist) + grant/revoke acceptance. New Cultures panel; province
  dossier shows cultural makeup.

### Performance
- O(n) hot loops fixed (politics.monthly pop-bucketing + reform map; war.daily
  indexes). GeoJSON quantized (~1.24MB → ~546KB raw). Map fill skips unchanged
  provinces. Behavior-preserving + deterministic.

### Mobile UI
- **Fixed tap latency** — buttons now register immediately (touch-action + instant
  `:active` feedback, no double-tap).
- **Fixed notification spam** — routine events (elections) collapse quietly into the
  outliner; only war / crisis / bankruptcy / your own election pop prominently.
- Mobile polish for the new Technology & Crisis panels as sheets.

### Notes
- 141 tests (test:all) green; balance envelope held; SP + MP intact; old saves
  self-heal. (One culture test is intermittently load-flaky — a test-infra item.)

[0.8.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.8.0

## [0.7.0] — 2026-07-21

Deeper gameplay: great-power crisis diplomacy + a much bigger tech tree.

### The Concert of Europe (new headline system)
- **Great-power crisis diplomacy** — the world accumulates **tension**; tension
  ignites **flashpoint crises** (sphere contests, containment, humiliations); great
  powers **take sides**; each crisis ends either at a peaceful **congress** (demand
  enforced, big prestige swings) or, when blocs are balanced and both press, a
  **great war** (bloc-vs-bloc, resolved by the existing war machinery).
- New **Crisis panel** inside "Great Powers & the Concert": tension meter, live
  crisis card with Back Attacker / Back Defender / Press Demand / Back Down, and a
  congress ledger. Emergent texture: ~18-22 crises per 60-year campaign, most
  resolved at congress, the occasional catastrophic great war.

### Technology depth
- The tech tree roughly doubled (~80 entries): railroads, chemistry, medicine,
  electricity, naval/army modernization and more, with more wired effects
  (movement/supply, pop health, tax/trade/profit, war stats) and new inventions +
  production chains.

### Notes
- Additive types (old saves self-heal); pure/DOM-free so both run in single-player
  and the multiplayer server. 120 tests (test:all) green; balance envelope held.

[0.7.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.7.0

## [0.6.0] — 2026-07-21

"The Inventive Century" — a real technology & invention system for the 1820-1920
industrial arc.

### Technology & inventions (new)
- A **player-directed tech tree**: 31 techs in 5 year-gated prereq columns + 12
  inventions. Research points, selection, ETA, and an idle auto-pick so no one stalls.
  (Previously the player literally could not research — it was AI-only.)
- **Tech effects now actually apply**: factory throughput (economy), tax efficiency
  (budget, deducted from pops — no minted money), and army/navy quality (war).
  Formerly dead display strings.
- **New tech-gated production chains** fill previously-inert goods (fish, wine,
  furniture, machine parts, artillery) — no more permanent unmet needs.
- New **Technology panel** (5 period-styled columns, progress + invention ledger);
  Production offers only unlocked recipes.

### Critical economy fix
- **Every input-consuming factory had produced zero output since the M2 economy**
  (`buyFromMarket` clamped Infinity→0). Fixed — the industrial economy is now alive,
  with a factory recalibration routing value to worker pops while taxes stay the
  state's lever. Pops remain believably fed (balance envelope green).

### Notes
- Strictly additive types (old saves load unchanged); pure/DOM-free so it runs in
  both single-player and the multiplayer server. 110 tests (test:all) green.

[0.6.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.6.0

## [0.5.0] — 2026-07-21

The visual overhaul — the map now reads as a premium antique atlas.

### Map rendering (0.5.1 + 0.5.2)
- Engraved sea with wave-lines, graticule, coastal aquatint + waterline rings, and
  spaced-italic ocean lettering; opaque land underlay + SE plate-shadow depth;
  paper grain + mottle + vignette + page-light varnish; de-washed nation pigments;
  letterpress labels placed on-territory (pole of inaccessibility).
- **Terrain mapmode** — an 11-biome hand-tinted physical plate (deserts, plains,
  forest/jungle, slate mountains, arctic) with engraved terrain textures + legend.
- **Heraldic map counters** — engraved heater-shield army tokens vs round naval
  cartouches, owner pigment + strength ribbons, wax-seal battle/siege/blockade
  badges (replacing the old text pills).
- **Engraved relief/hillshade** for mountain provinces (NW light), mapmode
  cross-fade transitions, archipelago waterline cleanup.
- Fixed a race that could leave the map uncolored if paused before load.

[0.5.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.5.0

## [0.4.0] — 2026-07-21

The big one: live multiplayer, a full UI + visual overhaul, a topology-fixed map,
and a timeline rescope. Play: https://lakesidegames.net/games/grand-century/

### Multiplayer (new)
- **Session-based live multiplayer** for 2-8 players — server-authoritative sessions
  on a Node WebSocket server; single-player is unchanged (local worker).
- **Lobby**: create/join sessions by clicking (invite links too), nation selection
  (competitive one-each) or teams (co-op), leader-controlled start/speed, presence.
- **Snapshot diffing + compression + cadence cap** — bandwidth for 8 clients dropped
  from ~94 MB/s to well under 1 MB/s; the sim no longer burns CPU while paused.
- **Reconnect** with nation-hold grace + resync, **in-session chat**, presence HUD.

### UI overhaul
- A cohesive premium design system (parchment/ink/wax palette, self-hosted EB
  Garamond + Source Serif, spacing/elevation tokens) applied across the HUD, every
  panel, menus, and event popups — desktop and mobile.
- Interactive tutorial coach, tooltips-that-trace, actionable alerts, Economy panel.
- Mobile controls fixed (all buttons were tap-dead — pointer-events).

### Visual / map overhaul (0.5.1)
- A premium antique-atlas map: engraved sea with wave-lines + graticule + ocean
  lettering, plate-shadow land depth, terrain-textured fills, paper grain + vignette,
  richer pigments, letterpress labels. Map labels now render on-territory
  (pole-of-inaccessibility placement).

### Map data — borders fixed + rescope
- **Topology-preserving simplification (TopoJSON)** — no more sliver gaps, overlaps,
  double lines, or missing national borders; German/Italian states and France
  de-boxed into organic regions. Fixed a gameplay bug (614/620 provinces were wrongly
  flagged coastal → now ~46%).
- **Rescoped to 1820-1920** (from 1836) with a plausible 1820 political map.

### Performance
- Fast test gate (unit ~9s; `test:balance`/`test:all` for long sims). Perf audit
  drove the snapshot cadence + MP diffing work.

### Notes
- 93 tests (test:all) green. New MP server runs as a systemd service behind a Caddy
  WebSocket route.

[0.4.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.4.0

## [0.3.0] — 2026-07-20

Theme: deepen the war pillar, add narrative agency, pay down platform debt — plus
a major map-data rework from playtest feedback.

### War depth & UI (E5)
- Peace-conference settlement (stack multiple war goals within the war-score
  budget; AI offers/accepts sensibly).
- Army/fleet stack counters, movement, occupation shading on the map.
- Unit composition on recruitment (infantry/cavalry/artillery/guard) gated by
  conscription/professionalism reforms, with distinct combat roles.
- Rebellions are real: rebel armies with demands; a victorious rebellion forces its
  demand (reform enacted or provinces flip).

### Events & decisions (E4)
- Data-driven events engine with a curated set: 1848 Springtime of Nations,
  economic panics, colonial scramble, succession, discoveries. Player decisions
  gated by prerequisites, with real trade-offs. Fired as event popups.

### Balance & world feel (B1)
- Deterministic season-report harness; tuned so pops are believably fed and pop
  growth is sane. Rebellion governance (thresholds, caps, cooldowns) — concurrent
  rebellions dropped from 1000+ to a handful.

### Map data rework (playtest feedback)
- Consolidated from 1450 to ~473 provinces using **real Natural-Earth admin-1 units
  with real names** (Gansu, Piedmont, California…). China 80 → 33 real provinces.
  Western Europe no longer boxy. Zero fake numbered names. Vivid, distinct nation
  colors.

### Performance & platform (E6, #4)
- Split the heavy multi-decade sims: `npm run test` (unit) now runs in ~9s;
  `test:all` / `test:balance` for the long-run envelope.
- MapLibre kept off the critical path; PWA (installable, offline-capable) with a
  service worker; shareable permalinks (`#/new?seed&nation`).

### Fixes
- Mobile: all HUD controls were tap-dead (pointer-events) — fixed.

### Known limitations
- Map **labels** are not rendering — deferred to the 0.4.0 UI overhaul.
- France came out heavily consolidated (few provinces); can be subdivided later.

[0.3.0]: https://github.com/Egg3901/grand-century/releases/tag/v0.3.0

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
