import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

describe('M6 headless performance guardrail', () => {
  it('advances 5 years under wall-clock ceiling', () => {
    const world = createWorld(GAME_DATA, 6603);
    const days = 365 * 5;
    const started = performance.now();
    for (let i = 0; i < days; i++) advanceDay(world, GAME_DATA);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(12_000);
  }, 20_000);
});

