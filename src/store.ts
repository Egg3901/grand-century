/**
 * UI-side state (Zustand). Holds the latest read-only snapshot from the worker
 * plus pure UI state (selected province, open panel, mapmode). The store NEVER
 * mutates the world — all changes go out as Commands via `sendCommand`.
 */

import { create } from 'zustand';
import type {
  Command, GameData, NationDetail, NationId, ProvinceDetail, ProvinceId, WorldSnapshot,
} from './shared/types';

export type MapMode =
  | 'political'
  | 'population'
  | 'economy'
  | 'military'
  | 'diplomatic'
  | 'unrest'
  | 'ruling_ideology';
export type PanelId =
  | null | 'budget' | 'population' | 'market' | 'politics' | 'diplomacy'
  | 'great_powers' | 'military' | 'production' | 'technology' | 'province';

interface UIState {
  data: GameData | null;
  snapshot: WorldSnapshot | null;
  mapMode: MapMode;
  selectedProvince: ProvinceId | null;
  provinceDetail: ProvinceDetail | null;
  nationDetail: NationDetail | null;
  openPanel: PanelId;

  worker: Worker | null;

  setWorker: (w: Worker) => void;
  onSnapshot: (s: WorldSnapshot) => void;
  onData: (d: GameData) => void;
  onProvinceDetail: (d: ProvinceDetail) => void;
  onNationDetail: (d: NationDetail) => void;

  setMapMode: (m: MapMode) => void;
  selectProvince: (id: ProvinceId | null) => void;
  openPanelId: (p: PanelId) => void;

  sendCommand: (cmd: Command) => void;
  requestProvince: (id: ProvinceId) => void;
  requestNation: (id: NationId) => void;
}

export const useStore = create<UIState>((set, get) => ({
  data: null,
  snapshot: null,
  mapMode: 'political',
  selectedProvince: null,
  provinceDetail: null,
  nationDetail: null,
  openPanel: null,
  worker: null,

  setWorker: (w) => set({ worker: w }),
  onSnapshot: (s) => set({ snapshot: s }),
  onData: (d) => set({ data: d }),
  onProvinceDetail: (d) => set({ provinceDetail: d }),
  onNationDetail: (d) => set({ nationDetail: d }),

  setMapMode: (m) => set({ mapMode: m }),
  selectProvince: (id) => {
    set({ selectedProvince: id, openPanel: id === null ? get().openPanel : 'province' });
    if (id !== null) get().requestProvince(id);
  },
  openPanelId: (p) => set({ openPanel: p }),

  sendCommand: (cmd) => get().worker?.postMessage({ t: 'command', cmd }),
  requestProvince: (id) => get().worker?.postMessage({ t: 'requestProvince', id }),
  requestNation: (id) => get().worker?.postMessage({ t: 'requestNation', id }),
}));
