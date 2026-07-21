import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { attachTransport } from './bootTransport';
import { parseMpHash } from './net/mpJoin';
import { resolveSocketUrl, SocketTransport } from './net/socketTransport';
import { WorkerTransport } from './net/workerTransport';
import { useStore } from './store';

/**
 * Transport selection (MP-M1):
 * - `#/mp?session=&nation=&seed=` → SocketTransport (shared session server)
 * - otherwise → WorkerTransport (single-player, unchanged)
 */
const mp = parseMpHash();

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
} else {
  const transport = new WorkerTransport();
  attachTransport(transport);
  transport.send({ t: 'init', seed: 1836 });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
