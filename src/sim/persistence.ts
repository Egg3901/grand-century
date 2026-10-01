import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { DEFAULT_SCENARIO, DEFAULT_SCENARIO_ID, loadScenario, type WorldSeedData } from '../data/generated';
import type { GameDate, ScenarioId, World, WorldMigrationReport } from '../shared/types';
import {
  LEGACY_MIGRATABLE_SCENARIOS,
  LEGACY_PROVINCE_COUNT,
  LEGACY_WORLD_SEED,
  migrateLegacySave,
} from './legacyMigration';
import {
  exportDiplomacyRuntime,
  importDiplomacyRuntime,
  type DiplomacyRuntimeSnapshot,
} from './systems/diplomacy';
import {
  exportWarRuntime,
  importWarRuntime,
  type WarRuntimeSnapshot,
} from './systems/war';

const SAVE_VERSION = 1;

/**
 * Content-schema version baked into world fingerprints. Distinct from SAVE_VERSION:
 * bump this when the *meaning* of seed fields in the fingerprint changes, so a
 * future denser-province release can reject older fingerprints loudly.
 */
export const WORLD_CONTENT_SCHEMA_VERSION = 2;

/**
 * Schema version the legacy 387-province world's saves were fingerprinted with.
 * Pinned separately so a future WORLD_CONTENT_SCHEMA_VERSION bump still
 * recognizes (and migrates) those saves.
 */
export const LEGACY_WORLD_SCHEMA_VERSION = 2;

/** Identity of the static world seed a save was written against. */
export interface WorldFingerprint {
  schemaVersion: number;
  provinceCount: number;
  /** Non-cryptographic FNV-1a hex of stable seed identity fields. */
  seedHash: string;
  scenarioId?: ScenarioId;
  startDate?: GameDate;
}

interface SavePayload {
  version: number;
  createdAt: number;
  /** Absent on pre-fingerprint saves: accepted when the map size matches, migrated when it is the legacy 387-province map. */
  worldFingerprint?: WorldFingerprint;
  world: World;
  runtimes: {
    diplomacy: DiplomacyRuntimeSnapshot;
    war: WarRuntimeSnapshot;
  };
}

export interface SaveMetadata {
  version: number;
  createdAt: number;
  day: number;
  playerNation: number;
  /** Set when the save was written against an older world map and migrated on load. */
  migratedFrom?: string;
  migration?: WorldMigrationReport;
}

function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

/** FNV-1a 32-bit over UTF-16 code units: cheap, deterministic, non-crypto. */
function fnv1aHex(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical seed identity used for hashing. Omits display-only / float-heavy
 * fields (names, lon/lat, colors) so the hash tracks ownership topology and
 * province count, the things that make old saves paint garbage on a rework.
 */
function seedIdentityJson(seed: WorldSeedData): string {
  return JSON.stringify({
    source: seed.source,
    provinceCount: seed.provinceCount,
    provinces: seed.provinces.map((p) => [
      p.id,
      p.ownerTag,
      p.stateId,
      p.terrain,
      p.coastal ? 1 : 0,
      p.rgoGood,
      p.neighbors,
      p.populationWeight,
    ]),
    states: seed.states.map((s) => [s.id, s.ownerTag, s.provinceIds]),
    nations: seed.nations.map((n) => [
      n.tag,
      n.capitalProvinceId,
      n.primaryCulture,
      n.religion ?? null,
      n.government,
      n.polityStatus ?? 'sovereign',
      n.overlordTag ?? null,
      (n.coreStateIds ?? []).slice().sort((a, b) => a - b),
    ]),
    formables: (seed.formables ?? []).map((f) => [
      f.key,
      f.resultTag,
      f.candidateTags.slice().sort(),
      f.coreStateIds.slice().sort((a, b) => a - b),
      f.requiredCoreShare,
      f.requireIndependent ? 1 : 0,
      f.requireGreatPower ? 1 : 0,
    ]),
  });
}

/**
 * Compute the world fingerprint for a seed (defaults to the shipped WORLD_SEED).
 * Deterministic across runs; safe to call from tests and save serialization.
 */
export function computeWorldFingerprint(
  seed: WorldSeedData = DEFAULT_SCENARIO.worldSeed,
  scenarioId?: ScenarioId,
  startDate?: GameDate,
  schemaVersion: number = WORLD_CONTENT_SCHEMA_VERSION,
): WorldFingerprint {
  return {
    schemaVersion,
    provinceCount: seed.provinceCount,
    seedHash: fnv1aHex(seedIdentityJson(seed)),
    ...(scenarioId ? { scenarioId } : {}),
    ...(startDate ? { startDate } : {}),
  };
}

let legacyFingerprintCache: Map<string, WorldFingerprint> | null = null;

/** Fingerprint of the legacy 387-province world for a scenario, as its saves recorded it. */
export function computeLegacyWorldFingerprint(scenarioId: ScenarioId, startDate: GameDate): WorldFingerprint {
  legacyFingerprintCache ??= new Map();
  const key = `${scenarioId}|${JSON.stringify(startDate)}`;
  let fingerprint = legacyFingerprintCache.get(key);
  if (!fingerprint) {
    fingerprint = computeWorldFingerprint(LEGACY_WORLD_SEED, scenarioId, startDate, LEGACY_WORLD_SCHEMA_VERSION);
    legacyFingerprintCache.set(key, fingerprint);
  }
  return fingerprint;
}

/** True when a payload was written against the legacy 387-province world. */
function isLegacyWorldPayload(payload: SavePayload): boolean {
  const scenarioId = payload.world.scenarioId ?? DEFAULT_SCENARIO_ID;
  if (!LEGACY_MIGRATABLE_SCENARIOS.includes(scenarioId)) return false;
  if (payload.worldFingerprint == null) {
    return payload.world.provinces?.length === LEGACY_PROVINCE_COUNT;
  }
  const startDate = payload.world.startDate ?? DEFAULT_SCENARIO.manifest.startDate;
  return fingerprintsMatch(payload.worldFingerprint, computeLegacyWorldFingerprint(scenarioId, startDate));
}

/** Fill optional fields older saves may lack. Idempotent. */
function healWorld(world: World): void {
  world.scenarioId = world.scenarioId ?? DEFAULT_SCENARIO_ID;
  world.startDate = world.startDate ?? { ...DEFAULT_SCENARIO.manifest.startDate };
  if (!Array.isArray(world.rebellions)) world.rebellions = [];
  if (!Number.isFinite(world.nextRebellionId)) world.nextRebellionId = 1;
  if (!Array.isArray(world.pendingEvents)) world.pendingEvents = [];
  if (!world.eventLastFired || typeof world.eventLastFired !== 'object') world.eventLastFired = {};
  if (!world.decisionLastTaken || typeof world.decisionLastTaken !== 'object') world.decisionLastTaken = {};
  if (!Number.isFinite(world.nextEventInstanceId)) world.nextEventInstanceId = 1;
  for (const state of world.states ?? []) {
    if (!Number.isFinite(state.unrestMonths)) state.unrestMonths = 0;
  }
}

function fingerprintsMatch(a: WorldFingerprint, b: WorldFingerprint): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.provinceCount === b.provinceCount &&
    a.seedHash === b.seedHash &&
    (a.scenarioId === undefined || a.scenarioId === b.scenarioId) &&
    (a.startDate === undefined || JSON.stringify(a.startDate) === JSON.stringify(b.startDate))
  );
}

export function serializeWorld(world: World): Uint8Array {
  const scenarioId = world.scenarioId ?? DEFAULT_SCENARIO_ID;
  const payload: SavePayload = {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    worldFingerprint: computeWorldFingerprint(
      loadScenario(scenarioId).worldSeed,
      scenarioId,
      world.startDate ?? DEFAULT_SCENARIO.manifest.startDate,
    ),
    world: cloneWorld(world),
    runtimes: {
      diplomacy: exportDiplomacyRuntime(world),
      war: exportWarRuntime(world),
    },
  };
  return gzipSync(strToU8(JSON.stringify(payload)));
}

export function deserializeWorld(buffer: Uint8Array): { world: World; metadata: SaveMetadata } {
  const json = strFromU8(gunzipSync(buffer));
  const payload = JSON.parse(json) as SavePayload;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unsupported or corrupted save payload.');
  }
  if (payload.version !== SAVE_VERSION) {
    throw new Error(
      'Unsupported save version. This save was made with a different game version and cannot be loaded.',
    );
  }
  if (!payload.world) {
    throw new Error('Unsupported or corrupted save payload.');
  }
  const scenarioId = payload.world.scenarioId ?? DEFAULT_SCENARIO_ID;
  const currentFingerprint = computeWorldFingerprint(
    loadScenario(scenarioId).worldSeed,
    scenarioId,
    payload.world.startDate ?? DEFAULT_SCENARIO.manifest.startDate,
  );
  const current = payload.worldFingerprint != null
    ? fingerprintsMatch(payload.worldFingerprint, currentFingerprint)
    // Pre-fingerprint save: accept it only if its map is the shipped map's size.
    : payload.world.provinces?.length === currentFingerprint.provinceCount;

  let world = payload.world;
  let runtimes = payload.runtimes;
  let migration: WorldMigrationReport | undefined;
  if (!current) {
    // Saves from the 387-province 1830 world (before world v8) are migrated onto
    // the shipped map; saves from any other world are rejected loudly.
    if (!isLegacyWorldPayload(payload)) {
      throw new Error(
        'This save was made against a different world and cannot be loaded. Start a new campaign instead.',
      );
    }
    healWorld(world);
    const migrated = migrateLegacySave(world, runtimes ?? {});
    world = migrated.world;
    runtimes = migrated.runtimes;
    migration = migrated.report;
  }
  healWorld(world);
  importDiplomacyRuntime(world, runtimes?.diplomacy);
  importWarRuntime(world, runtimes?.war);
  return {
    world,
    metadata: {
      version: payload.version,
      createdAt: payload.createdAt,
      day: world.day,
      playerNation: world.playerNation,
      ...(migration ? { migratedFrom: migration.from, migration } : {}),
    },
  };
}
