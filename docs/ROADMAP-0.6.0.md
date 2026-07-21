# Roadmap 0.6.0 — "The Inventive Century": Technology, Inventions & Industrial Progress

**Theme:** a real, player-directed technology & invention system that paces the game's
1820–1920 arc and feeds every existing pillar — economy throughput, new production
chains, army/navy quality, tax capacity, prestige, and literacy.

---

## 1. Why this is the right next depth

The game's timeline **is the century of industrialization**, but before 0.6.0 the tech
layer was a stub with three hard gaps:

1. **The player literally could not research.** Research point generation and tech
   selection lived inside `runAiMonthly` (`src/sim/systems/ai.ts`), which skips
   `isPlayer` nations. A player started with `market_structure` and never gained
   another tech for a hundred years.
2. **Most tech effects were dead strings.** `'+Factory throughput'`, `'+Tax
   efficiency'` etc. existed only as display text; `src/sim/systems/economy.ts` and
   `src/sim/systems/budget.ts` never read `nation.techs` at all. Only war
   (`src/sim/systems/war.ts`) consumed techs, via substring matching over 8 techs —
   of which several didn't even match its own patterns.
3. **A third of the goods table was inert.** Pops demand fish (a *life* need), wine,
   furniture, machine parts and artillery (`src/data/gameData.ts` POP_NEEDS), but no
   recipe in the world produced them — permanent unmet needs and permanently
   price-capped ghost goods.

A tech tree fixes all three at once and gives the player the one thing a century-long
grand strategy game must have: **a long-horizon plan** ("rush Bessemer, industrialize,
then out-shoot Prussia in 1880"). It is also the *lowest-collision* deep system: it is
almost purely additive (new system file, new data, new panel, optional fields), and it
does not restructure the deliberately fragile world-market clearing math.

**The counterfactual (what I didn't pick, and why):**
- *Trade routes / regional markets* — the deepest economy option, but it rewrites
  `market.ts`'s conservation-checked clearing loop that three test suites and the
  balance gate depend on; highest regression risk while the 0.5.0 visual agent works
  in parallel, and its player-facing payoff is opaque without a big UI investment.
- *Diplomacy congresses/crises* — good candidate, but diplomacy is already the
  second-deepest system (753 lines: spheres, influence, CBs, coalitions); tech was
  the *thinnest* pillar. Crises become **better** once tech differentials exist to
  fight over. Deferred to 0.7.0 (below).
- *Culture/assimilation, colonization v2, AI v2* — all real, all narrower. AI v2
  notably *benefits* from tech existing first (tech-aware build/army decisions).
- *Do nothing / polish* — the sim's biggest legibility complaint is "nothing to plan
  toward"; polishing existing panels doesn't address it.

---

## 2. What shipped in this slice (M1 — done)

**Sim** (pure, worker + Node server safe, deterministic — rng-threaded only):
- `src/sim/systems/research.ts` — NEW system, run monthly from `src/sim/world.ts`
  (`runResearchMonthly`, between politics and diplomacy):
  - research point generation for **all** nations (old AI formula preserved:
    `1.4 + literacy·4.8 + GP bonus`, now × `(1 + researchRate)` tech modifier);
  - player-directed research via the new `setResearch` command; points bank while
    idle; **auto-pick fallback** (cheapest tech at 1.5× banked cost) so unattended
    nations — including multiplayer humans — never stagnate;
  - AI target selection ported from `ai.ts` (war-posture + ruling-party weighting),
    now producing a visible `currentResearch` project instead of an instant unlock;
  - **inventions**: monthly deterministic rolls, literacy-scaled, gated on a
    prerequisite tech (`InventionDef`);
  - typed modifier aggregation `techModifiersFor(nation, data)` (cached) →
    `factoryThroughput / rgoThroughput / taxEfficiency / researchRate /
    literacyRate / prestigeMonthly`.
- Effect wiring (previously dead):
  - `src/sim/systems/economy.ts` — RGO + factory output scale with tech throughput;
  - `src/sim/systems/budget.ts` — commerce tech scales collected tax (deducted from
    pops — no money minted), with a budget-trace line;
  - `src/sim/systems/war.ts` — **zero code changes**: new army/navy tech keys are
    named to hit its existing substring scoring (`army_*`, `navy_*`, `ironclad`,
    `artillery`, `staff`, `guard`…), so land combat, naval combat and colonial
    points all deepen with the tree automatically.
- Gates: `buildFactory` (commands.ts) and the AI's `maybeBuildFactory` (ai.ts) now
  honor `requiresTech` + `requiresCoastal` on recipes.
- **Critical pre-existing bug fixed** (`src/sim/systems/market.ts`,
  `buyFromMarket`): factories buy inputs with `availableBudget =
  Number.POSITIVE_INFINITY`, but `finite(Infinity)` collapsed that to a **0
  budget** — so every input-consuming factory in the game had produced **zero
  output since M2** (verified on vanilla master: 0 of 294 factories producing;
  all manufactured-good supply was 0 forever). Infinity now means
  "not budget-limited" (NaN still means broke). After the fix, hundreds of
  factories produce, input chains clear through the market, and the
  conservation invariants still hold.
- **Factory economy recalibration** (required by the fix — the old constants
  only ever ran against zero output). Verified against the full 60-year balance
  gate (both seeds) and the m2 bankruptcy gate:
  - `src/sim/balance.ts`:
    - `factoryRevenueMultiplier` 2.2 → 2.0 (trim the phantom-revenue stack a
      touch; factories are very profitable but no longer print money into the
      treasury — see below).
    - `factoryWageShare` 0.28 → 0.45 — the decisive welfare knob. With
      factories finally producing, more value must reach the craftsman / clerk /
      laborer pops that buy food instead of pooling in capitalist/aristocrat
      pops. This is what keeps late-game pops fed (`avgNeedsMetFinal`).
    - `rgoOutputBoost` 1.2 → 1.5 — raw-good (especially food) supply now has to
      keep pace with a century of population growth AND factory input demand;
      the extra RGO throughput holds food prices down over 60 years.
  - `src/sim/systems/economy.ts`: factory value flows to **pops** — capitalist
    cut 0.18 → 0.55, falling back to **aristocrats** (the seeded world has no
    capitalists until promotion creates them) before the state. The state's
    tax-independent skim drops to a vestigial 0.03 per factory / 0.02 per state
    (was 0.55 / 0.2): the pre-fix skim was tuned against dead factories and, once
    production woke up, became a money fountain that made a zero-tax
    overextended nation un-bankruptable. **Taxes are now the state's lever on
    industry** — the intended design — and the m2 bankruptcy gate passes again.
  - Net effect on the balance envelope (worst seed 6602, 60y): `avgNeedsMetMean`
    **0.542 → 0.690**, `avgNeedsMetFinal` **0.460 → 0.616**,
    `highMilitancyShareFinal` 0.46 → 0.29 — all back inside their bands; wars,
    hegemony, rebellions, inflation and pop-growth bands unchanged and green.

  Note on the regression's true cause: it was **not** tech-gating starving pops
  (every gated recipe produces a good — fish/wine/furniture/machine-parts/
  artillery — that had *zero* production before, so gating them only *adds*
  supply). It was the market bugfix waking up factories inside an economy that
  had been silently tuned around them being dead.

**Data** (`src/data/techs.ts`, wired in `src/data/gameData.ts`):
- **31 techs** in 5 columns (army/navy/commerce/industry/culture), linear prereq
  chains, year-gated 1820→1900, costs 7→240. The 8 legacy tech keys survive verbatim
  as the 1820 roots (saves + bootstrap seed compatibility).
- **12 inventions** (Sewing Machine → Assembly Line).
- **6 new tech-gated production chains** filling the demanded-but-unproduced goods:
  Fishing Wharf (coastal), Vintner Estate, Lumber Mill → Furniture Works,
  Machine Parts Works, Artillery Foundry.

**Types** (`src/shared/types.ts` — strictly additive): `TechModifiers`,
`InventionDef`, optional fields on `TechDef`/`Recipe`/`Nation`/`GameData`/
`PlayerStateSummary`, `PlayerTechView` (+`TechStatusView`/`InventionStatusView`) on
the snapshot, and the `setResearch` command. Old saves load unchanged (all new
fields optional, read with fallbacks).

**UI:** `src/ui/panels/TechnologyPanel.tsx` (+ registration in `PanelHost.tsx`, one
rail entry in `Hud.tsx`, styles in `panels.css` on existing theme tokens): five
period-styled research columns with year/cost/effects/unlocks, active-research
progress bar with ETA, halt-and-bank control, and the invention ledger
(Discovered / Possible). `ProductionPanel.tsx` now offers only unlocked recipes
(and coastal recipes only in coastal states).

**Tests:** `tests/e6.research.test.ts` — 16 tests: data integrity (refs resolve,
legacy keys survive), determinism (same seed ⇒ identical techs/inventions/rngState
after 5 years), player research completes + effects apply, prereq/year-gate
rejection, idle banking + auto-pick, AI decade progression (no dupes, chains
respected), invention prereq safety, recipe gating (tech + coastal), tax-efficiency
effect, and a 20-year full-sim stability run (no NaN, bounded points/literacy/
modifiers, market invariants still conserved).

**How to see it:** `npm run dev` → HUD rail → **Technology**. Pick e.g.
*Mechanical Production* (done in ~2 months as Britain), then *Practical Steam
Engine* → *Mechanized Sawmills*, and watch Lumber Mill / Furniture Works appear in
the Production panel and furniture prices finally move in the Market panel.

---

## 3. Milestone plan for the rest of 0.6.0 (prioritized)

| # | Milestone | Scope | Hooks | Acceptance |
|---|---|---|---|---|
| **M1** | ✅ Core tree + inventions + effects + panel | (shipped above) | — | build/test green; player researches; effects observable |
| **M2** | **Research inputs from society** | Clergy/clerk pop share and school-reform level feed `researchPointsPerMonth`; uncivilized nations get a westernization discount path | `src/sim/systems/research.ts`, `pops.ts` literacy loop | educated societies visibly out-research autocracies; test asserts monotonicity |
| **M3** | **Tech-aware AI & unit gating** | AI weighs unlocked recipes in `maybeBuildFactory` margins (done) + army composition by spec techs; gate `ironclad` ship type behind `navy_ironclad_warships`, `guard` regiments behind `army_professional_drill` | `ai.ts`, `war.ts` recruit/buildFleet paths, `commands.ts` | AI with tooling tech builds machine-parts industry; ironclads impossible in 1820 |
| **M4** | **Invention events & flavor** | Surface invention firings as event popups with a choice (patent/state funding); a few scripted historical anchors (Great Exhibition 1851) | `events.ts` (EventEffect `grantInvention`), `data/events.ts` | inventions feel like moments, not silent stat bumps |
| **M5** | **Tech map mode + ledger polish** | "Industry/Tech" map mode tinting provinces by owner tech score; tech column in Great Powers panel | `GreatPowersPanel.tsx`, map mode registry (coordinate with 0.5.0 visual agent) | at-a-glance tech gap vs rivals |
| **M6** | **Balance pass** | Tune costs/pacing so a focused GP finishes ~80% of one column by 1920; headless century run in balance gate | `tests/m6.balance.test.ts`, `balance.ts` | century sim: GP average 18–26 techs, no runaway treasury from tax-efficiency stacking |

**0.7.0 seed:** diplomacy crises & congresses — now with tech differentials worth
fighting over (ironclad navies vs sail, breech-loaders vs muskets).

---

## 4. Architecture notes

- Determinism: all randomness through the threaded `Rng` (`world.rngState`); nation
  loop and data iteration order fixed; two same-seed runs byte-match (tested).
- Sim/UI boundary intact: UI reads `snapshot.playerTech`, writes only
  `{t:'setResearch'}`. `research.ts` imports nothing outside `shared/sim/data`.
- Multiplayer: system is DOM-free and runs in the Node server unchanged;
  `setResearch` resolves against `world.playerNation` exactly like `buildFactory`.
  One deliberate 3-line touch in `src/net/snapshotCodec.ts`: `playerTech` added
  to `PlayerView`/`extractPlayerView` so MP clients receive the tech view (the
  server swaps `world.playerNation` per client, same as `playerBudget`).
- Save compatibility: all new `Nation`/`World` fields optional with `??` fallbacks;
  legacy tech keys preserved; no `SAVE_VERSION` bump needed.
