# Architecture rules (READ FIRST, every session)

This is the contract every contributor — human or agent — builds against. `docs/MASTER.md` is the game design; this file is the code law.

## The one hard boundary
- **`src/sim/**` and `src/worker/**` are pure logic.** No DOM, no React, no `window`, no imports from `src/ui` or `src/map`. They may import only from `src/shared`, `src/sim`, `src/data`.
- **`src/ui/**` and `src/map/**` only READ.** They render the latest `WorldSnapshot` and dispatch `Command`s. They never mutate world state.
- The two sides communicate ONLY through the message protocol in `src/shared/types.ts` (`ToWorker` / `FromWorker`).

## Source of truth
- `src/shared/types.ts` is the domain contract. Change it deliberately; both sides depend on it.
- The sim owns the mutable `World`. The UI owns `useStore` (Zustand) which holds the read-only snapshot + pure UI state.

## Determinism
- All randomness goes through `src/sim/rng.ts` (seeded mulberry32) threaded via `world.rngState`. **Never `Math.random()` in sim code.** This keeps saves/replays reproducible.

## Tick model (see `src/sim/world.ts`)
- `advanceDay` runs daily systems every day, weekly on `day % 7 === 0`, monthly on the 1st.
- Systems live in `src/sim/systems/*.ts`, each a function `(world, data, rng) => void`.

## Performance
- Snapshots are compact summaries, not the whole world. Detailed views (a province's pops) are pulled on demand via `requestProvince`/`requestNation`.
- Keep hot loops allocation-light. Province cap 300–700 (consolidated real admin-1 units).

## Verification gate (must pass before a milestone is committed)
1. `npm run build` — typechecks + bundles clean.
2. `npm run test` — vitest green (sim unit tests).
3. `npm run dev` boots; the acceptance criterion in the milestone row of `docs/MASTER.md` §9 is met.

## File map
```
src/shared/types.ts   domain contract (data + protocol + commands)
src/sim/rng.ts        seeded PRNG
src/sim/world.ts      tick loop + cadence dispatch
src/sim/bootstrap.ts  createWorld(data, seed) -> initial World
src/sim/commands.ts   applyCommand(world, data, cmd, post)
src/sim/snapshot.ts   buildSnapshot(world, data) -> WorldSnapshot
src/sim/detail.ts     detailProvince / detailNation (on-demand views)
src/sim/systems/*.ts  market, economy, pops, politics, diplomacy, war, budget, ai, events, research
src/worker/sim.worker.ts   worker entry (message loop + fixed-timestep)
src/data/gameData.ts  baked static GameData
src/store.ts          Zustand UI store
src/map/*             MapLibre province map + paint + mapmodes
src/ui/*              React panels + HUD
```

## Aesthetic
Archival nineteenth-century atlas: aged parchment map, muted province fills, period display type, ornate but legible panel frames. Dark, readable panel text on parchment and leather surfaces.
