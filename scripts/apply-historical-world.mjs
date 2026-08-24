#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHistoricalWorld } from '../content/history/compileHistoricalWorld.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = path.join(root, 'src/data/generated/worldSeed.json');
const historyPath = path.join(root, 'content/history/1820');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const [seed, polities, ownership, anchors] = await Promise.all([
  readJson(seedPath),
  readJson(path.join(historyPath, 'polities.json')),
  readJson(path.join(historyPath, 'ownership.json')),
  readJson(path.join(historyPath, 'anchors.json')),
]);
const compiled = compileHistoricalWorld(seed, polities, ownership, anchors);
const output = `${JSON.stringify(compiled)}\n`;

if (process.argv.includes('--check')) {
  const current = await readFile(seedPath, 'utf8');
  if (current !== output) {
    console.error('[history] generated worldSeed.json is stale; run npm run map:history');
    process.exitCode = 1;
  } else {
    console.log('[history] generated world seed matches the checked-in 1820 data');
  }
} else {
  await writeFile(seedPath, output, 'utf8');
  console.log(`[history] applied 1820 data to ${compiled.provinces.length} provinces and ${compiled.nations.length} polities`);
}
