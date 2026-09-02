# Snapshots and the protocol

The simulation runs in a worker. The UI never touches `World` — it renders a
`WorldSnapshot` and dispatches `Command`s. This document covers what crosses that
boundary and when.

## The message protocol

`ToWorker` and `FromWorker` in `src/shared/types.ts` are the only channel between
the two sides. Both are plain data.

The worker entry, `src/worker/sim.worker.ts`, receives commands, runs a
fixed-timestep tick loop, and posts snapshots. It imports nothing from the DOM or
UI.

## Snapshot cadence

Posting a snapshot on every tick would flood the main thread. The rules:

- **Do not post while paused or unchanged.** A paused game costs nothing.
- **Post immediately when a command changes state.** The UI must feel responsive
  to input regardless of clock speed.
- **Cap the running cadence to ~8 Hz** regardless of tick speed. At high speed the
  sim may advance hundreds of days per second; the UI still updates 8 times.

The consequence for contributors: **a command that mutates state must mark a
snapshot pending**, or the change will not appear until the next scheduled post.

## Snapshots are summaries

`buildSnapshot` produces a compact summary, not a serialisation of the world. It
carries what the HUD and open panels need — nation summaries, province summaries,
market goods, budget lines, diplomatic standings, pending events.

It deliberately does **not** carry per-province pop lists or full ledgers. Those
are pulled on demand:

- `requestProvince` → `detailProvince`
- `requestNation` → `detailNation`

If you are adding a panel that needs data not in the snapshot, the default answer
is a detail request, not a bigger snapshot. Growing the snapshot costs every
player 8 times a second whether the panel is open or not.

## Multiplayer

`src/net/snapshotCodec.ts` implements snapshot splitting, diffing, applying and
gzip, and it is shared by the server and the client so there is exactly one
implementation. It works on the `WorldSnapshot` shapes already defined in
`shared/types.ts` and does not introduce its own.

The split matters because a multiplayer snapshot has a **shared** part every
client gets and a **player view** part that is per-nation. A client must not
receive another player's private state.

`src/net/` also holds the transports (`socketTransport`, `workerTransport`), the
session protocol, and the lobby client. `workerTransport` is what lets
single-player run the identical code path with the worker standing in for a
server.

## Saves

`src/sim/persistence.ts` provides `serializeWorld` and `deserializeWorld`.
`src/worker/saveSlots.ts` stores them in IndexedDB, keyed by slot, with the day
and player nation recorded for the slot list. The worker autosaves yearly.

Because the world is fully deterministic (see
[The simulation loop](simulation-loop.md)), a save is the world state plus the
RNG state, and reloading it resumes exactly.

**Systems that add state to `World` must be self-healing for older saves.** The
established pattern is an `ensureXState(world)` call at the top of the system —
see `ensureCrisisState` and `ensureCultureState`. A save made before your system
existed must still load.

## See also

- [Architecture](architecture.md) — the boundary this protocol enforces
- [The simulation loop](simulation-loop.md) — what runs between snapshots
