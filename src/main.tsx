import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import type { FromWorker } from './shared/types';
import { useStore } from './store';

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (event: MessageEvent<FromWorker>) => {
  const message = event.data;
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
    case 'log':
      if (message.level === 'error') console.error(`[sim] ${message.msg}`);
      else if (message.level === 'warn') console.warn(`[sim] ${message.msg}`);
      else console.info(`[sim] ${message.msg}`);
      break;
  }
};

useStore.getState().setWorker(worker);
worker.postMessage({ t: 'init', seed: 1836 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
