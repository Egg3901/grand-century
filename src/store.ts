/**
 * UI-side state (Zustand). Holds the latest read-only snapshot from the worker
 * plus pure UI state (selected province, open panel, mapmode). The store NEVER
 * mutates the world — all changes go out as Commands via `sendCommand`.
 */

import { create } from 'zustand';
import type {
  Command, GameData, NationDetail, NationId, ProvinceDetail, ProvinceId, SaveSlotInfo, WorldSnapshot,
} from './shared/types';

export type MapMode =
  | 'political'
  | 'population'
  | 'economy'
  | 'military'
  | 'diplomatic'
  | 'unrest'
  | 'ruling_ideology'
  | 'cores';
export type PanelId =
  | null | 'budget' | 'population' | 'market' | 'politics' | 'diplomacy'
  | 'great_powers' | 'military' | 'production' | 'technology' | 'province' | 'colonization' | 'save_load' | 'formables';

export interface UiAlert {
  id: string;
  kind: 'war' | 'peace' | 'bankruptcy' | 'rebellion' | 'election' | 'save' | 'formation';
  day: number;
  message: string;
}

interface UIState {
  data: GameData | null;
  snapshot: WorldSnapshot | null;
  mapMode: MapMode;
  selectedProvince: ProvinceId | null;
  provinceDetail: ProvinceDetail | null;
  nationDetail: NationDetail | null;
  openPanel: PanelId;
  selectedArmy: number | null;
  selectedFleet: number | null;
  saveSlots: SaveSlotInfo[];
  saveStatus: { action: 'save' | 'load' | 'autosave'; slot: string; ok: boolean; msg: string } | null;
  showMainMenu: boolean;
  alerts: UiAlert[];
  muteAudio: boolean;

  worker: Worker | null;

  setWorker: (w: Worker) => void;
  onSnapshot: (s: WorldSnapshot) => void;
  onData: (d: GameData) => void;
  onProvinceDetail: (d: ProvinceDetail) => void;
  onNationDetail: (d: NationDetail) => void;
  onSaveSlots: (slots: SaveSlotInfo[]) => void;
  onSaveStatus: (status: { action: 'save' | 'load' | 'autosave'; slot: string; ok: boolean; msg: string }) => void;

  setMapMode: (m: MapMode) => void;
  selectProvince: (id: ProvinceId | null) => void;
  openPanelId: (p: PanelId) => void;
  setSelectedArmy: (id: number | null) => void;
  setSelectedFleet: (id: number | null) => void;
  setShowMainMenu: (visible: boolean) => void;
  setMuteAudio: (mute: boolean) => void;

  sendCommand: (cmd: Command) => void;
  requestProvince: (id: ProvinceId) => void;
  requestNation: (id: NationId) => void;
  requestSaves: () => void;
  dismissAlert: (id: string) => void;
}

export const useStore = create<UIState>((set, get) => ({
  data: null,
  snapshot: null,
  mapMode: 'political',
  selectedProvince: null,
  provinceDetail: null,
  nationDetail: null,
  openPanel: null,
  selectedArmy: null,
  selectedFleet: null,
  saveSlots: [],
  saveStatus: null,
  showMainMenu: true,
  alerts: [],
  muteAudio: true,
  worker: null,

  setWorker: (w) => set({ worker: w }),
  onSnapshot: (s) => set((state) => {
    const alerts = state.alerts.slice();
    const prev = state.snapshot;
    const pushAlert = (kind: UiAlert['kind'], message: string, day: number) => {
      alerts.push({ id: `${kind}-${day}-${alerts.length}`, kind, day, message });
    };
    if (prev) {
      if (s.wars.length > prev.wars.length) pushAlert('war', 'War declared.', s.day);
      if (s.wars.length < prev.wars.length) pushAlert('peace', 'Peace treaty signed.', s.day);
      const prevBankrupt = new Set(prev.nations.filter((nation) => nation.isBankrupt).map((nation) => nation.id));
      for (const nation of s.nations) {
        if (nation.isBankrupt && !prevBankrupt.has(nation.id)) {
          pushAlert('bankruptcy', `${nation.name} went bankrupt.`, s.day);
        }
      }
      const prevRebels = prev.armies.filter((army) => army.rebel).length;
      const rebels = s.armies.filter((army) => army.rebel).length;
      if (rebels > prevRebels) pushAlert('rebellion', 'Rebellion forces have risen.', s.day);
      const prevPartyByNation = new Map(prev.nations.map((nation) => [nation.id, nation.rulingParty]));
      const prevTagByNation = new Map(prev.nations.map((nation) => [nation.id, nation.tag]));
      for (const nation of s.nations) {
        const oldParty = prevPartyByNation.get(nation.id);
        if (oldParty && oldParty !== nation.rulingParty) {
          pushAlert('election', `${nation.name} elected ${nation.rulingParty}.`, s.day);
        }
        const oldTag = prevTagByNation.get(nation.id);
        if (oldTag && oldTag !== nation.tag) {
          if (nation.tag === 'GER') pushAlert('formation', 'The German Empire is proclaimed!', s.day);
          else if (nation.tag === 'ITA') pushAlert('formation', 'The Kingdom of Italy is proclaimed!', s.day);
          else pushAlert('formation', `${nation.name} has formed.`, s.day);
        }
      }
    }
    return { snapshot: s, alerts: alerts.slice(-10) };
  }),
  onData: (d) => set({ data: d }),
  onProvinceDetail: (d) => set({ provinceDetail: d }),
  onNationDetail: (d) => set({ nationDetail: d }),
  onSaveSlots: (slots) => set({ saveSlots: slots }),
  onSaveStatus: (status) => set((state) => ({
    saveStatus: status,
    alerts: [
      ...state.alerts,
      {
        id: `save-${Date.now()}`,
        kind: 'save' as const,
        day: state.snapshot?.day ?? 0,
        message: `${status.action} ${status.ok ? 'ok' : 'failed'} [${status.slot}]`,
      },
    ].slice(-10),
  })),

  setMapMode: (m) => set({ mapMode: m }),
  selectProvince: (id) => {
    set({ selectedProvince: id, openPanel: id === null ? get().openPanel : 'province' });
    if (id !== null) get().requestProvince(id);
  },
  openPanelId: (p) => set({ openPanel: p }),
  setSelectedArmy: (id) => set({ selectedArmy: id, selectedFleet: null }),
  setSelectedFleet: (id) => set({ selectedFleet: id, selectedArmy: null }),
  setShowMainMenu: (visible) => set({ showMainMenu: visible }),
  setMuteAudio: (mute) => set({ muteAudio: mute }),

  sendCommand: (cmd) => get().worker?.postMessage({ t: 'command', cmd }),
  requestProvince: (id) => get().worker?.postMessage({ t: 'requestProvince', id }),
  requestNation: (id) => get().worker?.postMessage({ t: 'requestNation', id }),
  requestSaves: () => get().worker?.postMessage({ t: 'command', cmd: { t: 'listSaves' } }),
  dismissAlert: (id) => set((state) => ({ alerts: state.alerts.filter((alert) => alert.id !== id) })),
}));
