import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { World } from '../shared/types';
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

interface SavePayload {
  version: number;
  createdAt: number;
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

export function serializeWorld(world: World): Uint8Array {
  const payload: SavePayload = {
    version: SAVE_VERSION,
    createdAt: Date.now(),
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
  if (!payload || payload.version !== SAVE_VERSION || !payload.world) {
    throw new Error('Unsupported or corrupted save payload.');
  }
  const world = payload.world;
  if (!Array.isArray(world.rebellions)) world.rebellions = [];
  if (!Number.isFinite(world.nextRebellionId)) world.nextRebellionId = 1;
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

