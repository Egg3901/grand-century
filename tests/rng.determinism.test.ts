import { describe, expect, it } from 'vitest';
import { nextRandom, Rng } from '../src/sim/rng';

describe('rng determinism', () => {
  it('returns same sequence for the same seed', () => {
    const seed = 1836;
    const a = new Rng(seed);
    const b = new Rng(seed);

    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBeCloseTo(b.next(), 12);
    }
  });

  it('nextRandom is stable for fixed state transitions', () => {
    let stateA = 99;
    let stateB = 99;
    for (let i = 0; i < 15; i++) {
      const ra = nextRandom(stateA);
      const rb = nextRandom(stateB);
      expect(ra.value).toBeCloseTo(rb.value, 12);
      expect(ra.state).toBe(rb.state);
      stateA = ra.state;
      stateB = rb.state;
    }
  });
});
