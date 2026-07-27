/**
 * UI-side state (Zustand). Holds the latest read-only snapshot from the sim
 * plus pure UI state (selected province, open panel, mapmode). The store NEVER
 * mutates the world — all changes go out as Commands via `sendCommand` on a
 * SimTransport (WorkerTransport in SP; SocketTransport / LobbyClient in MP).
 */

import { create } from 'zustand';
import type { SimTransport } from './net/transport';
import type { LobbyPlayerInfo, PresencePlayer, SessionMode } from './net/sessionProtocol';
import type {
  Command, GameData, NationDetail, NationId, ProvinceDetail, ProvinceId, SaveSlotInfo, WorldSnapshot,
} from './shared/types';
import {
  ALERT_FEED_CAP,
  deriveAlerts,
  type UiAlert,
} from './ui/alerts';
import { stabilizeSnapshot } from './ui/stabilizeSnapshot';

export type { UiAlert } from './ui/alerts';

export type MapMode =
  | 'political'
  | 'terrain'
  | 'population'
  | 'economy'
  | 'military'
  | 'diplomatic'
  | 'unrest'
  | 'ruling_ideology'
  | 'cores'
  | 'culture';
export type PanelId =
  | null | 'budget' | 'population' | 'cultures' | 'market' | 'politics' | 'diplomacy'
  | 'great_powers' | 'military' | 'production' | 'technology' | 'province' | 'colonization' | 'save_load' | 'formables' | 'decisions';

interface UIState {
  data: GameData | null;
  snapshot: WorldSnapshot | null;
  mapMode: MapMode;
  selectedProvince: ProvinceId | null;
  provinceDetail: ProvinceDetail | null;
  nationDetail: NationDetail | null;
  openPanel: PanelId;
  /** Nation to preselect when the Diplomacy panel next opens (tap a country name). */
  diploFocusNation: number | null;
  selectedArmy: number | null;
  selectedFleet: number | null;
  saveSlots: SaveSlotInfo[];
  saveStatus: { action: 'save' | 'load' | 'autosave'; slot: string; ok: boolean; msg: string } | null;
  showMainMenu: boolean;
  /** Multiplayer lobby browser / session room (MP-M2). */
  showLobby: boolean;
  alerts: UiAlert[];
  muteAudio: boolean;

  /** True when connected via SocketTransport / LobbyClient (not WorkerTransport). */
  multiplayer: boolean;
  mpSessionId: string | null;
  mpMode: SessionMode | null;
  mpIsLeader: boolean;
  mpPlayers: LobbyPlayerInfo[];
  /** Live presence (connected/disconnected) for in-game HUD. */
  mpPresence: PresencePlayer[];
  /** Recent in-session chat lines. */
  mpChat: { from: string; name: string; text: string; at: number }[];

  transport: SimTransport | null;

  setTransport: (t: SimTransport) => void;
  setShowLobby: (visible: boolean) => void;
  setMultiplayerMeta: (meta: {
    multiplayer: boolean;
    sessionId?: string | null;
    mode?: SessionMode | null;
    isLeader?: boolean;
    players?: LobbyPlayerInfo[];
  }) => void;
  setPresence: (players: PresencePlayer[]) => void;
  pushChat: (line: { from: string; name: string; text: string; at: number }) => void;
  sendChat: (text: string) => void;
  onSnapshot: (s: WorldSnapshot) => void;
  onData: (d: GameData) => void;
  onProvinceDetail: (d: ProvinceDetail) => void;
  onNationDetail: (d: NationDetail) => void;
  onSaveSlots: (slots: SaveSlotInfo[]) => void;
  onSaveStatus: (status: { action: 'save' | 'load' | 'autosave'; slot: string; ok: boolean; msg: string }) => void;

  setMapMode: (m: MapMode) => void;
  selectProvince: (id: ProvinceId | null) => void;
  openPanelId: (p: PanelId) => void;
  focusNationDiplomacy: (nationId: number) => void;
  clearDiploFocus: () => void;
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
  diploFocusNation: null,
  selectedArmy: null,
  selectedFleet: null,
  saveSlots: [],
  saveStatus: null,
  showMainMenu: true,
  showLobby: false,
  alerts: [],
  muteAudio: true,
  multiplayer: false,
  mpSessionId: null,
  mpMode: null,
  mpIsLeader: false,
  mpPlayers: [],
  mpPresence: [],
  mpChat: [],
  transport: null,

  setTransport: (t) => set({ transport: t }),
  setShowLobby: (visible) => set({ showLobby: visible }),
  setMultiplayerMeta: (meta) => set((state) => ({
    multiplayer: meta.multiplayer,
    mpSessionId: meta.sessionId !== undefined ? meta.sessionId : state.mpSessionId,
    mpMode: meta.mode !== undefined ? meta.mode : state.mpMode,
    mpIsLeader: meta.isLeader !== undefined ? meta.isLeader : state.mpIsLeader,
    mpPlayers: meta.players !== undefined ? meta.players : state.mpPlayers,
  })),
  setPresence: (players) => set({ mpPresence: players }),
  pushChat: (line) => set((state) => ({
    mpChat: [...state.mpChat, line].slice(-40),
  })),
  sendChat: (text) => {
    const t = get().transport as { sendChat?: (s: string) => void } | null;
    t?.sendChat?.(text);
  },
  onSnapshot: (s) => set((state) => {
    const goodNames = new Map((state.data?.goods ?? []).map((good) => [good.id, good.name]));
    const alerts = deriveAlerts(state.snapshot, s, state.alerts, goodNames);
    const snapshot = stabilizeSnapshot(state.snapshot, s);
    return { snapshot, alerts };
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
    ].slice(-ALERT_FEED_CAP),
  })),

  setMapMode: (m) => set({ mapMode: m }),
  selectProvince: (id) => {
    set({ selectedProvince: id, openPanel: id === null ? get().openPanel : 'province' });
    if (id !== null) get().requestProvince(id);
  },
  openPanelId: (p) => set({ openPanel: p }),
  focusNationDiplomacy: (nationId) => set({ diploFocusNation: nationId, openPanel: 'diplomacy' }),
  clearDiploFocus: () => set({ diploFocusNation: null }),
  setSelectedArmy: (id) => set({ selectedArmy: id, selectedFleet: null }),
  setSelectedFleet: (id) => set({ selectedFleet: id, selectedArmy: null }),
  setShowMainMenu: (visible) => set({ showMainMenu: visible }),
  setMuteAudio: (mute) => set({ muteAudio: mute }),

  sendCommand: (cmd) => {
    const state = get();
    // Privacy: never allow switching player nation over the wire in MP.
    if (state.multiplayer && cmd.t === 'setPlayerNation') return;
    // Speed authority is enforced server-side (leader only); UI disables controls for non-leaders.
    state.transport?.send({ t: 'command', cmd });
  },
  requestProvince: (id) => get().transport?.send({ t: 'requestProvince', id }),
  requestNation: (id) => {
    const state = get();
    // Privacy: private nation detail only for the client's own seat.
    if (state.multiplayer && state.snapshot && id !== state.snapshot.playerNation) return;
    state.transport?.send({ t: 'requestNation', id });
  },
  requestSaves: () => {
    if (get().multiplayer) return; // save/load disabled in MP
    get().transport?.send({ t: 'command', cmd: { t: 'listSaves' } });
  },
  dismissAlert: (id) => set((state) => ({ alerts: state.alerts.filter((alert) => alert.id !== id) })),
}));

// Exposed for Playwright / harness (SP + MP).
(globalThis as { __grandCenturyStore?: typeof useStore }).__grandCenturyStore = useStore;
