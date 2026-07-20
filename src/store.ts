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
  kind: 'war' | 'peace' | 'bankruptcy' | 'rebellion' | 'election' | 'save' | 'formation' | 'unrest';
  day: number;
  message: string;
  panel: Exclude<PanelId, null> | null;
  suggestion?: string;
  dedupeKey?: string;
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
    const ALERT_FEED_CAP = 18;
    const alerts = state.alerts.slice();
    const prev = state.snapshot;
    const hasRecentAlert = (dedupeKey: string | undefined, day: number, cooldownDays = 45) => {
      if (!dedupeKey) return false;
      return alerts.some((alert) => (
        alert.dedupeKey === dedupeKey
        && Math.abs(day - alert.day) <= cooldownDays
      ));
    };
    const pushAlert = (
      kind: UiAlert['kind'],
      message: string,
      day: number,
      panel: UiAlert['panel'],
      suggestion: string,
      dedupeKey?: string,
      cooldownDays = 45,
    ) => {
      if (hasRecentAlert(dedupeKey, day, cooldownDays)) return;
      alerts.push({
        id: `${kind}-${day}-${alerts.length}`,
        kind,
        day,
        message,
        panel,
        suggestion,
        dedupeKey,
      });
    };
    if (prev) {
      const prevWarIds = new Set(prev.wars.map((war) => war.id));
      const currWarIds = new Set(s.wars.map((war) => war.id));
      for (const war of s.wars) {
        if (prevWarIds.has(war.id)) continue;
        const playerInWar = war.attackers.includes(s.playerNation) || war.defenders.includes(s.playerNation);
        if (!playerInWar) continue;
        pushAlert(
          'war',
          `War declared (War ${war.id}).`,
          s.day,
          'military',
          'Open Military and review War Overview.',
          `war-start-${war.id}`,
          365,
        );
      }
      for (const war of prev.wars) {
        if (currWarIds.has(war.id)) continue;
        const playerInWar = war.attackers.includes(s.playerNation) || war.defenders.includes(s.playerNation);
        if (!playerInWar) continue;
        pushAlert(
          'peace',
          `Peace signed (War ${war.id}).`,
          s.day,
          'military',
          'Open Military to review postwar status.',
          `war-end-${war.id}`,
          365,
        );
      }
      const prevWarById = new Map(prev.wars.map((war) => [war.id, war]));
      for (const war of s.wars) {
        const playerIsAttacker = war.attackers.includes(s.playerNation);
        const playerIsDefender = war.defenders.includes(s.playerNation);
        if (!playerIsAttacker && !playerIsDefender) continue;
        const perspectiveScore = playerIsAttacker ? war.score : -war.score;
        const previous = prevWarById.get(war.id);
        const previousPerspectiveScore = previous
          ? (previous.attackers.includes(s.playerNation) ? previous.score : -previous.score)
          : 0;
        if (perspectiveScore >= 10 && previousPerspectiveScore < 10) {
          pushAlert(
            'peace',
            `Peace leverage available (War ${war.id}, score ${perspectiveScore.toFixed(1)}).`,
            s.day,
            'military',
            'Open Military and use Enforce Selected Goals or White Peace.',
            `peace-window-${war.id}`,
            60,
          );
        }
      }
      const prevBankrupt = new Set(prev.nations.filter((nation) => nation.isBankrupt).map((nation) => nation.id));
      for (const nation of s.nations) {
        if (nation.isBankrupt && !prevBankrupt.has(nation.id)) {
          const isPlayer = nation.id === s.playerNation;
          pushAlert(
            'bankruptcy',
            `${nation.name} went bankrupt.`,
            s.day,
            isPlayer ? 'budget' : 'diplomacy',
            isPlayer ? 'Open Budget and restore a positive monthly net.' : 'Open Diplomacy and monitor regional instability.',
            `bankruptcy-${nation.id}`,
          );
        }
      }
      const prevRebels = prev.armies.filter((army) => army.rebel).length;
      const rebels = s.armies.filter((army) => army.rebel).length;
      if (rebels > prevRebels) {
        pushAlert(
          'rebellion',
          'Rebellion forces have risen.',
          s.day,
          'military',
          'Open Military and reposition armies toward unrest hotspots.',
          'rebellion-risen',
          20,
        );
      }
      const prevPartyByNation = new Map(prev.nations.map((nation) => [nation.id, nation.rulingParty]));
      const prevTagByNation = new Map(prev.nations.map((nation) => [nation.id, nation.tag]));
      for (const nation of s.nations) {
        const oldParty = prevPartyByNation.get(nation.id);
        if (oldParty && oldParty !== nation.rulingParty) {
          pushAlert(
            'election',
            `${nation.name} elected ${nation.rulingParty}.`,
            s.day,
            'politics',
            'Open Politics to review party shifts and reform support.',
            `election-${nation.id}-${nation.rulingParty}`,
            365,
          );
        }
        const oldTag = prevTagByNation.get(nation.id);
        if (oldTag && oldTag !== nation.tag) {
          if (nation.tag === 'GER') {
            pushAlert('formation', 'The German Empire is proclaimed!', s.day, 'diplomacy', 'Open Diplomacy and reassess alliances and rivals.', `formation-${nation.tag}`, 3650);
          } else if (nation.tag === 'ITA') {
            pushAlert('formation', 'The Kingdom of Italy is proclaimed!', s.day, 'diplomacy', 'Open Diplomacy and reassess alliances and rivals.', `formation-${nation.tag}`, 3650);
          } else {
            pushAlert('formation', `${nation.name} has formed.`, s.day, 'diplomacy', 'Open Diplomacy to review the balance of power.', `formation-${nation.tag}`, 3650);
          }
        }
      }
      const playerProvinceUnrest = s.provinces.filter((province) => province.owner === s.playerNation).map((province) => province.unrestRisk);
      const prevPlayerProvinceUnrest = prev.provinces.filter((province) => province.owner === prev.playerNation).map((province) => province.unrestRisk);
      const maxUnrest = playerProvinceUnrest.length > 0 ? Math.max(...playerProvinceUnrest) : 0;
      const prevMaxUnrest = prevPlayerProvinceUnrest.length > 0 ? Math.max(...prevPlayerProvinceUnrest) : 0;
      if (maxUnrest >= 0.55 && prevMaxUnrest < 0.55) {
        pushAlert(
          'unrest',
          `High unrest risk detected (${maxUnrest.toFixed(2)}).`,
          s.day,
          'politics',
          'Open Politics and enact stabilizing reforms or cut taxes.',
          'high-unrest',
          120,
        );
      }
    }
    return { snapshot: s, alerts: alerts.slice(-ALERT_FEED_CAP) };
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
        panel: 'save_load' as const,
        suggestion: status.ok ? 'Open Save / Load to verify your latest slot.' : 'Open Save / Load and retry with another slot name.',
        dedupeKey: `save-${status.action}-${status.slot}-${status.ok ? 'ok' : 'fail'}`,
      },
    ].slice(-18),
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
