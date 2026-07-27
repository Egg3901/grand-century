/**
 * Generate a gzipped save fixture for save-compat tests.
 *
 * Usage:
 *   npx tsx scripts/generate-save-fixture.ts
 *   npx tsx scripts/generate-save-fixture.ts tests/fixtures/current-v1.save.gz
 *   npx tsx scripts/generate-save-fixture.ts tests/fixtures/pre-fingerprint-v1.save.gz --legacy
 *
 * --legacy strips `worldFingerprint` so the blob matches saves written before
 * H2 instrumentation. Use once per release when adding a new fixture.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { serializeWorld } from '../src/sim/persistence';

const FIXTURE_SEED = 1836;
const DEFAULT_OUT = 'tests/fixtures/current-v1.save.gz';

function main(): void {
  const args = process.argv.slice(2);
  const legacy = args.includes('--legacy');
  const outArg = args.find((a) => !a.startsWith('--'));
  const outPath = resolve(outArg ?? DEFAULT_OUT);

  const world = createWorld(GAME_DATA, FIXTURE_SEED);
  let bytes = serializeWorld(world);

  // Normalize envelope so re-runs don't churn the binary for timestamps.
  const payload = JSON.parse(strFromU8(gunzipSync(bytes))) as Record<string, unknown>;
  payload.createdAt = 0;
  if (legacy) {
    delete payload.worldFingerprint;
  }
  bytes = gzipSync(strToU8(JSON.stringify(payload)));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.byteLength} bytes)${legacy ? ' [legacy, no fingerprint]' : ''}`);
}

main();
