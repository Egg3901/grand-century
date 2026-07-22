/**
 * Determinism probe (perf-audit safety net, not a normal test).
 * Runs seeded centuries and hashes the resulting world so behaviour-preserving
 * refactors can be proven identical. Run with: tsx tests/determinism.probe.ts
 */
import { createHash } from 'node:crypto';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import { buildSnapshot } from '../src/sim/snapshot';

const SEEDS = [1836, 4711, 90210];
const DAYS = 3650 * 4; // ~40 years, exercises wars/rebellions/colonies

function hashWorld(seed: number): { state: string; snap: string } {
  const world = createWorld(GAME_DATA, seed);
  // give the player nation to a mid-size AI so war/mobilization paths fire
  for (let d = 0; d < DAYS; d++) advanceDay(world, GAME_DATA);

  // A compact but wide fingerprint of dynamic state.
  const fp = {
    day: world.day,
    rng: world.rngState,
    nations: world.nations.map((n) => [
      n.treasury.toFixed(2), n.prestige.toFixed(2), n.infamy.toFixed(3),
      n.gpRank, n.techs.length,
    ]),
    provinces: world.provinces.map((p) => [p.owner, p.controller ?? -1, p.popIds.length]),
    pops: world.pops.length,
    wars: world.wars.map((w) => [w.id, w.attackers.join(','), w.defenders.join(','), Math.round(w.score ?? 0)]),
    relationsLen: world.relations?.length ?? 0,
    rebellions: (world.rebellions ?? []).length,
  };
  const state = createHash('sha1').update(JSON.stringify(fp)).digest('hex');
  const snap = createHash('sha1').update(JSON.stringify(buildSnapshot(world, GAME_DATA))).digest('hex');
  return { state, snap };
}

for (const seed of SEEDS) {
  const { state, snap } = hashWorld(seed);
  console.log(`seed ${seed}\tstate=${state}\tsnap=${snap}`);
}
