#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHistoricalWorld } from '../content/history/compileHistoricalWorld.mjs';
import { buildNationalBorders } from './lib/national-borders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = path.join(root, 'src/data/generated/worldSeed.json');
const provincesPath = path.join(root, 'src/data/generated/provinces.geo.json');
const bordersPath = path.join(root, 'src/data/generated/nationalBorders.geo.json');
const historyPath = path.join(root, 'content/history/1830');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const [seed, polities, ownership, anchors, provincesGeo] = await Promise.all([
  readJson(seedPath),
  readJson(path.join(historyPath, 'polities.json')),
  readJson(path.join(historyPath, 'ownership.json')),
  readJson(path.join(historyPath, 'anchors.json')),
  readJson(provincesPath),
]);
const compiled = compileHistoricalWorld(seed, polities, ownership, anchors);
const output = `${JSON.stringify(compiled)}\n`;
const bordersOutput = `${JSON.stringify(buildNationalBorders(provincesGeo, compiled))}\n`;

if (process.argv.includes('--check')) {
  const [current, currentBorders] = await Promise.all([
    readFile(seedPath, 'utf8'),
    readFile(bordersPath, 'utf8'),
  ]);
  if (current !== output || currentBorders !== bordersOutput) {
    console.error('[history] generated map data is stale; run npm run map:history');
    process.exitCode = 1;
  } else {
    console.log('[history] generated map data matches the checked-in 1830 data');
  }
} else {
  await Promise.all([
    writeFile(seedPath, output, 'utf8'),
    writeFile(bordersPath, bordersOutput, 'utf8'),
  ]);
  console.log(`[history] applied 1830 data to ${compiled.provinces.length} provinces and ${compiled.nations.length} polities`);
}
