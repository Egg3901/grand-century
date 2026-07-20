import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

describe('M6 headless performance guardrail', () => {
  it('keeps median 5-year sim time under a generous ceiling', () => {
    const days = 365 * 5;
    const runs: number[] = [];

    for (let run = 0; run < 3; run++) {
      const world = createWorld(GAME_DATA, 6603 + run);
      const started = performance.now();
      for (let i = 0; i < days; i++) advanceDay(world, GAME_DATA);
      runs.push(performance.now() - started);
    }

    const sorted = runs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? 0;
    const worst = sorted[sorted.length - 1] ?? median;
    expect(median).toBeLessThan(14_000);
    expect(worst).toBeLessThan(22_000);
  }, 60_000);
});

