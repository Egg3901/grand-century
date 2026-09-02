import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { DEFAULT_SCENARIO, DEFAULT_SCENARIO_ID, loadScenario, type WorldSeedData } from '../data/generated';
import type { GameDate, ScenarioId, World } from '../shared/types';
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
  /** Absent on pre-fingerprint saves — treated as unknown and accepted. */
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
}

function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

/** FNV-1a 32-bit over UTF-16 code units — cheap, deterministic, non-crypto. */
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
 * province count — the things that make old saves paint garbage on a rework.
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
): WorldFingerprint {
  return {
    schemaVersion: WORLD_CONTENT_SCHEMA_VERSION,
    provinceCount: seed.provinceCount,
    seedHash: fnv1aHex(seedIdentityJson(seed)),
    ...(scenarioId ? { scenarioId } : {}),
    ...(startDate ? { startDate } : {}),
  };
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
  // Missing fingerprint = pre-instrumentation save: accept (backward compat).
  // Present-and-different = different world seed / province layout: reject loudly.
  if (
    payload.worldFingerprint != null &&
    !fingerprintsMatch(
      payload.worldFingerprint,
      computeWorldFingerprint(
        loadScenario(payload.world.scenarioId ?? DEFAULT_SCENARIO_ID).worldSeed,
        payload.world.scenarioId ?? DEFAULT_SCENARIO_ID,
        payload.world.startDate ?? DEFAULT_SCENARIO.manifest.startDate,
      ),
    )
  ) {
    throw new Error(
      'This save was made against a different world and cannot be loaded. Start a new campaign instead.',
    );
  }
  const world = payload.world;
  world.scenarioId = world.scenarioId ?? DEFAULT_SCENARIO_ID;
  world.startDate = world.startDate ?? { ...DEFAULT_SCENARIO.manifest.startDate };
  // Optional / self-healing fields (old saves fill in defaults).
  if (!Array.isArray(world.rebellions)) world.rebellions = [];
  if (!Number.isFinite(world.nextRebellionId)) world.nextRebellionId = 1;
  if (!Array.isArray(world.pendingEvents)) world.pendingEvents = [];
  if (!world.eventLastFired || typeof world.eventLastFired !== 'object') world.eventLastFired = {};
  if (!world.decisionLastTaken || typeof world.decisionLastTaken !== 'object') world.decisionLastTaken = {};
  if (!Number.isFinite(world.nextEventInstanceId)) world.nextEventInstanceId = 1;
  for (const state of world.states ?? []) {
    if (!Number.isFinite(state.unrestMonths)) state.unrestMonths = 0;
  }
  importDiplomacyRuntime(world, payload.runtimes?.diplomacy);
  importWarRuntime(world, payload.runtimes?.war);
  return {
    world,
    metadata: {
      version: payload.version,
      createdAt: payload.createdAt,
      day: world.day,
      playerNation: world.playerNation,
    },
  };
}
