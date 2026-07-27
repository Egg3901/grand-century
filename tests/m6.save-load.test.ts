import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { deserializeWorld, serializeWorld } from '../src/sim/persistence';
import { buildSnapshot } from '../src/sim/snapshot';
import { advanceDay } from '../src/sim/world';

function noopPost() {
  // command sink for deterministic tests
}

function firstForeignNation(world: ReturnType<typeof createWorld>): number {
  return world.nations.find((nation) => nation.id !== world.playerNation)?.id ?? 0;
}

describe('M6 save/load hardening', () => {
  it('save -> load -> advance stays deterministic', () => {
    const baseline = createWorld(GAME_DATA, 6601);
    const resumedSource = createWorld(GAME_DATA, 6601);
    const target = firstForeignNation(baseline);

    applyCommand(baseline, GAME_DATA, { t: 'fabricateCB', target, goal: 'humiliate', state: -1 }, noopPost);
    applyCommand(resumedSource, GAME_DATA, { t: 'fabricateCB', target, goal: 'humiliate', state: -1 }, noopPost);
    for (let i = 0; i < 120; i++) {
      advanceDay(baseline, GAME_DATA);
      advanceDay(resumedSource, GAME_DATA);
    }
    applyCommand(baseline, GAME_DATA, { t: 'declareWar', target, goal: 'humiliate', state: -1 }, noopPost);
    applyCommand(resumedSource, GAME_DATA, { t: 'declareWar', target, goal: 'humiliate', state: -1 }, noopPost);
    for (let i = 0; i < 200; i++) {
      advanceDay(baseline, GAME_DATA);
      advanceDay(resumedSource, GAME_DATA);
    }

    const payload = serializeWorld(resumedSource);
    const { world: resumed } = deserializeWorld(payload);

    for (let i = 0; i < 180; i++) {
      advanceDay(baseline, GAME_DATA);
      advanceDay(resumed, GAME_DATA);
    }

    expect(buildSnapshot(resumed, GAME_DATA)).toEqual(buildSnapshot(baseline, GAME_DATA));
  }, 60_000);
});

