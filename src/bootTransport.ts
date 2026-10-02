/**
 * Wire a SimTransport into the Zustand store (shared by SP + MP boot paths).
 */

import type { FromWorker } from './shared/types';
import type { SimTransport } from './net/transport';
import { useStore } from './store';
import { ensureScenario, isScenarioLoaded } from './data/generated';

// Messages wait while the main thread fetches an era seed the sim just
// started, so panels never read a scenario that is not loaded yet.
let gate: Promise<unknown> | null = null;
const held: FromWorker[] = [];

export function routeFromSim(message: FromWorker): void {
  if (!gate && message.t === 'ready' && !isScenarioLoaded(message.data.scenarioId)) {
    gate = ensureScenario(message.data.scenarioId).catch((error: unknown) => {
      console.error(`[sim] could not load scenario ${message.data.scenarioId}`, error);
    }).finally(() => {
      gate = null;
      for (const queued of held.splice(0)) routeFromSim(queued);
    });
  }
  if (gate) {
    held.push(message);
    return;
  }
  deliver(message);
}

function deliver(message: FromWorker): void {
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
