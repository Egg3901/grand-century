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

export interface UiAlert {
  id: string;
  kind: 'war' | 'peace' | 'bankruptcy' | 'rebellion' | 'election' | 'save' | 'formation' | 'unrest' | 'event' | 'market' | 'crisis' | 'culture';
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
        const nameOf = (id: number) => s.nations.find((nation) => nation.id === id)?.name ?? `Nation ${id}`;
        const attacker = nameOf(war.attackers[0]);
        const defender = nameOf(war.defenders[0]);
        const attackerTag = s.nations.find((nation) => nation.id === war.attackers[0])?.tag ?? '';
        pushAlert(
          'war',
          `${attacker} ${attackerTag ? `(${attackerTag}) ` : ''}declares war on ${defender}.`,
          s.day,
          'military',
          'Open Military and review War Overview.',
          `war-start-${war.id}`,
          365,
        );
      }
      // U4: battle reports — name the outcome AND the decisive factor.
      const prevBattleKeys = new Set((prev.recentBattles ?? []).map((b) => `${b.day}:${b.provinceId}:${b.warId}`));
      for (const battle of s.recentBattles ?? []) {
        const key = `${battle.day}:${battle.provinceId}:${battle.warId}`;
        if (prevBattleKeys.has(key)) continue;
        if (battle.outcome === 'clash') continue; // only decided engagements toast
        const playerIsAttacker = battle.attackerNation === s.playerNation;
        const playerWon = (battle.outcome === 'attacker_victory') === playerIsAttacker;
        const enemyId = playerIsAttacker ? battle.defenderNation : battle.attackerNation;
        const enemy = s.nations.find((nation) => nation.id === enemyId)?.name ?? 'the enemy';
        // decisive factor from the player's perspective (flip sign if defending)
        const sign = playerIsAttacker ? 1 : -1;
        const entries = Object.entries(battle.factors) as Array<[string, number]>;
        const decisive = entries.reduce((best, entry) => (Math.abs(entry[1]) > Math.abs(best[1]) ? entry : best));
        const helpedPlayer = decisive[1] * sign > 0;
        const FACTOR_TEXT: Record<string, [string, string]> = {
          roll: ['fortune favored our arms', 'the dice went against us'],
          organization: ['superior organization told', 'our lines were disordered'],
          leadership: ['the general carried the day', 'we were outgeneraled'],
          technology: ['better guns and drill decided it', 'their guns and drill outmatched ours'],
          terrain: ['the ground fought for us', 'the ground fought against us'],
          fort: ['the fortress held firm', 'their fortress blunted the assault'],
        };
        const why = (FACTOR_TEXT[decisive[0]] ?? ['', ''])[helpedPlayer ? 0 : 1];
        const ourLosses = playerIsAttacker ? battle.attackerLosses : battle.defenderLosses;
        const theirLosses = playerIsAttacker ? battle.defenderLosses : battle.attackerLosses;
        pushAlert(
          'war',
          `${playerWon ? 'Victory' : 'Defeat'} at ${battle.provinceName} against ${enemy} — ${why}. Losses ${Math.round(ourLosses)} to ${Math.round(theirLosses)}.`,
          s.day,
          'military',
          playerWon ? 'Press the advantage while their line reforms.' : 'Regroup — broken armies rally at reduced organization.',
          `battle-${key}`,
          0,
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
      const prevRebellions = new Map((prev.rebellions ?? []).map((rebellion) => [rebellion.id, rebellion]));
      for (const rebellion of s.rebellions ?? []) {
        const prior = prevRebellions.get(rebellion.id);
        if (!prior && rebellion.status === 'active') {
          const target = s.nations.find((nation) => nation.id === rebellion.targetNation);
          pushAlert(
            'rebellion',
            `${target?.name ?? 'A nation'} faces rebels demanding ${rebellion.demand.description}.`,
            s.day,
            'military',
            'Open Military to review rebel fronts and demands.',
            `rebellion-demand-${rebellion.id}`,
            365,
          );
        }
        if (prior?.status === 'active' && rebellion.status === 'enforced') {
          const target = s.nations.find((nation) => nation.id === rebellion.targetNation);
          pushAlert(
            'rebellion',
            `Rebels forced concessions in ${target?.name ?? 'a nation'} (${rebellion.demand.description}).`,
            s.day,
            'military',
            'Open Military to assess the post-rebellion map.',
            `rebellion-enforced-${rebellion.id}`,
            365,
          );
        } else if (prior?.status === 'active' && rebellion.status === 'crushed') {
          pushAlert(
            'rebellion',
            `A rebellion was crushed (${rebellion.demand.description}).`,
            s.day,
            'military',
            'Open Military to stand down reserve forces if needed.',
            `rebellion-crushed-${rebellion.id}`,
            180,
          );
        }
      }
      const prevPartyByNation = new Map(prev.nations.map((nation) => [nation.id, nation.rulingParty]));
      const prevTagByNation = new Map(prev.nations.map((nation) => [nation.id, nation.tag]));
      let foreignElectionCount = 0;
      for (const nation of s.nations) {
        const oldParty = prevPartyByNation.get(nation.id);
        if (oldParty && oldParty !== nation.rulingParty) {
          if (nation.id === s.playerNation) {
            pushAlert(
              'election',
              `${nation.name} elected ${nation.rulingParty}.`,
              s.day,
              'politics',
              'Open Politics to review party shifts and reform support.',
              `election-${nation.id}-${nation.rulingParty}`,
              365,
            );
          } else {
            foreignElectionCount += 1;
          }
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
      const prevCrisis = prev.activeCrisis ?? null;
      const currCrisis = s.activeCrisis ?? null;
      if (!prevCrisis && currCrisis) {
        const subject = s.nations.find((nation) => nation.id === currCrisis.subject)?.name ?? `Nation ${currCrisis.subject}`;
        pushAlert(
          'crisis',
          `Crisis erupts over ${subject}.`,
          s.day,
          'great_powers',
          'Open Great Powers to back a side or watch the Concert.',
          `crisis-spawn-${currCrisis.id}`,
          365,
        );
      } else if (prevCrisis && !currCrisis) {
        const history = s.congressHistory ?? [];
        const latest = history[history.length - 1];
        const outcome = latest && latest.day === s.day
          ? latest.outcome === 'war'
            ? 'Diplomacy failed — war.'
            : latest.outcome === 'fizzle'
              ? 'Crisis fizzled.'
              : 'Congress settled the crisis.'
          : 'Crisis resolved.';
        pushAlert(
          'crisis',
          outcome,
          s.day,
          'great_powers',
          'Open Great Powers to review the congress ledger.',
          `crisis-resolve-${prevCrisis.id}`,
          365,
        );
      }
      if (foreignElectionCount > 0) {
        const monthKey = `election-foreign-${s.date.year}-${s.date.month}`;
        const existing = alerts.find((alert) => alert.dedupeKey === monthKey);
        if (existing) {
          const priorCount = Number(existing.message.match(/^(\d+)/)?.[1] ?? 1);
          existing.message = `${priorCount + foreignElectionCount} elections this month`;
          existing.day = s.day;
        } else {
          pushAlert(
            'election',
            foreignElectionCount === 1
              ? '1 election this month'
              : `${foreignElectionCount} elections this month`,
            s.day,
            'politics',
            'Routine foreign elections — expand in the outliner if needed.',
            monthKey,
            45,
          );
        }
      }
      // Province unrestRisk only changes on monthly sim ticks (never from a
      // command), so this O(provinces) scan is pointless on same-day snapshots
      // — which is most of them at low speed (8Hz snapshots share a day). Skip
      // it unless a day actually elapsed. A single loop also avoids two 620-arg
      // Math.max spreads.
      if (s.day !== prev.day) {
        let maxUnrest = 0;
        for (const province of s.provinces) {
          if (province.owner === s.playerNation && province.unrestRisk > maxUnrest) maxUnrest = province.unrestRisk;
        }
        let prevMaxUnrest = 0;
        for (const province of prev.provinces) {
          if (province.owner === prev.playerNation && province.unrestRisk > prevMaxUnrest) prevMaxUnrest = province.unrestRisk;
        }
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
      // Culture: alert when a player movement newly crosses the boiling gates.
      {
        const prevBoiling = new Set(
          (prev.playerMovements ?? []).filter((movement) => movement.boiling).map((movement) => movement.id),
        );
        for (const movement of s.playerMovements ?? []) {
          if (!movement.boiling || prevBoiling.has(movement.id)) continue;
          pushAlert(
            'culture',
            `${movement.cultureName} movement is boiling — uprising imminent.`,
            s.day,
            'cultures',
            'Open Cultures: grant acceptance, flip pluralist, or prepare for rebels.',
            `culture-boil-${movement.id}`,
            180,
          );
        }
      }
      const prevPendingIds = new Set((prev.pendingPlayerEvents ?? []).map((event) => event.instanceId));
      for (const event of s.pendingPlayerEvents ?? []) {
        if (prevPendingIds.has(event.instanceId)) continue;
        pushAlert(
          'event',
          event.title,
          s.day,
          'decisions',
          'A national event requires your choice.',
          `event-${event.instanceId}`,
          365,
        );
      }
      // Life-need goods (grain/cattle/fish) — alert when world unmet is severe.
      const lifeGoodIds = new Set([0, 1, 2]);
      const goodNames = new Map((get().data?.goods ?? []).map((good) => [good.id, good.name]));
      for (const good of s.market) {
        if (!lifeGoodIds.has(good.good)) continue;
        const denom = Math.max(1, good.priceTrace.requestedDemand);
        const unmetFrac = good.unmet / denom;
        if (unmetFrac < 0.22 && good.unmet < Math.max(8, good.supply * 0.18)) continue;
        const name = goodNames.get(good.good) ?? `Good ${good.good}`;
        pushAlert(
          'market',
          `${name} shortage: ${good.unmet.toFixed(0)} unmet (${(unmetFrac * 100).toFixed(0)}% of demand).`,
          s.day,
          'market',
          'Open Market and Production — expand RGOs or import capacity for life goods.',
          `market-shortage-${good.good}`,
          45,
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
