/**
 * Shared snapshot split / diff / apply / gzip (MP-M4).
 * Lives in src/net so server + client share one implementation.
 * Does not change WorldSnapshot shapes in shared/types.ts.
 */

import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';
import type {
  Army,
  BalanceOfPowerView,
  BattleReport,
  BudgetLine,
  CasusBelli,
  ChronicleEntry,
  ColonialClaimSummary,
  ColonialClaimableState,
  CongressRecord,
  Crisis,
  CrisisCandidateView,
  CrisisShowdownView,
  CultureLedgerEntry,
  CulturePolicy,
  DecisionStatus,
  DiploRelation,
  Fleet,
  FormableStatus,
  GameDate,
  GoodId,
  GreatPowerStanding,
  InfluenceTarget,
  AllianceAcceptancePreview,
  MarketGood,
  MovementView,
  NationId,
  NationSummary,
  PendingEvent,
  PlayerTechView,
  PopulationLedgerEntry,
  PopMobilityLedger,
  ProductionLedgerEntry,
  ProvinceSummary,
  Rebellion,
  StateId,
  StockpileOrder,
  TensionContribution,
  War,
  WarGoalType,
  WorldSnapshot,
} from '../shared/types';

/** Shared (non-per-client) fields of a WorldSnapshot. */
export interface SharedSnapshot {
  day: number;
  date: GameDate;
  speed: number;
  seed?: number;
  nations: NationSummary[];
  provinces: ProvinceSummary[];
  market: MarketGood[];
  wars: War[];
  relations: DiploRelation[];
  greatPowers: GreatPowerStanding[];
  infamyLimit: number;
  ninthPowerScore: number;
  armies: Army[];
  fleets: Fleet[];
  rebellions: Rebellion[];
  // 0.7.0 Concert of Europe (world-global)
  worldTension?: number;
  tensionTrace?: TensionContribution[];
  tensionDecay?: number;
  tensionNetDelta?: number;
  crisisCooldownUntil?: number;
  activeCrisis?: Crisis | null;
  crisisShowdown?: CrisisShowdownView | null;
  crisisCandidates?: CrisisCandidateView[];
  congressHistory?: CongressRecord[];
  // 1.0-U5 chronicle (world-global)
  chronicle?: ChronicleEntry[];
  chronicleWarsFought?: number;
}

/** Per-client private HUD/panel fields. */
export interface PlayerView {
  playerNation: NationId;
  playerCbs: CasusBelli[];
  playerPendingCbs: CasusBelli[];
  playerDiplomaticPoints: number;
  fabricateCbCostByGoal: Record<WarGoalType, number>;
  warGoalInfamyUse: Record<WarGoalType, number>;
  playerInfluencePool: number;
  playerInfluenceTargets: InfluenceTarget[];
  playerAlliancePreviews: AllianceAcceptancePreview[];
  coalitionAgainstPlayer: NationId[];
  playerPowerScore: number;
  rivalryDpCost: number;
  rivalryCap: number;
  playerRivalryCount: number;
  playerProduction: ProductionLedgerEntry[];
  playerPopulation: PopulationLedgerEntry[];
  playerPopMobility?: PopMobilityLedger;
  playerReformAgitation: { reform: string; support: number }[];
  playerStates: { id: StateId; name: string; factoryCount: number }[];
  playerCoreStateIds?: StateId[];
  playerFormables?: FormableStatus[];
  pendingPlayerEvents?: PendingEvent[];
  playerDecisions?: DecisionStatus[];
  /** 0.6.0: research/tech state for this client's nation. */
  playerTech?: PlayerTechView;
  playerBudget: BudgetLine;
  playerStockpile: Record<GoodId, number>;
  playerStockpileOrders: Record<GoodId, StockpileOrder>;
  // Fields previously only in single-player WorldSnapshot
  playerBalanceOfPower?: BalanceOfPowerView | null;
  recentBattles?: BattleReport[];
  campaignOver?: 'century' | 'eliminated' | null;
  // 0.8.0 Age of Nationalism (player-specific)
  playerCulturePolicy?: CulturePolicy;
  playerCulturePolicyCooldownDays?: number;
  playerCulturePolicyCost?: number;
  playerCultures?: CultureLedgerEntry[];
  playerMovements?: MovementView[];
  // Colonial (player-specific)
  colonialClaims?: ColonialClaimSummary[];
  playerClaimableColonialStates?: ColonialClaimableState[];
}

/** Sparse diff vs a previously sent SharedSnapshot. */
export interface SharedSnapshotDiff {
  day?: number;
  date?: GameDate;
  speed?: number;
  seed?: number;
  /** Only changed nation rows (by id). */
  nations?: NationSummary[];
  /** Only changed province rows (by id). */
  provinces?: ProvinceSummary[];
  /** Full replace when present. */
  market?: MarketGood[];
  wars?: War[];
  relations?: DiploRelation[];
  greatPowers?: GreatPowerStanding[];
  infamyLimit?: number;
  ninthPowerScore?: number;
  armies?: Army[];
  fleets?: Fleet[];
  rebellions?: Rebellion[];
  // 0.7.0 Concert of Europe
  worldTension?: number;
  tensionTrace?: TensionContribution[];
  tensionDecay?: number;
  tensionNetDelta?: number;
  crisisCooldownUntil?: number;
  activeCrisis?: Crisis | null;
  crisisShowdown?: CrisisShowdownView | null;
  crisisCandidates?: CrisisCandidateView[];
  congressHistory?: CongressRecord[];
  // 1.0-U5 chronicle
  chronicle?: ChronicleEntry[];
  chronicleWarsFought?: number;
}

export function extractShared(snap: WorldSnapshot): SharedSnapshot {
  return {
    day: snap.day,
    date: snap.date,
    speed: snap.speed,
    seed: snap.seed,
    nations: snap.nations,
    provinces: snap.provinces,
    market: snap.market,
    wars: snap.wars,
    relations: snap.relations,
    greatPowers: snap.greatPowers,
    infamyLimit: snap.infamyLimit,
    ninthPowerScore: snap.ninthPowerScore,
    armies: snap.armies,
    fleets: snap.fleets,
    rebellions: snap.rebellions,
    worldTension: snap.worldTension,
    tensionTrace: snap.tensionTrace,
    tensionDecay: snap.tensionDecay,
    tensionNetDelta: snap.tensionNetDelta,
    crisisCooldownUntil: snap.crisisCooldownUntil,
    activeCrisis: snap.activeCrisis,
    crisisShowdown: snap.crisisShowdown,
    crisisCandidates: snap.crisisCandidates,
    congressHistory: snap.congressHistory,
    chronicle: snap.chronicle,
    chronicleWarsFought: snap.chronicleWarsFought,
  };
}

export function extractPlayerView(snap: WorldSnapshot): PlayerView {
  return {
    playerNation: snap.playerNation,
    playerCbs: snap.playerCbs,
    playerPendingCbs: snap.playerPendingCbs,
    playerDiplomaticPoints: snap.playerDiplomaticPoints,
    fabricateCbCostByGoal: snap.fabricateCbCostByGoal,
    warGoalInfamyUse: snap.warGoalInfamyUse,
    playerInfluencePool: snap.playerInfluencePool,
    playerInfluenceTargets: snap.playerInfluenceTargets,
    playerAlliancePreviews: snap.playerAlliancePreviews,
    coalitionAgainstPlayer: snap.coalitionAgainstPlayer,
    playerPowerScore: snap.playerPowerScore,
    rivalryDpCost: snap.rivalryDpCost,
    rivalryCap: snap.rivalryCap,
    playerRivalryCount: snap.playerRivalryCount,
    playerProduction: snap.playerProduction,
    playerPopulation: snap.playerPopulation,
    playerPopMobility: snap.playerPopMobility,
    playerReformAgitation: snap.playerReformAgitation,
    playerStates: snap.playerStates,
    playerCoreStateIds: snap.playerCoreStateIds,
    playerFormables: snap.playerFormables,
    pendingPlayerEvents: snap.pendingPlayerEvents,
    playerDecisions: snap.playerDecisions,
    playerTech: snap.playerTech,
    playerBudget: snap.playerBudget,
    playerStockpile: snap.playerStockpile,
    playerStockpileOrders: snap.playerStockpileOrders,
    playerBalanceOfPower: snap.playerBalanceOfPower,
    recentBattles: snap.recentBattles,
    campaignOver: snap.campaignOver,
    playerCulturePolicy: snap.playerCulturePolicy,
    playerCulturePolicyCooldownDays: snap.playerCulturePolicyCooldownDays,
    playerCulturePolicyCost: snap.playerCulturePolicyCost,
    playerCultures: snap.playerCultures,
    playerMovements: snap.playerMovements,
    colonialClaims: snap.colonialClaims,
    playerClaimableColonialStates: snap.playerClaimableColonialStates,
  };
}

export function mergeSnapshot(shared: SharedSnapshot, view: PlayerView): WorldSnapshot {
  return {
    ...shared,
    ...view,
  };
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  // Fast path for plain objects / arrays used in snapshots
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Nation fields needed for map chrome / presence. */
function nationCriticalEqual(a: NationSummary, b: NationSummary): boolean {
  return (
    a.tag === b.tag
    && a.name === b.name
    && a.color[0] === b.color[0] && a.color[1] === b.color[1] && a.color[2] === b.color[2]
    && a.government === b.government
    && a.rulingIdeology === b.rulingIdeology
    && a.atWar === b.atWar
    && a.numProvinces === b.numProvinces
    && a.spheredBy === b.spheredBy
  );
}

function nationSoftEqual(a: NationSummary, b: NationSummary): boolean {
  return stableEqual(a, b);
}
function provinceCriticalEqual(a: ProvinceSummary, b: ProvinceSummary): boolean {
  return (
    a.owner === b.owner
    && a.controller === b.controller
    && a.stateId === b.stateId
    && a.fortLevel === b.fortLevel
    && a.occupation === b.occupation
    && a.rgoGood === b.rgoGood
  );
}

/** Soft HUD metrics — can lag a beat without hurting gameplay. */
function provinceSoftEqual(a: ProvinceSummary, b: ProvinceSummary): boolean {
  return (
    a.population === b.population
    && a.militancy === b.militancy
    && a.unrestRisk === b.unrestRisk
    && a.needsMet === b.needsMet
    && a.growth === b.growth
    && a.economyOutput === b.economyOutput
  );
}

export function diffShared(
  prev: SharedSnapshot,
  next: SharedSnapshot,
  opts: { includeSoftProvinces?: boolean } = {},
): SharedSnapshotDiff {
  const includeSoft = opts.includeSoftProvinces !== false;
  const diff: SharedSnapshotDiff = {};
  if (prev.day !== next.day) diff.day = next.day;
  if (!stableEqual(prev.date, next.date)) diff.date = next.date;
  if (prev.speed !== next.speed) diff.speed = next.speed;
  if (prev.seed !== next.seed) diff.seed = next.seed;
  if (prev.infamyLimit !== next.infamyLimit) diff.infamyLimit = next.infamyLimit;
  if (prev.ninthPowerScore !== next.ninthPowerScore) diff.ninthPowerScore = next.ninthPowerScore;

  const changedNations: NationSummary[] = [];
  const nationLen = Math.max(prev.nations.length, next.nations.length);
  for (let i = 0; i < nationLen; i++) {
    const a = prev.nations[i];
    const b = next.nations[i];
    if (!b) continue;
    if (!a) {
      changedNations.push(b);
      continue;
    }
    const critical = !nationCriticalEqual(a, b);
    const soft = includeSoft && !nationSoftEqual(a, b);
    if (critical || soft) changedNations.push(b);
  }
  if (changedNations.length > 0) diff.nations = changedNations;

  const changedProvinces: ProvinceSummary[] = [];
  const provLen = Math.max(prev.provinces.length, next.provinces.length);
  for (let i = 0; i < provLen; i++) {
    const a = prev.provinces[i];
    const b = next.provinces[i];
    if (!b) continue;
    if (!a) {
      changedProvinces.push(b);
      continue;
    }
    const critical = !provinceCriticalEqual(a, b);
    const soft = includeSoft && !provinceSoftEqual(a, b);
    if (critical || soft) changedProvinces.push(b);
  }
  if (changedProvinces.length > 0) diff.provinces = changedProvinces;

  // Heavy wholesale arrays: only on soft refresh / force (caller sets includeSoftProvinces).
  if (includeSoft) {
    if (!stableEqual(prev.market, next.market)) diff.market = next.market;
    if (!stableEqual(prev.wars, next.wars)) diff.wars = next.wars;
    if (!stableEqual(prev.relations, next.relations)) diff.relations = next.relations;
    if (!stableEqual(prev.greatPowers, next.greatPowers)) diff.greatPowers = next.greatPowers;
    if (!stableEqual(prev.armies, next.armies)) diff.armies = next.armies;
    if (!stableEqual(prev.fleets, next.fleets)) diff.fleets = next.fleets;
    if (!stableEqual(prev.rebellions, next.rebellions)) diff.rebellions = next.rebellions;
    // 0.7.0 Concert of Europe
    if (prev.worldTension !== next.worldTension) diff.worldTension = next.worldTension;
    if (!stableEqual(prev.tensionTrace, next.tensionTrace)) diff.tensionTrace = next.tensionTrace;
    if (prev.tensionDecay !== next.tensionDecay) diff.tensionDecay = next.tensionDecay;
    if (prev.tensionNetDelta !== next.tensionNetDelta) diff.tensionNetDelta = next.tensionNetDelta;
    if (prev.crisisCooldownUntil !== next.crisisCooldownUntil) diff.crisisCooldownUntil = next.crisisCooldownUntil;
    if (!stableEqual(prev.activeCrisis, next.activeCrisis)) diff.activeCrisis = next.activeCrisis;
    if (!stableEqual(prev.crisisShowdown, next.crisisShowdown)) diff.crisisShowdown = next.crisisShowdown;
    if (!stableEqual(prev.crisisCandidates, next.crisisCandidates)) diff.crisisCandidates = next.crisisCandidates;
    if (!stableEqual(prev.congressHistory, next.congressHistory)) diff.congressHistory = next.congressHistory;
    // 1.0-U5 chronicle
    if (!stableEqual(prev.chronicle, next.chronicle)) diff.chronicle = next.chronicle;
    if (prev.chronicleWarsFought !== next.chronicleWarsFought) diff.chronicleWarsFought = next.chronicleWarsFought;
  } else {
    // Combat-critical: push wars + units even between soft refreshes.
    if (!stableEqual(prev.wars, next.wars)) {
      diff.wars = next.wars;
      if (!stableEqual(prev.armies, next.armies)) diff.armies = next.armies;
      if (!stableEqual(prev.fleets, next.fleets)) diff.fleets = next.fleets;
    }
    // Crisis state changes are gameplay-critical; always push.
    if (!stableEqual(prev.activeCrisis, next.activeCrisis)) diff.activeCrisis = next.activeCrisis;
    if (!stableEqual(prev.crisisShowdown, next.crisisShowdown)) diff.crisisShowdown = next.crisisShowdown;
  }

  return diff;
}

export function applySharedDiff(base: SharedSnapshot, diff: SharedSnapshotDiff): SharedSnapshot {
  const next: SharedSnapshot = {
    day: diff.day ?? base.day,
    date: diff.date ?? base.date,
    speed: diff.speed ?? base.speed,
    seed: diff.seed !== undefined ? diff.seed : base.seed,
    nations: base.nations.slice(),
    provinces: base.provinces.slice(),
    market: diff.market ?? base.market,
    wars: diff.wars ?? base.wars,
    relations: diff.relations ?? base.relations,
    greatPowers: diff.greatPowers ?? base.greatPowers,
    infamyLimit: diff.infamyLimit ?? base.infamyLimit,
    ninthPowerScore: diff.ninthPowerScore ?? base.ninthPowerScore,
    armies: diff.armies ?? base.armies,
    fleets: diff.fleets ?? base.fleets,
    rebellions: diff.rebellions ?? base.rebellions,
    // 0.7.0 Concert of Europe
    worldTension: diff.worldTension ?? base.worldTension,
    tensionTrace: diff.tensionTrace ?? base.tensionTrace,
    tensionDecay: diff.tensionDecay ?? base.tensionDecay,
    tensionNetDelta: diff.tensionNetDelta ?? base.tensionNetDelta,
    crisisCooldownUntil: diff.crisisCooldownUntil ?? base.crisisCooldownUntil,
    activeCrisis: diff.activeCrisis !== undefined ? diff.activeCrisis : base.activeCrisis,
    crisisShowdown: diff.crisisShowdown !== undefined ? diff.crisisShowdown : base.crisisShowdown,
    crisisCandidates: diff.crisisCandidates ?? base.crisisCandidates,
    congressHistory: diff.congressHistory ?? base.congressHistory,
    // 1.0-U5 chronicle
    chronicle: diff.chronicle ?? base.chronicle,
    chronicleWarsFought: diff.chronicleWarsFought ?? base.chronicleWarsFought,
  };

  if (diff.nations) {
    for (const n of diff.nations) {
      const idx = next.nations.findIndex((x) => x.id === n.id);
      if (idx >= 0) next.nations[idx] = n;
      else next.nations.push(n);
    }
  }
  if (diff.provinces) {
    for (const p of diff.provinces) {
      if (p.id >= 0 && p.id < next.provinces.length) {
        next.provinces[p.id] = p;
      } else {
        const idx = next.provinces.findIndex((x) => x.id === p.id);
        if (idx >= 0) next.provinces[idx] = p;
        else next.provinces.push(p);
      }
    }
  }
  return next;
}

/** Estimate JSON payload bytes (uncompressed). */
export function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Gzip a UTF-8 JSON string. */
export function gzipJson(value: unknown): Uint8Array {
  return gzipSync(strToU8(JSON.stringify(value)), { level: 6 });
}

/** Ungzip bytes into a parsed JSON value. */
export function gunzipJson<T = unknown>(bytes: Uint8Array): T {
  return JSON.parse(strFromU8(gunzipSync(bytes))) as T;
}

/** Wire framing: 0x01 + gzip(json) or plain JSON string. */
export const WIRE_GZIP = 0x01;

export function encodeWire(msg: unknown): Uint8Array | string {
  const json = JSON.stringify(msg);
  // Compress anything larger than ~256 bytes
  if (json.length >= 256) {
    const gz = gzipSync(strToU8(json), { level: 6 });
    const out = new Uint8Array(1 + gz.length);
    out[0] = WIRE_GZIP;
    out.set(gz, 1);
    return out;
  }
  return json;
}

export function decodeWire(data: unknown): unknown {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  let bytes: Uint8Array;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  } else if (data && typeof data === 'object' && 'length' in (data as object)) {
    // Node ws Buffer / Uint8Array-like without ArrayBufferView in some typings
    bytes = Uint8Array.from(data as ArrayLike<number>);
  } else {
    throw new Error('unsupported wire payload');
  }
  if (bytes.length > 0 && bytes[0] === WIRE_GZIP) {
    return gunzipJson(bytes.subarray(1));
  }
  return JSON.parse(strFromU8(bytes));
}

/** Browser-side async decode (Blob from WebSocket). */
export async function decodeWireBrowser(data: unknown): Promise<unknown> {
  if (typeof data === 'string') return JSON.parse(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buf = new Uint8Array(await data.arrayBuffer());
    return decodeWire(buf);
  }
  return decodeWire(data);
}
