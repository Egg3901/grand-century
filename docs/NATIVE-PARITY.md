# Native feature parity checklist

The mobile release target is web feature parity. Implementation coverage and release verification are separate: a row is complete only after its action, state display, offline behavior where applicable, and touch flow work on both iOS and Android.

The native client uses the shared simulation, command protocol, content, serialization, alert derivation and multiplayer lobby client. React Native screens and native map renderers provide the presentation. Single player runs in a separate Hermes worker and requires no hosted game UI.

| Area | Web source | Native implementation | Verification |
| --- | --- | --- | --- |
| Nation selection and scenario start | `src/ui/MainMenu.tsx`, `src/data/generated.ts` | Registered playable and preview scenarios, historical/procedural roster, nation search, seed and autosave cadence | 1830 and 1936 start and restore checks |
| Political map and province selection | `src/map/GrandMap.tsx` | Snapshot ownership/colors, live borders, province selection and ledger | Simulator rendering plus touch harness; physical devices pending |
| All ten map modes | `src/map/GrandMap.tsx`, `src/store.ts` | Political, terrain, population, economy, military, diplomacy, unrest, ruling ideology, cores and culture; analytical modes use native 2D rendering | Layer explanations implemented; device comparison pending |
| Labels, units, routes, fronts and occupation | `src/map/GrandMap.tsx`, `src/ui/MapLegend.tsx` | Country/city labels; player-scoped army/fleet counters in 2D and 3D; visible-unit routes and occupation fronts in military 2D mode | Device movement and occupation walkthrough pending |
| Date, pause, five speeds, alerts, event feed | `src/ui/GameHud.tsx`, `src/ui/Outliner.tsx`, `src/ui/EventFeed.tsx` | Native clock controls, shared alerts with review/dismiss, pending events and choices; menus pause single player | Command/touch checks; long campaign pending |
| Budget, population, cultures, market, politics | `src/ui/panels/` | Tax/tariff orders, budget traces, needs/migration, culture policies/acceptance, stockpile orders, upper house/parties/reforms | Tax and stockpile effects verified with real worker; remaining actions need device walkthrough |
| Diplomacy, great powers, military, production, technology | `src/ui/panels/` | Relations/influence/CB/war goals, ranking/spheres, recruitment/general/mobilization, army/fleet orders and transport, factories, research/inventions | Factory cost/count, CB and confirmed declaration verified; combat/naval campaign pending |
| Colonization, formables, decisions, province detail | `src/ui/panels/` | Claims/progress/reach, unification requirements/action, decision eligibility/action, province resources/pops/defenses | All ledgers reachable; late campaign paths pending |
| Crisis, peace conference, events, campaign recap | `src/ui/panels/`, `src/ui/EventPopup.tsx`, `src/ui/CampaignRecap.tsx` | Crisis backing/pressure/backdown, peace term selection/white peace, event choices, chronicle and campaign completion | Peace conference reachable after declaration; seeded late campaign walkthrough pending |
| Number traces and tutorial | `src/ui/components/TraceTooltip.tsx`, `src/ui/TutorialCoach.tsx` | Tap disclosures and seven persistent lessons with direct practice navigation and replay | Budget disclosure checked; screen reader and tutorial walkthrough pending |
| Saves, autosave, load, content fingerprint | `src/worker/saveSlots.ts`, `src/sim/persistence.ts` | Immutable app-private checkpoints, two autosave recovery points per campaign, background pause/save, fingerprint validation | Both scenario save roundtrips and independent deletion; process termination/upgrade on devices pending |
| Multiplayer lobby, presence, chat, reconnect, invite | `src/ui/Lobby.tsx`, `src/net/` | Shared protocol/client, native create/join/nation/team/ready/start, presence/chat, bounded reconnect, native invitation deep link and Share | Native host plus shared web guest verified against isolated real server, including same-seat reconnect and two-way chat; OS invitation/background checks pending |
| Audio and preferences | `src/ui/AudioManager.tsx`, `src/store.ts` | Bundled ambient/event tones, persistent mute, app-state pause, existing graphics/atmosphere preferences | Native compilation plus device listening/lifecycle pending |

## Automated evidence

`tests/native-graphics/parity.spec.ts` drives the native presentation with the real simulation worker and checks economy, construction, diplomatic commands, scenario restoration, and shared-engine snapshot equality. Its map, storage and audio platform adapters run in Chromium; this is not physical-device evidence.

`tests/native-graphics/multiplayer.spec.ts` hosts an isolated session server and connects the native screen and the same `LobbyClient` used by web. It verifies seat selection/start, server-authoritative tax orders, invitation generation, chat in both directions and interruption/reconnect without losing the nation.

The iOS simulator gate calls `verifyNativeCampaignStorage` in the real Hermes worker and Expo file system. It compares a fixed command log with the shared engine for both 1830 and 1936, restores complete snapshots and verifies deletion isolation. Existing GPU readbacks still gate native terrain rendering. CI also compiles the bundled Android release app and retains its APK for device verification. CI must pass before merge.

## Remaining release gates

- Play a full campaign on iOS and Android with networking disabled, including reforms, culture changes, colonies, formations, crises, peace, decisions, event choices and end-of-campaign recap.
- Force-terminate, relaunch and resume checkpoints; verify upgrade and incompatible-data recovery.
- Walk invalid actions and their explanations with touch input.
- Test mobile/web multiplayer on devices, including OS-delivered invitations, co-op, backgrounding and reconnect expiry.
- Profile frame time, simulation throughput, memory, startup, save time and battery on midrange devices.
- Verify phone/tablet layouts, text scaling, accessibility labels and screen reader navigation.
- Listen to audio and verify mute, silent mode and app lifecycle on both platforms.

These gates remain required before declaring complete web/native parity.
