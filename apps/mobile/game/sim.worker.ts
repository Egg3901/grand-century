import type { GameData, CampaignMapMode, World } from '../../../src/shared/types';
import { GAME_DATA, gameDataForScenario } from '../../../src/data/gameData';
import { createWorld } from '../../../src/sim/bootstrap';
import { advanceDay, snapshot } from '../../../src/sim/world';
import { applyCommand } from '../../../src/sim/commands';
import { detailNation, detailProvince } from '../../../src/sim/detail';

import type { NativeRequest, NativeResponse } from './nativeProtocol';
import { serializeWorld, deserializeWorld } from '../../../src/sim/persistence';
import { DEFAULT_SCENARIO_ID, loadScenario } from '../../../src/data/generated';
import { resolveWorldSeed } from '../../../src/sim/proceduralWorld';

type WorkerScope = {
  onmessage: ((event: { data: NativeRequest }) => void) | null;
  postMessage: (message: NativeResponse) => void;
};
const scope = self as unknown as WorkerScope;
let world: World | null = null;
let gameData: GameData = GAME_DATA;
let last = Date.now();
let dayAccumulator = 0;
let snapshotAccumulator = 0;
const daysPerSecond = [0, 2, 5, 12, 30, 90];

function post(message: NativeResponse) {
  scope.postMessage(message);
}

function publishSnapshot() {
  if (world) post({ t: 'snapshot', snapshot: snapshot(world, gameData) });
}

function dataFor(scenarioId: string, seed: number, mapMode: CampaignMapMode): GameData {
  const data = gameDataForScenario(scenarioId);
  if (mapMode === 'historical') return data;
  const seedData = resolveWorldSeed(loadScenario(scenarioId).worldSeed, seed, mapMode);
  return { ...data, formables: [], nationCores: Object.fromEntries(seedData.nations.map((n) => [n.tag, n.coreStateIds ?? []])) };
}
function start(seed: number, playerNation?: number, scenarioId = DEFAULT_SCENARIO_ID, mapMode: CampaignMapMode = 'historical') {
  gameData = dataFor(scenarioId, seed, mapMode);
  world = createWorld(gameData, seed, mapMode);
  if (playerNation !== undefined && world.nations[playerNation]) world.playerNation = playerNation;
  world.nations.forEach((nation) => { nation.isPlayer = nation.id === world!.playerNation; });
  world.speed = 0;
  dayAccumulator = 0;
  snapshotAccumulator = 0;
  post({ t: 'ready', data: gameData });
  publishSnapshot();
}

scope.onmessage = ({ data: message }) => {
  try {
    if (message.t === 'exportSave') {
      if (!world) throw new Error('No campaign is open.');
      post({ t: 'exportedSave', request: message.request, payload: Array.from(serializeWorld(world)), snapshot: snapshot(world, gameData) });
    } else if (message.t === 'importSave') {
      const loaded = deserializeWorld(new Uint8Array(message.payload)).world;
      const data = dataFor(loaded.scenarioId ?? DEFAULT_SCENARIO_ID, loaded.seed, loaded.mapMode ?? 'historical');
      world = loaded;
      gameData = data;
      world.speed = 0;
      dayAccumulator = snapshotAccumulator = 0;
      post({ t: 'ready', data: gameData });
      publishSnapshot();
      post({ t: 'importedSave', request: message.request });
    } else if (message.t === 'init') {
      start(message.seed, undefined, message.scenarioId, message.mapMode);
    } else if (message.t === 'requestProvince') {
      if (world) post({ t: 'provinceDetail', detail: detailProvince(world, gameData, message.id) });
    } else if (message.t === 'requestNation') {
      if (world) post({ t: 'nationDetail', detail: detailNation(world, gameData, message.id) });
    } else if (message.t === 'command') {
      if (message.cmd.t === 'newGame') start(message.cmd.seed, message.cmd.playerNation, message.cmd.scenarioId, message.cmd.mapMode);
      else if (world && !['save', 'load', 'listSaves'].includes(message.cmd.t)) {
        applyCommand(world, gameData, message.cmd, post);
        publishSnapshot();
      } else if (['save', 'load', 'listSaves'].includes(message.cmd.t)) {
        post({ t: 'log', level: 'warn', msg: 'Use the campaign save library.' });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if ('request' in message) post({ t: 'storageError', request: message.request, message: reason });
    else post({ t: 'log', level: 'error', msg: reason });
  }
};

setInterval(() => {
  const now = Date.now();
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!world || world.speed === 0) return;
  dayAccumulator += elapsed * daysPerSecond[world.speed];
  let advanced = 0;
  while (dayAccumulator >= 1 && advanced < 400) {
    advanceDay(world, gameData);
    dayAccumulator -= 1;
    advanced += 1;
  }
  if (!advanced) return;
  snapshotAccumulator += elapsed;
  if (snapshotAccumulator >= 0.125) {
    publishSnapshot();
    snapshotAccumulator = 0;
  }
}, 33);
