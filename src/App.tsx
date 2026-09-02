import './App.css';
import { Suspense, lazy, useMemo } from 'react';
import { MainMenu } from './ui/MainMenu';
import { LobbyScreen } from './ui/Lobby';
import { PermalinkBootstrap } from './ui/PermalinkBootstrap';
import { parseLobbyHash } from './net/mpJoin';
import { useStore } from './store';
import { useHasSnapshot } from './ui/useSnapshotFields';
import { DEFAULT_SCENARIO_ID } from './data/generated';

const LazyGrandMap = lazy(async () => {
  const module = await import('./map/GrandMap');
  return { default: module.GrandMap };
});

// The in-game HUD + all panels are the bulk of the UI code but aren't needed to
// paint the main menu, so they load in their own chunk off the first-paint path.
const LazyGameHud = lazy(() => import('./ui/GameHud'));

function App() {
  const hasSnapshot = useHasSnapshot();
  const data = useStore((state) => state.data);
  const scenarioId = useStore((state) => state.snapshot?.scenarioId ?? DEFAULT_SCENARIO_ID);
  const showMainMenu = useStore((state) => state.showMainMenu);
  const showLobby = useStore((state) => state.showLobby);
  const lobbyInvite = useMemo(() => parseLobbyHash(), []);

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="map-loading" />}>
        <LazyGrandMap key={scenarioId} />
      </Suspense>
      <div className={`hud-layer${showMainMenu ? ' hud-layer--backstage' : ''}`}>
        <Suspense fallback={null}>
          <LazyGameHud />
        </Suspense>
      </div>
      {!hasSnapshot || !data ? (
        <div className="loading-veil">
          <h1>Grand Century</h1>
          <p>Initializing simulation ledger...</p>
        </div>
      ) : null}
      <PermalinkBootstrap />
      {showLobby ? (
        <LobbyScreen initialSessionId={lobbyInvite?.sessionId ?? null} />
      ) : null}
      {showMainMenu && hasSnapshot && !showLobby ? <MainMenu /> : null}
    </div>
  );
}

export default App;
