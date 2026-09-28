# Grand Century native mobile migration

Status: implementation started. Owner decisions: fully offline single player and web feature parity for the first playable mobile release.

The explicit release checklist is in [NATIVE-PARITY.md](./NATIVE-PARITY.md).

## Current implementation slice

`apps/mobile` is an Expo development-build app with React Native screens, MapLibre Native, a bundled 1830 political atlas, and a separate Hermes simulation worker. The worker currently handles new games, the real tick, commands, snapshots, and detail requests. The UI currently exposes nation selection, political and terrain map views, animated offline water lines, major-power map labels, province selection, key national stats, and speed controls. Terrain rendering uses province terrain categories, small local textures, and a bundled, reduced Natural Earth shaded-relief raster clipped to the game map. The native save adapter, map updates from snapshots, remaining screens, other scenarios, and multiplayer are still required. This is an integration slice, not a playable parity build.

The political atlas adjusts adjacent nation colors for contrast. Major-power map labels are offline image symbols with deliberate home-region anchors. Labels hide while the camera moves. After the move, the app projects their anchors into screen coordinates and shows a symbol only when its full rendered image fits between the map HUD and province controls. The campaign header says which nation the player controls; the stat rows use full labels. An owned province exposes the existing recruit command as its first native action.

Run `npm run mobile:atlas` after changing generated map data. `npm run mobile:start` syncs the atlas and starts Metro. The MapLibre and worker native modules require a development build, so Expo Go cannot run this app. `npm run mobile:export:android` checks the JavaScript bundle; `npm run mobile:assemble:android` builds the generated Android project after `expo prebuild --platform android` and local Android SDK setup.

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
4. Port every current web game system and command path to touch-first screens: budget, population, cultures, market, politics, diplomacy, great powers, military, production, technology, province detail, colonization, saves, formables, decisions, events, and campaign recap.
5. Add all web map modes, multiplayer, chat, invitations, tutorial, accessibility, tablet layouts, device QA, store assets, and release packaging before declaring feature parity.

## Acceptance gates

- No game screen is rendered in a WebView, and no hosted game content is required for offline play.
- Identical simulation result for a recorded seed and command log across web and mobile.
- Map pan, zoom, selection, and sheet interactions stay responsive while the world advances.
- Saving survives app termination and upgrade; incompatible world data is rejected with a clear recovery path.
- A complete single-player campaign and the current multiplayer flow can be played using touch controls with every web feature reachable.
- iOS and Android are tested on physical devices before release. This Linux host can build and test Android; iOS compilation and signing need macOS or a cloud macOS build runner.

## Remaining product decision

Maintain the browser game during migration until native parity is verified. This is the working assumption because the current site is live.
