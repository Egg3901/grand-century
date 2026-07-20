/**
 * Worker entry — the sim runs entirely off the main thread (master doc §4).
 * Receives Commands, runs a fixed-timestep tick loop, and posts snapshots.
 * Imports nothing from the DOM or UI.
 */

/// <reference lib="webworker" />
import type { FromWorker, ToWorker, World, GameData, Command } from '../shared/types';
import { advanceDay, snapshot } from '../sim/world';
import { createWorld } from '../sim/bootstrap';
import { applyCommand } from '../sim/commands';
import { GAME_DATA } from '../data/gameData';
import { detailProvince, detailNation } from '../sim/detail';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let data: GameData = GAME_DATA;
let world: World | null = null;
let acc = 0;

// days advanced per real second at each speed
const SPEED_DAYS_PER_SEC = [0, 2, 5, 12, 30, 90];

function post(m: FromWorker) {
  ctx.postMessage(m);
}

function tick(dtSeconds: number) {
  if (!world) return;
  if (world.speed > 0) {
    acc += dtSeconds * SPEED_DAYS_PER_SEC[world.speed];
    let steps = 0;
    while (acc >= 1 && steps < 400) {
      advanceDay(world, data);
      acc -= 1;
      steps++;
    }
  }
  post({ t: 'snapshot', snapshot: snapshot(world, data) });
}

// drive the loop at ~30fps of sim/snapshot cadence
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
    case 'init':
      world = createWorld(data, msg.seed);
      post({ t: 'ready', data });
      post({ t: 'snapshot', snapshot: snapshot(world, data) });
      break;
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
    world = createWorld(data, cmd.seed);
    world.playerNation = cmd.playerNation;
    post({ t: 'snapshot', snapshot: snapshot(world, data) });
    return;
  }
  applyCommand(world, data, cmd, post);
}

scheduleNext();
