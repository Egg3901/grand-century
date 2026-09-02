# Changelog

All notable changes to Grand Century are documented here.

## [Unreleased]

## [1.7.0] - 2026-09-02

### The long century

Grand Century now treats its Victoria 2 inspired simulation as an engine for
multiple historical worlds, not a game tied to one opening day.

- **Seven selectable starts.** The scenario ladder now covers 1700-01-01,
  1776-07-04, 1815-06-18, 1830-01-01, 1914-07-28, 1936-01-01, and
  1945-09-02. The established 1830 world remains the compatibility start.
- **Seeded exact-date worlds.** Scenario manifests, rosters, diplomatic
  relationships, ownership, geometry assignments, and provenance compile into
  deterministic runtime seeds. The 1914, 1936, and 1945 maps assign all 548
  provinces; earlier development scenarios retain explicit coverage gaps rather
  than inventing unsupported owners.
- **A reusable historical pipeline.** OpenHistoricalMap and Cliopatria inputs
  are classified and reviewed through checked-in source packets. Third-party
  geometry remains a validation and compilation input and is not vendored into
  the shipped map.
- **Simulation dates are no longer Victorian-only.** Runtime clocks, saves,
  military systems, diplomacy, economy, AI, events, and UI date handling now
  support the full 1700 to 1945 range and long campaigns beyond it.
- **Historically neutral visual policy.** Twentieth-century German scenarios
  use neutral civic and military presentation. Nazi symbols and imagery are
  prohibited from generated and shipped assets.
- **Reproducible national borders.** Historical seed generation now rebuilds
  national border geometry and checks it for drift alongside the 1830 baseline.
  A pinned validation-only basemap audit remains available for research.

[1.7.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.7.0

## [1.6.1] - 2026-08-24

- Added local, era-styled flags for all thirteen polities introduced by the
  1820 reconstruction. The nation browser and HUD no longer request missing
  flag assets.
- Added a release gate that requires every playable polity to have a local
  flag before the historical seed can ship.

[1.6.1]: https://github.com/Egg3901/grand-century/releases/tag/v1.6.1

## [1.6.0] - 2026-08-24

### The world of 1820

Grand Century now begins in 1820, after the Napoleonic settlement and amid the
Atlantic independence era. The date is its own premise, not an inherited 1836
starting line.

- **Thirteen additional polities.** The roster grows from 67 to 80 with Russian
  America, Hawaii, Finland, Congress Poland, Lombardy-Venetia, Algiers, Hejaz,
  Funj, Darfur, the Kazakh Steppe, Bukhara, Khiva, and Kokand.
- **Imperial relationships are explicit.** Constituent states, vassals, colonial
  administrations, tributaries, and decentralized polities no longer have to be
  flattened into either fully sovereign countries or blank land.
- **The worst ownership blobs are broken up.** Central Asia, the Ottoman sphere,
  North Africa, Russian America, Hawaii, and the post-colonial Americas now paint
  from checked-in 1820 assignments. National borders regenerate from that data.
- **The nation browser speaks to the date.** New and corrected polities carry an
  1820 summary, primary culture, religion, and relationship instead of generic
  fallback text.
- **Historical content is reproducible.** A checked-in compiler validates dated
  source packets, province identity, capitals, owners, controllers, relationship
  chains, and historical anchors before producing the runtime seed.
- **Save mismatches fail safely.** The world fingerprint schema advances so saves
  from the former 67-country topology cannot silently load against the new map.

[1.6.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.6.0

## [1.5.0] — 2026-08-01

### The great game
The century had stopped moving. On the default seeds no nation ever unified,
the same eight great powers held the table for ninety years, and the economy
quietly starved from year thirty onward. All four were mechanisms, not tuning.

- **Unification wars.** A formable candidate now holds a standing, discounted
  claim on every core state it lacks — the Risorgimento pretext. The AI
  presses it against the weakest beatable owner, and you will find it ready
  in the Foreign Office. Sphering the minors still works; it is just no
  longer the only road to a crown.
- **Sphere defection.** Client states can tear up their patronage. The AI
  does it when unification is one core away; you get a "Leave the sphere"
  button on the Formables panel. The patron's grip resets to zero and the
  insult is not forgotten. Together these two took seed 4711 from zero
  formations in a century to Germany and Italy both proclaimed and Germany
  seated among the great powers by 1870.
- **Prestige fades.** 0.5% a month, a half-life of about eleven years. Sphere
  and influence prestige only ever accrued to sitting great powers, so the
  top eight had become self-sealing — the Ottomans matched Spain on industry
  and military and sat outside at prestige 6 against 784. Old glory is now a
  flow, not a moat, and armament moves the table again.
- **The land answers scarcity.** Needs-met decayed from year 30 because
  promotion was one-way: workers left for the mills whenever openings
  existed, farm capacity was frozen at bootstrap, and by 1880 the
  countryside held 15% of the population and the world went short. Promotion
  now follows realized wages — factory pay must beat farm pay — a clear farm
  premium pulls craftsmen back, and a saturated farm whose good prices above
  base grows a level. Needs-met at 1880: 0.60 before, 0.98 after, with world
  fill back at 99.9%.
- **Hoards become demand.** Pops sitting on more than half a year of basket
  now buy multiples of their everyday and luxury needs instead of banking
  forever. This is the money sink that lets taxation reach consumption at
  the margin.
- **Near-great-power crowns.** The great-power gate on Germany, Italy and the
  North German Confederation also admits a nation within striking distance
  of the eighth seat. A Prussia that fought its way to every NGF core should
  be crowning an emperor, not filing paperwork.

## [1.4.0] — 2026-07-27

### The chancery
Diplomacy was a wall of buttons. Forty eight countries, each with six identical
parchment buttons stapled to it, sitting under a war form that filled the whole
screen. On a phone you could not see a single country without scrolling.

It is now three bands, in the order a foreign minister actually works in.

- **Your standing, at the top.** Points, infamy, rivals and influence as four
  gauges. Every number opens to show where it came from. Fabrications you have
  in flight are listed here, so committed points are never hidden.
- **The roster.** One line per country: flag, name, a wax seal for the
  relationship, and a bar showing how they feel about you. No buttons. Filter by
  Relevant, Powers, Near or All, each with a live count, and search reaches every
  country on the map whatever filter you are on. That is the answer to a long
  list on a small screen. You type three letters instead of scrolling.
- **The dossier.** Pick a country and everything about that country is in one
  place, including the war console. The target dropdown is gone because the
  roster is the target picker. Buttons you cannot use now say why in plain
  words, for example "Alliance: Would refuse: score 20 of 70" or "Rivalry: Cap
  reached (4 of 4). End one first."

Great Powers got the same treatment and now links straight through to a
country's dossier, so you are not holding two screens in your head.

### Everywhere else
- Panels are taller on phones. The old ceiling left a band of dead map above
  every sheet.
- Section headings stick to the top as you scroll, so you always know which
  ledger you are in.
- Every kind of notification now has its colour. Eight of them never had one,
  and two colours were defined for kinds that could never appear.

### Under the floor
Groundwork for the economy rework, switched off by default so nothing changes
yet. The market has been paying producers for everything they make rather than
everything they sell, which quietly created money out of nothing: by 1825 it was
paying out seven and a half times what buyers spent. That is why taxes have
never had any bite. The replacement is written and measured, and turning it on
comes with the rebalance it needs.

[1.4.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.4.0

## [1.3.0] — 2026-07-27

### The floor
The game does the same things it did yesterday, using markedly less of your
machine to do them. Nothing here changes how it plays — that was the rule, and
it was checked rather than assumed.

- **The map and panels load in pieces.** Opening a panel used to pull every
  panel; the map used to arrive as one 1.3 MB block. Both are split now, and the
  offline cache went from 10.2 MB to 2.0 MB — which also means the world can get
  bigger later without quietly breaking offline play.
- **Screens stop redrawing when nothing changed.** Every panel, the HUD and the
  map used to redraw eight times a second whether or not anything they showed
  had moved. Most now watch only the parts they display.
- **Multiplayer builds one world view per broadcast instead of one per player.**
  With eight players that was twenty-seven full world rebuilds a second.
- The daily war pass, the snapshot builder and the culture ledger all got
  cheaper — the culture figures are recalculated when population actually
  changes rather than eight times a second.

### Checked, not assumed
Every change here was verified to produce a byte-identical world: ten sim-years
across three seeds, hashed and compared against the previous release. Two things
that verification caught, which would otherwise have shipped:

- A snapshot refactor appeared to change the world. It had not — the probe was
  comparing key order rather than content. The probe was fixed.
- The culture cache was refreshed monthly while the underlying figures change
  weekly, so the Cultures panel could show numbers up to a month old. Sampling
  mid-month rather than on year boundaries exposed it.

[1.3.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.3.0

## [1.2.0] — 2026-07-27

### The instruments
Nothing here changes how the game plays. It changes what we can see — the
gates every later change will be measured against.

- **Save fingerprint.** Saves now record the world they were made against
  (province count, content schema version, and a hash of the seed's ownership
  topology). A save from a different world is refused with a message that says
  so, instead of loading and painting the map with someone else's provinces.
  Saves made before this still load — a missing fingerprint is accepted.
- **Content lint + coverage.** Every event has a choice, every decision chain
  resolves, and every formable's core states exist — checked automatically, so a
  future map rework cannot silently drop content that points at ids which no
  longer exist. It also counts what each nation has to do, and the answer is
  currently: 2 of 48 nations have a decision of their own, 3 have an event of
  their own, 20 can form something, and **28 have none of the three**.
- **Multiplayer conformance + bandwidth gates.** The multiplayer server runs the
  only world, so any change to the simulation is a change to multiplayer. A test
  now proves the server and single-player produce identical worlds from the same
  seed and inputs, and pins the wire cost so it cannot grow unnoticed.
- **Performance budgets, recorded.** Snapshot building, the culture ledger, and
  the number of screens that redraw on every tick all have measured numbers now,
  so "we made it faster" becomes a claim with evidence.
- **The steerability probe explains itself.** When a lever looks like it does
  nothing, the report now says whether players were limited by money or by what
  the market had in stock — which turned "the tax slider is inert" into a
  specific, fixable finding about the economy.

### What the new instruments immediately found
The gates earned their keep on their first run. None of these are regressions —
they are things that were always true and that nothing could see:

- Fiscal policy is decorative (#33). Cutting tax moves player pop cash by 2.5
  million and how well fed those pops are by 0.0002. Nobody is short of money —
  pops sit on roughly 833 rounds of everything they need to buy — so taxing them
  cannot reach them, and the treasury has been pinned at its ceiling since year
  three of the century.
- No unification happens (#34). Across a full century on both balance seeds,
  not one of the six formable nations ever forms.
- The great powers never change (#35). After the opening decade the top table
  moves six times in ninety years on one seed and not once on the other.
- Prices sit at roughly twice their base for the whole century (#36), within 4%
  of tripping the inflation gate.

[1.2.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.2.0

## [1.1.0] — 2026-07-27

The audit release. A thirteen-system design pass asked three questions of every
mechanic — is it balanced, is it visible, is it deep — and this is the answer to
the first two. The game stops hiding its own arithmetic, and stops quietly
lying about the parts that never worked.

### The game stops lying
Five reforms were decorative. Guarantees did not join the wars they guaranteed.
Factory subsidies were debited from the treasury and never credited to the
factory. Negative tariffs were free money. All of it is wired now.

- **White peace is no longer a free exit** — an empty peace offer used to end
  any war outright, whatever the war score said.
- **Sphered cores are not conquered cores** — unification no longer counts a
  sphere member's land as controlled, and no longer annexes it for nothing.
- **Tariffs are billed both ways** — a negative tariff is an import subsidy and
  the treasury pays for it.
- **Factory employment is exclusive per state** — N factories used to draw on
  the same craftsmen N times over.
- **Scandinavia and Iberia required no action to form.** They do now.
- Colonial claims from events persist; plant-spam restacking is blocked;
  research point grants respect the cap.

### The economy you can finally see
- **The clerk and capitalist ladder is alive** — the promotion paths existed in
  the data and moved nobody. Wages and profits now reach the classes that were
  written to receive them.
- **A national stockpile with standing buy and sell orders** — the Victoria
  trade lever that was missing entirely. Order a good into reserve or flood it
  onto the market at a daily rate; large orders visibly move the price.
- **Honest build margins** — production shows real cost and real profit, RGO
  weekly profit lands in the ledger, and factory P&L traces to its inputs.
- **Budget breakdown as a chart** — income and expense as hand-drawn plates,
  army and navy split in the upkeep trace, a live projected ledger while you
  drag the slider, bankruptcy recovery in the HUD.

### A century that moves
- **Pop ideology drifts** with consciousness, militancy, needs and literacy
  instead of standing frozen at 1820 for a hundred years.
- **Reform fatigue** — a nation that has just reformed resists the next one;
  support and cost both feel it, and it decays month by month.
- **Irredentist claims on lost cultural cores** — losing your people's land
  gives you the casus belli to want it back.
- **Combat width** soft-caps the stack, which kills the doomstack.
- **Three new unification arcs** — Gran Colombia, the Scandinavian Union, the
  Iberian Union. Nine nations now have something to become.

### The hidden state, surfaced
Roughly forty things the simulation always computed and never showed: war score
by component, diplomatic points and fabrication cost, colonial points and
claims, crisis showdown forecasts, upper-house composition, party standings and
election maths, alliance acceptance previews, tech modifier stacks, invention
odds, per-type militancy and needs in the province panel, migration and
promotion ledgers, occupation percentage, supply badges, in-panel battle logs.
Population and culture get real charts; every number traces to its inputs on
tap or hover, on a phone as well as a desktop.

### Faster
- Whole-world scans removed from the daily war loop (#7); per-snapshot
  main-thread work cut at 8 Hz (#8); a single-pass snapshot builder with
  bit-identical output (#9); the in-game HUD split off first paint and a dead
  copy of the world seed dropped from the bundle (#10).

### Also
- **Error tracking is real.** GlitchTip was wired in 1.0 and never delivered a
  single event: the DSN pointed at a host that now redirects to another origin,
  and the release tag was the literal string `dev` because the deploy command
  never set it. Both fixed — the release is now `<version>+<sha>`, derived at
  build time so it cannot be forgotten again, and the build stamp is visible on
  the main menu so a bug report can name its build.
- War alerts name belligerents; unit markers are scoped to nations you can
  actually see; the province panel chrome shows the owner's flag; tooltips are
  touch-friendly and stay on screen.

[1.1.0]: https://github.com/Egg3901/grand-century/releases/tag/v1.1.0

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
