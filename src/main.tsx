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
  });
  attachTransport(transport);
  useStore.getState().setShowMainMenu(false);
  useStore.getState().setMultiplayerMeta({
    multiplayer: true,
    sessionId: mp.sessionId,
    mode: 'competitive',
    isLeader: true, // corrected when joined if we tracked it; leader authority still server-side
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
