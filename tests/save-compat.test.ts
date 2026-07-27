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
});
