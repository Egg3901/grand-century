/**
 * Worker entry — the sim runs entirely off the main thread (master doc §4).
 * Receives Commands, runs a fixed-timestep tick loop, and posts snapshots.
 * Imports nothing from the DOM or UI.
 *
 * Snapshot cadence (perf P0 / MP-M4):
 * - Do NOT post while paused/unchanged.
 * - Post immediately when a command changes state.
 * - Cap running cadence to ~8 Hz regardless of tick speed.
 */

/// <reference lib="webworker" />
import type { FromWorker, ToWorker, World, GameData, Command, CampaignMapMode } from '../shared/types';
import { advanceDay, snapshot } from '../sim/world';
import { createWorld } from '../sim/bootstrap';
import { applyCommand } from '../sim/commands';
import { GAME_DATA } from '../data/gameData';
import { detailProvince, detailNation } from '../sim/detail';
import { deserializeWorld, serializeWorld } from '../sim/persistence';
import { listSaveSlots, readSaveSlot, writeSaveSlot } from './saveSlots';
import { DEFAULT_CAMPAIGN_MAP_MODE, parseCampaignMapMode } from '../shared/campaignMap';
import { resolveWorldSeed } from '../sim/proceduralWorld';
import { WORLD_SEED } from '../data/generated';
import { yearAtDay } from '../sim/calendar';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let data: GameData = GAME_DATA;
let world: World | null = null;
let acc = 0;
let lastAutosaveYear = -1;
let saveBusy = false;

/** Cap UI snapshot rate while the clock is running (smooth, not 30 Hz). */
const SNAPSHOT_HZ = 8;
const SNAPSHOT_MIN_INTERVAL = 1 / SNAPSHOT_HZ;

let pendingSnapshot = false;
let snapshotAcc = 0;

// days advanced per real second at each speed
const SPEED_DAYS_PER_SEC = [0, 2, 5, 12, 30, 90];

function post(m: FromWorker) {
  ctx.postMessage(m);
}

function gameDataForMapMode(mapMode: CampaignMapMode, seed: number): GameData {
  if (mapMode === 'historical') return GAME_DATA;
  const worldSeed = resolveWorldSeed(WORLD_SEED, seed, mapMode);
  return {
    ...GAME_DATA,
    formables: [],
    nationCores: Object.fromEntries(
      worldSeed.nations.map((nation) => [nation.tag, (nation.coreStateIds ?? []).slice()]),
    ),
  };
}

function yearFromDay(day: number): number {
  return yearAtDay(day, world?.startDate ?? data.startDate);
}

function startWorld(seed: number, mapMode: CampaignMapMode, playerNation?: number): void {
  data = gameDataForMapMode(mapMode, seed);
  world = createWorld(data, seed, mapMode);
  if (playerNation !== undefined && world.nations[playerNation]) {
    world.playerNation = playerNation;
  }
  const active = world.playerNation;
  world.nations.forEach((nation) => {
    nation.isPlayer = nation.id === active;
  });
  lastAutosaveYear = yearFromDay(world.day);
}

function postSnapshotNow() {
  if (!world) return;
  post({ t: 'snapshot', snapshot: snapshot(world, data) });
  pendingSnapshot = false;
  snapshotAcc = 0;
}

async function publishSaveSlots() {
  const slots = await listSaveSlots();
  post({ t: 'saveSlots', slots });
}

async function saveCurrentWorld(slot: string, action: 'save' | 'autosave') {
  if (!world || saveBusy) return;
  saveBusy = true;
  try {
    const payload = serializeWorld(world);
    await writeSaveSlot(slot, payload, world.day, world.playerNation, world.scenarioId, world.startDate);
    post({ t: 'saveStatus', action, slot, ok: true, msg: `${action} complete` });
    await publishSaveSlots();
  } catch (error) {
    post({
      t: 'saveStatus',
      action,
      slot,
      ok: false,
      msg: error instanceof Error ? error.message : 'save failed',
    });
  } finally {
    saveBusy = false;
  }
}

async function loadWorldFromSlot(slot: string) {
  if (saveBusy) return;
  saveBusy = true;
  try {
    const payload = await readSaveSlot(slot);
    if (!payload) {
      post({ t: 'saveStatus', action: 'load', slot, ok: false, msg: 'slot not found' });
      return;
    }
    const loaded = deserializeWorld(payload);
    world = loaded.world;
    if (!world.mapMode) world.mapMode = DEFAULT_CAMPAIGN_MAP_MODE;
    data = gameDataForMapMode(world.mapMode, world.seed);
    data = {
      ...data,
      scenarioId: world.scenarioId ?? data.scenarioId,
      startDate: world.startDate ?? data.startDate,
    };
    lastAutosaveYear = yearFromDay(world.day);
    postSnapshotNow();
    post({ t: 'saveStatus', action: 'load', slot, ok: true, msg: 'load complete' });
    await publishSaveSlots();
  } catch (error) {
    post({
      t: 'saveStatus',
      action: 'load',
      slot,
      ok: false,
      msg: error instanceof Error ? error.message : 'load failed',
    });
  } finally {
    saveBusy = false;
  }
}

function tick(dtSeconds: number) {
  if (!world) return;
  let steps = 0;
  if (world.speed > 0) {
    acc += dtSeconds * SPEED_DAYS_PER_SEC[world.speed];
    while (acc >= 1 && steps < 400) {
      advanceDay(world, data);
      acc -= 1;
      steps++;
    }
  }
  const year = yearFromDay(world.day);
  if (world.day > 0 && world.day % 365 === 0 && year !== lastAutosaveYear) {
    lastAutosaveYear = year;
    const autosaveSlot = `autosave-${(year % 3) + 1}`;
    void saveCurrentWorld(autosaveSlot, 'autosave');
  }

  // Only schedule a snapshot when the world actually advanced.
  if (steps > 0) pendingSnapshot = true;

  if (!pendingSnapshot) return;
  snapshotAcc += dtSeconds;
  if (snapshotAcc >= SNAPSHOT_MIN_INTERVAL) {
    postSnapshotNow();
  }
}

// drive the loop at ~30 Hz for sim accumulation; snapshots are cadence-capped
let last = 0;
function loop(now: number) {
  const dt = last ? (now - last) / 1000 : 0;
  last = now;
  tick(Math.min(dt, 0.1));
  scheduleNext();
}
function scheduleNext() {
  // requestAnimationFrame isn't available in workers; use a timer at ~33ms
  setTimeout(() => loop(performance.now()), 33);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.t) {
    case 'init': {
      const mapMode = parseCampaignMapMode(msg.mapMode);
      startWorld(msg.seed, mapMode);
      post({ t: 'ready', data });
      postSnapshotNow();
      void publishSaveSlots();
      break;
    }
    case 'command':
      if (world) handleCommand(msg.cmd);
      break;
    case 'requestProvince':
      if (world) post({ t: 'provinceDetail', detail: detailProvince(world, data, msg.id) });
      break;
    case 'requestNation':
      if (world) post({ t: 'nationDetail', detail: detailNation(world, data, msg.id) });
      break;
  }
};

function handleCommand(cmd: Command) {
  if (!world) return;
  if (cmd.t === 'newGame') {
    const mapMode = parseCampaignMapMode(cmd.mapMode);
    startWorld(cmd.seed, mapMode, cmd.playerNation);
    postSnapshotNow();
    return;
  }
  if (cmd.t === 'save') {
    void saveCurrentWorld(cmd.slot, 'save');
    return;
  }
  if (cmd.t === 'load') {
    void loadWorldFromSlot(cmd.slot);
    return;
  }
  if (cmd.t === 'listSaves') {
    void publishSaveSlots();
    return;
  }
  applyCommand(world, data, cmd, post);
  // Command changed state — push immediately so pause/tax/etc. feel responsive.
  postSnapshotNow();
}

scheduleNext();

/** Test hooks (Node unit tests import this module via vitest). */
export const __test = {
  get pendingSnapshot() { return pendingSnapshot; },
  postSnapshotNow,
};
