/**
 * Save compatibility: worldFingerprint instrumentation (H2).
 *
 * Fixtures live in tests/fixtures/. Regenerate / add a new one per release with:
 *   npx tsx scripts/generate-save-fixture.ts tests/fixtures/<name>.save.gz
 *   npx tsx scripts/generate-save-fixture.ts tests/fixtures/<name>-legacy.save.gz --legacy
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import {
  computeWorldFingerprint,
  deserializeWorld,
  serializeWorld,
} from '../src/sim/persistence';
import { buildSnapshot } from '../src/sim/snapshot';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

describe('save fingerprint + compat', () => {
  it('loads a pre-fingerprint fixture (missing worldFingerprint)', () => {
    const buffer = loadFixture('pre-fingerprint-v1.save.gz');
    const json = strFromU8(gunzipSync(buffer));
    const payload = JSON.parse(json) as { worldFingerprint?: unknown; world?: { day?: number } };
    expect(payload.worldFingerprint).toBeUndefined();

    const { world, metadata } = deserializeWorld(buffer);
    expect(world.day).toBe(payload.world?.day);
    expect(metadata.version).toBe(1);
    expect(world.provinces.length).toBe(GAME_DATA.provinceCount);
  });

  it('round-trip save→load produces an identical snapshot', () => {
    const world = createWorld(GAME_DATA, 4242);
    const before = buildSnapshot(world, GAME_DATA);
    const { world: loaded } = deserializeWorld(serializeWorld(world));
    expect(buildSnapshot(loaded, GAME_DATA)).toEqual(before);
  });

  it('rejects a hand-mutated fingerprint with a world-mismatch message', () => {
    const world = createWorld(GAME_DATA, 4242);
    const bytes = serializeWorld(world);
    const payload = JSON.parse(strFromU8(gunzipSync(bytes))) as {
      worldFingerprint: { schemaVersion: number; provinceCount: number; seedHash: string };
      world: unknown;
      version: number;
      createdAt: number;
      runtimes: unknown;
    };
    expect(payload.worldFingerprint).toBeDefined();
    payload.worldFingerprint = {
      ...payload.worldFingerprint,
      seedHash: 'deadbeef',
    };
    const mutated = gzipSync(strToU8(JSON.stringify(payload)));

    expect(() => deserializeWorld(mutated)).toThrow(/different world/i);
    expect(() => deserializeWorld(mutated)).not.toThrow(/corrupted/i);
  });

  it('computeWorldFingerprint is deterministic', () => {
    const a = computeWorldFingerprint();
    const b = computeWorldFingerprint();
    expect(a).toEqual(b);
    expect(a.provinceCount).toBe(GAME_DATA.provinceCount);
    expect(a.schemaVersion).toBe(1);
    expect(a.seedHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('loads a current-code fixture that includes worldFingerprint', () => {
    const buffer = loadFixture('current-v1.save.gz');
    const payload = JSON.parse(strFromU8(gunzipSync(buffer))) as {
      worldFingerprint?: ReturnType<typeof computeWorldFingerprint>;
    };
    expect(payload.worldFingerprint).toEqual(computeWorldFingerprint());
    expect(() => deserializeWorld(buffer)).not.toThrow();
  });

  it('normalizes missing migration_policy to level 1 on legacy saves', () => {
    // Build a fresh world and serialize it.
    const world = createWorld(GAME_DATA, 9901);
    const bytes = serializeWorld(world);

    // Mutate the payload: strip migration_policy from every nation, but set
    // one nation to explicit closed-borders (0) to prove we do NOT overwrite
    // an explicitly saved value.
    const payload = JSON.parse(strFromU8(gunzipSync(bytes))) as {
      world: { nations: { reforms: Record<string, number> }[] };
      worldFingerprint: unknown;
      version: number;
      createdAt: number;
      runtimes: unknown;
    };
    const nations = payload.world.nations;
    // Pick the first nation to keep an explicit 0.
    const explicitClosed = nations[0];
    explicitClosed.reforms.migration_policy = 0;
    // Strip migration_policy from all remaining nations.
    for (let i = 1; i < nations.length; i++) {
      delete nations[i].reforms.migration_policy;
    }
    const mutated = gzipSync(strToU8(JSON.stringify(payload)));

    // Deserialize and verify normalization.
    const { world: loaded } = deserializeWorld(mutated);
    // Explicit 0 must be preserved.
    expect(loaded.nations[0].reforms.migration_policy).toBe(0);
    // All others must receive the campaign default of 1.
    for (let i = 1; i < loaded.nations.length; i++) {
      expect(loaded.nations[i].reforms.migration_policy).toBe(1);
    }
  });
});
