#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileScenarioSeed, writeScenarioSeed } from '../content/sources/seed/compiler.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

const args = process.argv.slice(2);
const scenarioDir = option(args, '--scenario-dir');
const baseSeedPath = option(args, '--base-seed');
const outputDir = option(args, '--out-dir');
if (args[0] !== 'compile' || !scenarioDir || !baseSeedPath || !outputDir) {
  throw new Error('Usage: node scripts/scenario-seed.mjs compile --scenario-dir DIR --base-seed FILE --out-dir DIR');
}
const resolvedScenarioDir = path.resolve(scenarioDir);
const result = compileScenarioSeed({
  baseSeed: await readJson(path.resolve(baseSeedPath)),
  roster: await readJson(path.join(resolvedScenarioDir, 'polities.json')),
  relationships: await readJson(path.join(resolvedScenarioDir, 'relationships.json')),
  compiledBorders: await readJson(path.join(resolvedScenarioDir, 'compiled/world-borders.geo.json')),
  manifest: await readJson(path.join(resolvedScenarioDir, 'manifest.json')),
});
await writeScenarioSeed(path.resolve(outputDir), result);
process.stdout.write(
  `Assigned ${result.diagnostics.assignedProvinces}/${result.diagnostics.provinceCount} province centroids to ${result.diagnostics.representedRosterPolities} roster polities.\n`,
);
