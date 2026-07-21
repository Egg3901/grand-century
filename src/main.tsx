import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { WorkerTransport } from './net/workerTransport';
import type { FromWorker } from './shared/types';
import { useStore } from './store';

/**
 * Single-player entry: local WorkerTransport.
 * MP-M1 will branch here (or in a session bootstrap) to construct
 * SocketTransport when joining/creating a multiplayer session.
 */
const transport = new WorkerTransport();

function routeFromSim(message: FromWorker) {
  const state = useStore.getState();
  switch (message.t) {
    case 'ready':
      state.onData(message.data);
      break;
    case 'snapshot':
      state.onSnapshot(message.snapshot);
      break;
    case 'provinceDetail':
      state.onProvinceDetail(message.detail);
      break;
    case 'nationDetail':
      state.onNationDetail(message.detail);
      break;
    case 'saveSlots':
      state.onSaveSlots(message.slots);
      break;
    case 'saveStatus':
      state.onSaveStatus(message);
      break;
    case 'log':
      if (message.level === 'error') console.error(`[sim] ${message.msg}`);
      else if (message.level === 'warn') console.warn(`[sim] ${message.msg}`);
      else console.info(`[sim] ${message.msg}`);
      break;
  }
}

transport.onMessage(routeFromSim);
useStore.getState().setTransport(transport);
transport.send({ t: 'init', seed: 1836 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
