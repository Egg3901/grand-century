# 0.8.0 — The Age of Nationalism (culture / religion / national identity)

**Theme:** 1820–1920 is the century in which peoples discovered they were nations.
Grand Century's world is currently culturally flat — every province seeds pops of the
owner's primary culture, so empires have no internal fault lines. 0.8.0 makes
**national identity a simulated force**: multi-cultural empires (Austria, Russia, the
Ottomans, Britain-in-India) carry real minority populations that either **assimilate**
into the state-nation or **awaken** into national movements that demand — and can win —
a nation-state of their own.

Design compass (Vic2 heritage, our simplifications):

| Vic2 concept | 0.8.0 shape |
|---|---|
| Culture / accepted culture | Kept as-is (`Pop.culture`, `Nation.acceptedCultures`) but finally *populated* and *consequential* |
| Assimilation | Monthly per-pop flow toward the primary culture, driven by local majority share, literacy, policy, and resisted by national movements |
| Militancy from non-acceptance | Non-accepted pops accrue extra militancy/consciousness (policy-scaled); soldiers already only recruit from accepted cultures |
| Rebel "nationalist" faction | `NationalMovement` per (nation, culture): radicalism 0–100 that can trigger an **independence rebellion** through the *existing* rebellion machinery (war.ts enforcement, BALANCE.rebellion caps/cooldowns) |
| National Value / citizenship policy | One nation-level **culture policy** lever: `exclusionary` / `assimilationist` / `pluralist` + per-culture **grant/revoke acceptance** |

## Milestones

### C1 — Cultural geography (this slice, SHIPPED)
- Culture table grows 8 → 32 (Irish, Polish, Hungarian, Czech, Italian, South Slavic,
  Greek, Romanian, Ukrainian, Baltic, Finnish, Caucasian, Central Asian, Arabic,
  Persian, South Asian, Malay, Iberian, Latin American, Scandinavian, African,
  Japanese, Korean, Indochinese …), each with a typical religion; religions grow 5 → 7
  (+ Hindu, Buddhist). Historic primary-culture fixes (Spain is no longer "French").
- Bootstrap seeds **minorities by named historical region** (Ireland under Britain,
  Congress Poland / Finland / the Baltics / Ukraine / the Caucasus under Russia, the
  Balkans and Arab vilayets under the Ottomans, Hungary / Bohemia / Croatia /
  Lombardy-Venetia under Austria, India under Britain, the Indies under the
  Netherlands, …) plus light generic border blending between neighbouring nations.
- Elite pops (aristocrats, clergy) take the *local* majority culture — Hungarian
  magnates, not German ones.

### C2 — Assimilation & the melting pot (this slice, SHIPPED)
- `runCultureMonthly` (new `src/sim/systems/culture.ts`, one hook in `world.ts`):
  non-accepted pops assimilate toward the primary culture at a rate driven by local
  primary-culture share (isolated diasporas melt, solid homelands persist), national
  literacy, culture policy, and religious distance; national movements harden identity
  and stall assimilation.
- Non-accepted pops accrue militancy + consciousness monthly (policy-scaled, small
  enough that a well-fed, reformed nation stays quiet — the balance envelope stays
  green).

### C3 — National awakening & separatism (this slice, SHIPPED)
- `NationalMovement` per (nation, non-accepted culture) forms once the culture is a
  meaningful share of the nation and conscious enough; **radicalism** rises with
  consciousness, militancy, literacy and exclusionary policy, falls with contentment,
  pluralism and acceptance.
- At high radicalism + high militancy, the movement launches an **independence
  rebellion** for its heartland states (demand `{type:'independence', culture,
  stateIds}`), spawned under the same `BALANCE.rebellion` world/nation caps, state
  cooldowns and army caps as reform revolts; enforcement flows through the existing
  war.ts machinery (`createIndependentRebelNation` — the new state's primary culture
  is the movement's culture).
- Player levers (commands): `setCulturePolicy`, `setCultureAccepted` (grant costs
  prestige and calms the minority + movement; revoke enrages).

### C4 — UI: the Cultures ledger (this slice, SHIPPED)
- New `CulturePanel` (rendered with the Population panel via PanelHost): culture
  ledger (size, share, accepted, militancy, assimilation last month), policy selector,
  accept/revoke buttons, national-movement list with radicalism bars.
- Province dossier shows the cultural makeup of the selected province.

### C5 — Later (not in this slice)
- **Culture map mode** (needs `store.ts` MapMode + map paint — other agents own those
  files this cycle).
- **Religion as its own axis**: conversion, clergy influence, religious-policy lever.
- **Cores ↔ culture**: cultural cores for released nations; irredentism CBs
  (Greater X wants its culture's provinces back); unification movements (Germany/Italy
  formables driven by movements instead of player-only).
- **Colonial identity**: settler vs indigenous pops, colonial militancy discount,
  Dixie/USA sectional crisis, national focus to encourage assimilation.
- **AI policy**: AI grants acceptance / shifts culture policy under movement pressure.
- **Political voice**: non-accepted pops vote with reduced franchise weight (touches
  the election pass in `politics.ts`, which the perf agent owns this cycle — do it
  next cycle).

## Hooks & invariants
- Sim-only, deterministic (all randomness via threaded `Rng`), DOM-free, MP-safe.
- All new `World`/`Nation` fields optional — pre-0.8.0 saves self-heal in
  `ensureCultureState` (mirrors the 0.7.0 crisis pattern).
- Rebellion pressure obeys `BALANCE.rebellion` caps: world cap 8, per-nation cap 2,
  900-day state cooldown, rebel-army world cap 32 — nationalism cannot spawn endless
  rebellions.
- Tests: `tests/e8.culture.test.ts` (seeding, assimilation convergence & conservation,
  non-accepted unrest differential, movement formation → uprising, acceptance relief,
  determinism, long-run stability/no-NaN) + the existing balance envelope
  (`npm run test:balance`) must stay green.
