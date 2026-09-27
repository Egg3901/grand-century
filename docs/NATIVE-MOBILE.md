# Grand Century native mobile migration

Status: proposed implementation path. Product scope awaits owner decisions on offline single player and first release depth.

## Goal

Ship iOS and Android apps with native screens, native gestures, and a native map renderer. The app must not contain a WebView, embedded browser, or hosted game UI. Keep the deterministic simulation and content as the shared game rules.

## Current seams

- `src/sim`, `src/data`, and `src/shared/types.ts` contain the game rules and protocol. The simulation owns mutable `World`; screens consume `WorldSnapshot` and send `Command` values.
- `src/net/transport.ts` already gives the UI a small transport interface. The browser uses `WorkerTransport` for single player and `SocketTransport` for multiplayer.
- `src/worker/sim.worker.ts` owns the single-player clock, autosave cadence, and command routing, but assumes browser Worker globals. `src/worker/saveSlots.ts` uses IndexedDB.
- `src/ui`, `src/map`, `src/main.tsx`, and CSS are browser presentation code. The map uses MapLibre GL JS and browser DOM markers. They require native replacements.
- Save serialization in `src/sim/persistence.ts` is independent of IndexedDB. Keep its format and fingerprint validation across clients.

## Proposed structure

```
packages/game-core/          simulation, data, protocol, serialization
apps/web/                    existing browser UI and worker adapters
apps/mobile/                 React Native app, iOS and Android projects
apps/mobile/native/          platform-specific sim runner if profiling requires it
```

Move code only as the mobile app consumes it. A bulk relocation before the first playable build would create unnecessary import churn. Initially, `apps/mobile` can import the current core paths through an explicit workspace package. Keep the existing web build running throughout the migration.

The mobile app uses React Native views for navigation, sheets, controls, charts, and forms. Use MapLibre Native through its React Native integration for the political map. Build a native map style from the existing province geometry, then add labels, borders, occupation, fronts, and unit symbols in measured stages. The existing MapLibre GL JS source and DOM markers cannot be reused as views.

### Simulation runner

Keep the `ToWorker` / `FromWorker` message contract as the external interface. Implement a mobile local transport that runs the simulation off the UI thread. Do not substitute a timer on the React Native JavaScript thread: the current simulation can take milliseconds per province-year, and map interactions must remain responsive. First validate a native background JavaScript runtime with the real seed, snapshots, commands, and save payload. If its runtime or memory profile fails, use a native module or a port of the simulation runner. The engine rules must produce the same results for the same seed and command log on web and mobile.

Mobile save storage is an adapter for the existing compressed save bytes. Use app-private files, an atomic write, and a small indexed slot manifest. Save when the app enters the background, and restore the same slot after process termination. The game clock pauses when the app is inactive; no background world ticking is required.

For multiplayer, implement a mobile socket transport against the existing session protocol and reconnect semantics. Keep server authority. Mobile deep links carry invitations and session joins rather than browser hash routes.

## First playable slice

1. Build a native app that starts on both platforms, loads bundled world data, selects a nation, and opens a political map.
2. Run the real 1830 simulation off the UI thread. Show date, speed, treasury, selected province, and one command that changes state. Measure frame time, memory, and time to first playable interaction on midrange devices.
3. Save, force-terminate, relaunch, and resume the same world. Verify the content fingerprint and the game state after restoration.
4. Add the mobile game loop: budget, politics, diplomacy, military, war, events, research, and explainable numbers as touch-first screens. Prioritize the command paths needed to play a full campaign before porting every web panel.
5. Add multiplayer, chat, invitations, accessibility, tablet layouts, device QA, store assets, and release packaging according to the agreed first-release scope.

## Acceptance gates

- No WebView or browser-hosted game content in the mobile binary.
- Identical simulation result for a recorded seed and command log across web and mobile.
- Map pan, zoom, selection, and sheet interactions stay responsive while the world advances.
- Saving survives app termination and upgrade; incompatible world data is rejected with a clear recovery path.
- A complete single-player campaign can be played using touch controls at the agreed release scope.
- iOS and Android are tested on physical devices before release. This Linux host can build and test Android; iOS compilation and signing need macOS or a cloud macOS build runner.

## Decisions needed

1. Must single player work fully offline, including simulation and saves? Recommended: yes.
2. Should the first store release cover the complete current web feature set, or a smaller complete game loop with later additions? Recommended: the smaller complete loop.
3. Is the existing browser game maintained in parallel during migration? Recommended: yes until native parity is verified.
