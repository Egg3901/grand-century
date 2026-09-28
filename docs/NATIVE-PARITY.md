# Native feature parity checklist

The mobile release target is web feature parity. This file is the release gate, not a list of optional follow-ups. A row is complete only after its action, state display, offline behavior where applicable, and touch flow work on both iOS and Android.

| Area | Web source | Native state |
| --- | --- | --- |
| Nation selection and scenario start | `src/ui/MainMenu.tsx`, `src/data/generated.ts` | Nation atlas preview only; scenario selection pending |
| Political map and province selection | `src/map/GrandMap.tsx` | Initial native political map and province selection; live ownership pending |
| Terrain, population, economy, military, diplomatic map modes | `src/map/GrandMap.tsx`, `src/store.ts` | Pending |
| Unrest, ruling ideology, cores, culture map modes | `src/map/GrandMap.tsx`, `src/store.ts` | Pending |
| Map labels, armies, fleets, fronts, occupation, legend | `src/map/GrandMap.tsx`, `src/ui/MapLegend.tsx` | Pending |
| Date, pause, five speeds, alerts, event feed | `src/ui/GameHud.tsx`, `src/ui/Outliner.tsx`, `src/ui/EventFeed.tsx` | Date and play/pause integration slice; remaining flows pending |
| Budget, population, cultures, market, politics | `src/ui/panels/` | Pending |
| Diplomacy, great powers, military, production, technology | `src/ui/panels/` | Pending |
| Colonization, formables, decisions, province detail | `src/ui/panels/` | Province name and terrain preview only; remaining flows pending |
| Crisis, peace conference, events, campaign recap | `src/ui/panels/`, `src/ui/EventPopup.tsx`, `src/ui/CampaignRecap.tsx` | Pending |
| Tooltip number traces and tutorial | `src/ui/components/TraceTooltip.tsx`, `src/ui/TutorialCoach.tsx` | Pending; use tap disclosures rather than hover |
| Save slots, autosave, load, content fingerprint | `src/worker/saveSlots.ts`, `src/sim/persistence.ts` | Pending native file adapter |
| Multiplayer lobby, presence, chat, reconnect, invite | `src/ui/Lobby.tsx`, `src/net/` | Pending mobile socket and deep links |
| Audio and preferences | `src/ui/AudioManager.tsx`, `src/store.ts` | Pending |

## Release verification

- Compare a fixed seed and command log with the web engine for every supported scenario.
- Play a full campaign on iOS and Android with network access disabled; force-terminate and resume a saved game.
- Walk every panel and every command path with touch input, including invalid actions and explanations.
- Run a multiplayer session between mobile and web with disconnect, reconnect, chat, and invitation tests.
- Profile map frame time, simulation throughput, memory, startup, save time, and battery on midrange devices.
- Verify phone and tablet layouts, accessibility labels, text scaling, and screen reader navigation.
