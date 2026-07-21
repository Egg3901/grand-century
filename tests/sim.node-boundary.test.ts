/**
 * CI-friendly check: the pure sim must run under Node (session server import path).
 * Fails if src/sim (or its data deps) pull in browser-only globals at import time.
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay, snapshot } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { GAME_DATA } from '../src/data/gameData';

describe('sim Node boundary (MP-M1)', () => {
  it('createWorld / advanceDay / snapshot / applyCommand run in Node', () => {
    expect(typeof window).toBe('undefined');
    const world = createWorld(GAME_DATA, 1836);
    applyCommand(world, GAME_DATA, { t: 'setSpeed', speed: 0 }, () => undefined);
    advanceDay(world, GAME_DATA);
    const snap = snapshot(world, GAME_DATA);
    expect(snap.day).toBe(1);
    expect(snap.nations.length).toBeGreaterThan(10);
    expect(snap.provinces.length).toBe(GAME_DATA.provinceCount);
  });
});
