# The simulation loop

`advanceDay` in `src/sim/world.ts` is the heart of the simulation. The worker
calls it N times per animation frame depending on speed, then builds a snapshot.

```ts
export function advanceDay(world: World, data: GameData): void
```

It increments the day, constructs an `Rng` from `world.rngState`, dispatches the
systems due on this day, and writes the RNG state back. Every system mutates
`World` in place.

## Cadence dispatch

Three cadences, checked in order:

- **Daily** — every call.
- **Weekly** — `world.day % 7 === 0`.
- **Monthly** — `dayToDate(world.day).day === 1`.
- **Yearly** — `world.day % 365 === 0`, for the chronicle only.

## Ordering within a cadence is load-bearing

The order systems run in is not alphabetical or arbitrary, and changing it
changes behaviour. The non-obvious constraints:

**Weekly.** `settleProductionWeekly` runs *after* the buyers
(`runPopsWeekly`, `runStockpileOrders`) and before `runMarketWeekly`. Production
registers supply and records what it would earn; settlement then scales each
claim by the fraction that actually sold and only then moves money.

Moving settlement earlier reintroduces the money fountain this ordering exists to
fix: paying producers in full at production time created money for goods nobody
bought. Measured at seed 6602, the market paid producers 7.5× what buyers spent by
1825. The legacy behaviour is still reachable via the `fcfs` clearing mode in
`src/sim/balance.ts`, under which `settleProductionWeekly` is a no-op.

`beginMarketWeek` must run first to clear the previous week's runtime
accumulators, and `runMarketWeekly` must run last because it is the price move
that reads the whole week's flows.

**Monthly.** `runCultureMonthly` runs *before* `runPoliticsMonthly` because the
militancy and consciousness it generates are inputs to political unrest.
`runBudgetMonthly` runs first so the rest of the month acts on a settled treasury.
`runAiMonthly` runs last so the AI decides against a finished world.

Within politics itself there is a second ordering constraint: suppression is
applied, and then unrest is recomputed from the post-suppression pop state.

## System signature

```ts
(world: World, data: GameData, rng: Rng) => void
```

Uniform by convention even where a system needs no randomness. `runCultureMonthly`
and several others accept `rng` and ignore it; keeping the signature identical
means the dispatch site does not special-case anything.

## The calendar

`dayToDate` converts a day index to `{ year, month, day }`. The epoch is 1830,
months use fixed lengths, and leap years are ignored — a year is always 365 days.

This function runs several times per simulated day. It computes the year
arithmetically rather than looping over elapsed years; the loop version was
O(century) by the late game and showed up in profiles.

## Determinism

The `Rng` is constructed from `world.rngState` at the top of `advanceDay` and its
state written back at the bottom. Any system that consumes randomness advances
that shared stream, which means **adding or removing an rng call in one system
changes the random sequence every later system sees**.

That is fine within a release, but it means a change to, say, event selection can
shift war outcomes in an existing save. Do not treat rng consumption as a local
concern.

Never call `Math.random()` in sim code.

## Adding a system

1. Add `src/sim/systems/<name>.ts` exporting a function with the standard
   signature.
2. Import it in `src/sim/world.ts` and call it from the correct cadence block,
   in a position justified against the ordering constraints above.
3. Put tuning constants in `src/sim/balance.ts`, not inline.
4. If it adds state to `World`, make it self-healing for older saves — the
   pattern is an `ensureXState(world)` call, as in `ensureCrisisState` and
   `ensureCultureState`.

## See also

- [Architecture](architecture.md) — the sim/UI boundary and file map
- [Snapshots and the protocol](snapshots-and-protocol.md) — what happens after the tick
- [Time and the tick](../systems/time-and-the-tick.md) — the player-facing view
