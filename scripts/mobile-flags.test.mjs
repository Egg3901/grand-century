import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("every playable native country has a bundled 3:2 flag", async () => {
  const world = JSON.parse(
    await readFile(
      new URL("apps/mobile/assets/game/worldSeed.json", root),
      "utf8",
    ),
  );
  const registry = await readFile(
    new URL("apps/mobile/game/nationFlags.ts", root),
    "utf8",
  );
  for (const { tag } of world.nations) {
    assert.ok(registry.includes(`require('../assets/flags/${tag}.png')`), tag);
    const png = await readFile(
      new URL(`apps/mobile/assets/flags/${tag}.png`, root),
    );
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
      tag,
    );
    assert.equal(png.readUInt32BE(16), 144, tag);
    assert.equal(png.readUInt32BE(20), 96, tag);
  }
});
