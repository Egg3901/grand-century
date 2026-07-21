import './App.css';
import { Suspense, lazy, useMemo } from 'react';
import { Hud } from './ui/Hud';
import { PanelHost } from './ui/panels/PanelHost';
import { MainMenu } from './ui/MainMenu';
import { LobbyScreen } from './ui/Lobby';
import { PresenceHud } from './ui/PresenceHud';
import { PermalinkBootstrap } from './ui/PermalinkBootstrap';
import { Outliner } from './ui/Outliner';
import { EventFeed } from './ui/EventFeed';
import { EventPopup } from './ui/EventPopup';
import { MapLegend } from './ui/MapLegend';
import { AudioManager } from './ui/AudioManager';
import { TutorialCoach } from './ui/TutorialCoach';
import { parseLobbyHash } from './net/mpJoin';
import { useStore } from './store';

const LazyGrandMap = lazy(async () => {
  const module = await import('./map/GrandMap');
  return { default: module.GrandMap };
});

function App() {
  const snapshot = useStore((state) => state.snapshot);
  const data = useStore((state) => state.data);
  const showMainMenu = useStore((state) => state.showMainMenu);
  const showLobby = useStore((state) => state.showLobby);
  const lobbyInvite = useMemo(() => parseLobbyHash(), []);

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="map-loading" />}>
        <LazyGrandMap />
      </Suspense>
      <div className="hud-layer">
        <AudioManager />
        <Hud />
        <PresenceHud />
        <Outliner />
        <MapLegend />
        <EventFeed />
        <EventPopup />
        <PanelHost />
        <TutorialCoach />
      </div>
      {!snapshot || !data ? (
        <div className="loading-veil">
          <h1>Grand Century</h1>
          <p>Initializing simulation ledger...</p>
        </div>
      ) : null}
      <PermalinkBootstrap />
      {showLobby ? (
        <LobbyScreen initialSessionId={lobbyInvite?.sessionId ?? null} />
      ) : null}
      {showMainMenu && snapshot && !showLobby ? <MainMenu /> : null}
    </div>
  );
}

export default App;
