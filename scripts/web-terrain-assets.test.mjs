import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitHighTerrain, PAGES_ASSET_LIMIT } from './web-terrain-assets.ts';

test('shipped High atlas retains exact compressed data in Pages-sized assets', () => {
  const packed = JSON.parse(fs.readFileSync(new URL('../src/graphics/terrain-atlas-high.json', import.meta.url)));
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) > PAGES_ASSET_LIMIT);
  const { metadata, assets } = splitHighTerrain(packed);
  const restored = { ...metadata, ...Object.fromEntries(assets.map(a => [a.field, a.source])) };
  assert.deepEqual(restored, packed);
  assert.equal(assets.length, 4);
  assert.equal(new Set(assets.map(a => a.fileName)).size, 4);
  assert.ok(assets.every(a => a.bytes <= PAGES_ASSET_LIMIT));
});

test('reject missing fields and future oversized fields before upload', () => {
  const packed = { size: 4096, height: 'abc', surface: 'def', normals: 'ghi', province: 'jkl' };
  assert.throws(() => splitHighTerrain({ ...packed, surface: null }), /Missing terrain field/);
  assert.throws(() => splitHighTerrain({ ...packed, surface: 'x'.repeat(PAGES_ASSET_LIMIT + 1) }), /exceeds/);
});
