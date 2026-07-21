# Roadmap 0.7.0 — "The Concert of Europe"

**Headline system: Great-power crisis diplomacy — world tension, flashpoint crises,
congresses, and great wars.**

## Theme

1820–1920 is the century of the Concert of Europe: great powers meeting in congress
(Vienna, Berlin ×2, Paris), managing flashpoints (the Eastern Question, the scrambles,
the Moroccan crises), and finally failing in July 1914. Version 0.7.0 makes that the
game's headline drama: the world accumulates **tension**, tension ignites **crises**
over concrete flashpoints, great powers **take sides**, and each crisis ends either at
the **congress table** (prestige swings, spheres redrawn — war averted) or as a
**bloc-vs-bloc great war**. The existing diplomacy layer (opinions, CBs, infamy,
influence, spheres, coalitions) becomes the *input* to a visible geopolitical
storyline instead of a set of disconnected dials.

## Why this over the alternatives (steelman)

**The case for Culture/Nationalism instead:** pops already carry `culture`/`religion`
fields, `politics.ts` even has a dormant independence-rebellion path keyed on minority
cultures (`dominantMinorityCultureInState`), and nationalism is *the* other defining
force of the era. It would deepen the interior game the way crises deepen the exterior
game.

**Why it loses this cycle:**

1. **The seed has no minorities.** `bootstrap.ts` `createPops()` gives every pop its
   nation's primary culture, and the culture table itself is 8 coarse entries (Spain is
   seeded "french" culture, Mexico "yankee"). A credible nationalism system needs a
   minority-seeding + culture-table content pass *before* any mechanics show up — most
   of the milestone would be data plumbing with little visible play value, and it
   would sit right on top of the pop hot loops the tech/economy agent is currently
   balancing (assimilation and unrest push directly on `needsMet`/`militancy`, the
   exact variables the balance envelope guards).
2. **Diplomacy has the opposite profile:** a deep, battle-tested substrate
   (`diplomacy.ts` already computes power scores, influence contests, coalitions,
   alliance blocs; `war.ts` already enforces every war-goal type) whose pieces just
   never talk to each other in a legible way. The AI silently spheres nations and
   fights bilateral wars, but nothing ever *comes to a head*. One new system closes
   that loop and produces the game's missing climaxes — including the emergent
   "great war" that a war-first Vic2-like needs and currently cannot produce.
3. **Risk containment.** Crises live beside the economy (prestige, spheres, wars),
   not inside it, so the balance envelope the other agent is tuning stays untouched
   except through war frequency — which the crisis system explicitly vents and caps
   (one crisis at a time, cooldowns, most crises resolve at congress).

**Do-nothing counterfactual:** 0.6.0 shipped a technology tree; without a headline
*gameplay* system, 0.7.0 would be a polish release. The mid-game (no rebellion, no
war) is currently flat: you slide taxes and wait for research. Crises give the
mid-game a pulse on a ~2–4 year cadence.

**How to decide it worked:** in a 60-year AI-only run, 8–20 crises fire; ≥60% resolve
at congress (peacefully); at least one bloc war with 3+ GPs per side occurs; balance
envelope (`tests/m6.balance.test.ts`) stays green.

## The 0.7.0 slice (SHIPPED in this branch)

1. **World Tension (0–100)** — recomputed monthly from observable causes: GP wars,
   nations over the infamy limit, GP rivalries, contested influence targets, active
   crisis. Decays toward calm. Surfaced with a full trace tooltip.
2. **Flashpoint crises** — when tension is high, one crisis (world-singleton, like
   Vic2 HoD) spawns from a concrete flashpoint, deterministically scored:
   - **Sphere contest** — two GPs both hold heavy influence over the same minor
     (`add_to_sphere` demand);
   - **Containment** — a nation is over the infamy limit and a coalition exists
     (`cut_down_to_size` demand);
   - **Humiliation** — a GP rivalry has curdled below −70 opinion (`humiliate`).
3. **Taking sides & escalation** — every GP is invited; AI joins by opinion,
   alliances, rivalry, and sphere interest. Temperature rises monthly; leads may
   *press the demand* (escalate) or *back down* (concede). AI leads back down when
   clearly outmatched — unless it's the player's call.
4. **Resolution** — at 100° or the deadline: lopsided bloc strength ⇒ the weak lead
   backs down and a named **Congress** convenes (demand enforced peacefully via the
   existing `applyWarGoal`, big prestige swing, tension vents). Balanced blocs that
   both press ⇒ **crisis war** between the full blocs, with the crisis demand and a
   reciprocal humiliation goal, fought and peaced out by the existing war machinery.
5. **Concert panel** — tension meter with trace, live crisis card (sides, leads,
   temperature, deadline, stakes) with Back Attacker / Back Defender / Press Demand /
   Back Down commands, and a congress history ledger. Lives inside the Great Powers
   panel (registered in `PanelHost.tsx`).

### Hooks into existing systems (files)

| Hook | File |
|---|---|
| Tension inputs: infamy, coalitions, rivalries, influence contests | `src/sim/systems/diplomacy.ts` (`getInfluencePressureForTarget`, `getCoalitionAgainst`, `getInfamyLimit`, relations) |
| Bloc strength for showdown/back-down | `src/sim/systems/diplomacy.ts` `getNationPowerBreakdown` (same scores as GP ranking) |
| Peaceful enforcement of crisis demands | `src/sim/systems/war.ts` `applyWarGoal` (exported in 0.7.0) |
| Crisis war creation & resolution | existing `World.wars` + `runWarDaily`/auto-peace in `src/sim/systems/war.ts`; AI peace via `src/sim/systems/ai.ts` |
| Prestige swings feed GP ranking | `src/sim/systems/diplomacy.ts` `computePowerScores` (score = industry+military+prestige) |
| Sphere transfers | existing `Nation.spheredBy`/`sphereMembers` invariants (`refreshGreatPowerRanking`) |
| Tick cadence | `src/sim/world.ts` monthly block (`runCrisisMonthly`) |
| State & saves | plain data on `World` (`tension`, `crisis`, `congresses`), self-healing defaults for old saves in `src/sim/systems/crisis.ts` `ensureCrisisState` |
| Player agency | 3 new `Command`s in `src/shared/types.ts`, handled in `src/sim/commands.ts` |
| UI | `src/ui/panels/CrisisPanel.tsx`, registered in `src/ui/panels/PanelHost.tsx` under Great Powers |

## Milestones beyond the slice

| # | Milestone | Content |
|---|---|---|
| C1 | **Shipped slice** (this branch) | Tension, 3 flashpoint types, sides/escalation, congress vs bloc-war resolution, Concert panel, tests. |
| C2 | **Ultimatums & guarantees that bite** | Direct ultimatum command (demand w/o crisis, backed by tension cost); guarantees auto-pull guarantors into crisis defense; alliance calls become refusable with opinion/prestige fallout. |
| C3 | **Congress table** | Multi-demand congresses: winner picks from a menu (sphere transfer, demilitarize state, war reparations), losers get consolation; "host the congress" prestige play for neutral GPs. |
| C4 | **Liberation flashpoints** | Crisis type keyed to occupied cores / formable candidates (`nationCores` in `src/data/gameData.ts`) — "free the X" crises that can create nations, bridging toward the nationalism system. |
| C5 | **The Great War arc** | Late-game tension floor rises with tech era; interlocking alliance webs make back-downs costlier (prestige scaling with past congresses lost), so ~1900+ crises trend toward the general war; war-weariness aftermath. |

## Non-goals for 0.7.0

Trade/markets (owned by the economy/tech track), naval arms-race scoring, player-to-AI
ultimatum spam protection beyond cooldowns, multi-crisis concurrency.
