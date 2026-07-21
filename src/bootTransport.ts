/**
 * Wire a SimTransport into the Zustand store (shared by SP + MP boot paths).
 */

import type { FromWorker } from './shared/types';
import type { SimTransport } from './net/transport';
import { useStore } from './store';

export function routeFromSim(message: FromWorker): void {
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

export function attachTransport(transport: SimTransport): void {
  const prev = useStore.getState().transport;
  if (prev && prev !== transport) prev.dispose();
  transport.onMessage(routeFromSim);
  useStore.getState().setTransport(transport);
}
