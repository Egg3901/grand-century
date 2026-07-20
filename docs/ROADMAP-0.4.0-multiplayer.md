# Grand Century — 0.4.0 Multiplayer (master doc)

Status: PLANNED · Build AFTER 0.3.0 ships (user chose: finish 0.3.0 first). This
doc locks the design so 0.4.0 can be executed directly.

## 0.4.0 has TWO tracks (per user, 2026-07-20)
1. **Multiplayer** (this doc) — session-based live MP.
2. **UI aesthetic overhaul** — the current UI reads "chintzy/weak" on mobile and
   desktop; make it feel premium and cohesive. This track ALSO absorbs the map
   **label** work (labels currently don't render) — proper, well-placed, legible
   labels are part of the visual redesign, not another one-off patch. Scope:
   a coherent design system (type scale, spacing, panel chrome, color, iconography),
   restyle HUD + panels + menus + event popups, polished map labels (pole-of-
   inaccessibility placement, self-hosted serif), consistent light/dark parchment
   theming, and mobile parity. Lower infra risk than MP; directly addresses live
   feedback — a sensible thing to ship FIRST.

## Locked decisions
- **Model: BOTH competitive and co-op**, chosen per-session in the lobby (free-for-all
  = one nation each; teams/co-op = shared or allied nations vs AI).
- **Scale: small private lobbies, 2–8 players**, invite-link, ephemeral sessions on the
  Hetzner box. No large/persistent-server infra in 0.4.0.
- **Single-player is unchanged and stays offline** (local Web Worker). Multiplayer is an
  ADDED mode; same game code, different transport.

## Why this is a small pivot, not a rewrite
The sim is already **deterministic** (seeded RNG) and **command-driven**: every player
action is a `Command`; the UI only reads read-only `WorldSnapshot`s over the
`ToWorker`/`FromWorker` protocol. The worker is pure TS with no DOM. So we can run the
SAME sim in Node and swap the transport. The contract in `src/shared/types.ts` is
already the network protocol.

## Architecture: server-authoritative sessions
```
Single-player (unchanged):   UI ⇄ local Web Worker (sim)
Multiplayer (new):           UI ⇄ WebSocket ⇄ Session Server (Node, runs the sim)
                                                   ├─ session A (one sim instance)
                                                   ├─ session B ...
```
- **Session server** (new `server/` package): Node + `ws`. Imports the existing
  `src/sim` unchanged, runs one sim instance per session at a server-authoritative
  fixed timestep. Receives `Command`s from clients, validates them (a client may only
  command its own nation), applies them, broadcasts `WorldSnapshot`s to the session.
- **Transport abstraction** (client): a `SimTransport` interface with two
  implementations — `WorkerTransport` (today's local worker) and `SocketTransport`
  (WebSocket). `src/store.ts` talks to a transport, not a worker directly. This is the
  main client refactor and it's small.
- **Server authority**: the server owns the clock. Speed/pause is controlled by the
  **lobby leader** (real-time-with-pause needs one authority); other players can
  request pause. Commands are applied on the server tick they arrive (or a small
  scheduled delay) so all clients see identical state from the broadcast.
- **Bandwidth**: 1450-province snapshots are the cost driver. Send **snapshot diffs**
  (only changed province summaries / nation lines) after the initial full snapshot;
  the client already keeps the last snapshot in the store. Compress (the app already
  bundles fflate).
- **Determinism** stays the safety net: the server is authoritative, but determinism
  means we can also checksum state across a reconnect/resync cheaply.

## Sessions, lobbies, modes
- **Lobby**: create → get an invite link (`/games/grand-century/#/join/<sessionId>`);
  players join, pick/lock a nation (competitive) or a team (co-op); leader sets seed,
  map options, mode, and starts.
- **Nation assignment**: competitive = one player per nation, rest AI; co-op = players
  share a nation or form a human team, rest AI. Unclaimed nations run on AI.
- **In-game**: each client only sees its own nation's detail panels; the map + public
  info are shared. A minimal presence/chat + "player X is at war with player Y" feed.
- **Reconnection (basic)**: on drop, rejoin the session and get a fresh full snapshot;
  the nation is held for a grace period. No long-term persistence in 0.4.0 (ephemeral).

## Infrastructure (Hetzner + Caddy)
- New `grand-century-server` systemd service (Node) on a local port.
- Caddy: a WebSocket route under `lakesidegames.net/games/grand-century/ws` →
  the server port (reverse_proxy handles WS upgrade). Static client unchanged.
- Sessions are in-memory + ephemeral; a session GCs when empty.

## 0.4.0 milestones
1. **M-MP0 Transport abstraction** — extract `SimTransport`; refactor store to use it;
   SP still works via `WorkerTransport`. No behavior change. (Pure refactor, fully
   testable offline.)
2. **M-MP1 Session server** — Node `ws` server running the sim per session; a
   `SocketTransport` client; a dev harness proving two browser tabs share one world.
3. **M-MP2 Lobby & invite links** — create/join lobby UI, nation/team selection, leader
   controls, start flow.
4. **M-MP3 Modes** — competitive (one nation each) + co-op (teams), per-nation command
   validation, per-client fog on private panels.
5. **M-MP4 Speed authority + snapshot diffs** — leader-controlled clock, pause requests,
   diffed/compressed snapshots for bandwidth.
6. **M-MP5 Reconnection + presence/chat + polish** — rejoin grace, presence feed, basic
   chat, deploy the server on Hetzner behind Caddy, load-test 8 players.

## Risks & mitigations
- **Bandwidth of large snapshots** → diff + compress; cap snapshot rate (e.g. 2–4/s in
  MP vs per-frame in SP); provinces rarely change, so diffs are tiny.
- **Determinism drift** → server is authoritative (clients render snapshots, don't run
  the sim), so drift can't desync; determinism is used for cheap resync checksums.
- **Command security** → server validates every command against the sender's nation.
- **Pause griefing** → leader authority + pause-request; kick/transfer-leader.
- **Sim in Node** → sim is already DOM-free; add a CI job that runs the sim under Node
  to guarantee it stays server-runnable.

## Definition of done for 0.4.0
2–8 friends open an invite link, pick nations (or teams), and play one shared 1836
world live — declaring wars and doing diplomacy against each other — with a
leader-controlled clock, on lakesidegames.net, while single-player stays exactly as
it is today.
