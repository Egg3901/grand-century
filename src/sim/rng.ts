/**
 * Deterministic seeded PRNG (mulberry32). The sim threads its rng state through
 * the World so saves/replays reproduce exactly (master doc §4.1, §10).
 * NEVER use Math.random() in sim code.
 */

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t >>> 0 };
}

/** Stateful convenience wrapper for use inside a single tick. */
export class Rng {
  constructor(public state: number) {}
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }
  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length)];
  }
}
