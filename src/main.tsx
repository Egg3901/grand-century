import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { attachTransport } from './bootTransport';
import { parseLobbyHash, parseMpHash } from './net/mpJoin';
import { resolveSocketUrl, SocketTransport } from './net/socketTransport';
import { WorkerTransport } from './net/workerTransport';
import { useStore } from './store';

/**
 * Transport selection:
 * - `#/mp?session=&nation=&seed=` → SocketTransport (M1 permalink shortcut)
 * - `#/lobby?session=` → WorkerTransport for map boot + LobbyScreen joins via LobbyClient
 * - otherwise → WorkerTransport (single-player)
 */
const mp = parseMpHash();
const lobbyInvite = parseLobbyHash();

if (mp) {
  const transport = new SocketTransport(resolveSocketUrl(), {
    join: {
      t: 'join',
      sessionId: mp.sessionId,
      nation: mp.nationTag,
      seed: mp.seed,
    },
    onPresence: (players) => {
      const store = useStore.getState();
      store.setPresence(players);
      const myTag = mp.nationTag.toUpperCase();
      const self = players.find((p) => p.nationTag === myTag);
      store.setMultiplayerMeta({
        multiplayer: true,
        sessionId: mp.sessionId,
        isLeader: Boolean(self?.leader),
        players: players.map((p) => ({
          clientId: p.clientId,
          name: p.name,
          nationTag: p.nationTag,
          team: p.team,
          ready: true,
          leader: p.leader,
        })),
      });
    },
    onChat: (line) => useStore.getState().pushChat(line),
  });
  attachTransport(transport);
  useStore.getState().setShowMainMenu(false);
  useStore.getState().setMultiplayerMeta({
    multiplayer: true,
    sessionId: mp.sessionId,
    mode: 'competitive',
    isLeader: true,
    players: [],
  });
} else {
  const transport = new WorkerTransport();
  attachTransport(transport);
  transport.send({ t: 'init', seed: 1836 });
  if (lobbyInvite) {
    useStore.getState().setShowMainMenu(false);
    useStore.getState().setShowLobby(true);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
