import type { FromWorker, ToWorker, World } from '../../../src/shared/types';
import { GAME_DATA } from '../../../src/data/gameData';
import { createWorld } from '../../../src/sim/bootstrap';
import { advanceDay, snapshot } from '../../../src/sim/world';
import { applyCommand } from '../../../src/sim/commands';
import { detailNation, detailProvince } from '../../../src/sim/detail';

type WorkerScope = {
  onmessage: ((event: { data: ToWorker }) => void) | null;
  postMessage: (message: FromWorker) => void;
};
const scope = self as unknown as WorkerScope;
let world: World | null = null;
let last = Date.now();
let dayAccumulator = 0;
let snapshotAccumulator = 0;
const daysPerSecond = [0, 2, 5, 12, 30, 90];

function post(message: FromWorker) {
  scope.postMessage(message);
}

function publishSnapshot() {
  if (world) post({ t: 'snapshot', snapshot: snapshot(world, GAME_DATA) });
}

function start(seed: number, playerNation?: number) {
  world = createWorld(GAME_DATA, seed);
  if (playerNation !== undefined && world.nations[playerNation]) {
    world.playerNation = playerNation;
    world.nations.forEach((nation) => { nation.isPlayer = nation.id === playerNation; });
  }
  dayAccumulator = 0;
  snapshotAccumulator = 0;
  post({ t: 'ready', data: GAME_DATA });
  publishSnapshot();
}

scope.onmessage = ({ data: message }) => {
  try {
    if (message.t === 'init') {
      start(message.seed);
    } else if (message.t === 'requestProvince') {
      if (world) post({ t: 'provinceDetail', detail: detailProvince(world, GAME_DATA, message.id) });
    } else if (message.t === 'requestNation') {
      if (world) post({ t: 'nationDetail', detail: detailNation(world, GAME_DATA, message.id) });
    } else if (message.t === 'command') {
      if (message.cmd.t === 'newGame') start(message.cmd.seed, message.cmd.playerNation);
      else if (world && !['save', 'load', 'listSaves'].includes(message.cmd.t)) {
        applyCommand(world, GAME_DATA, message.cmd, post);
        publishSnapshot();
      } else if (['save', 'load', 'listSaves'].includes(message.cmd.t)) {
        post({ t: 'log', level: 'warn', msg: 'Native save adapter is not connected yet' });
      }
    }
  } catch (error) {
    post({ t: 'log', level: 'error', msg: error instanceof Error ? error.message : String(error) });
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
    advanceDay(world, GAME_DATA);
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
