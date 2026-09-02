#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { compileScenarioBorders, writeScenarioBorders } from '../content/sources/geometry/compiler.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return 'Usage: node scripts/scenario-geometry.mjs compile --scenario-dir DIR --ohm-cache-dir DIR --cliopatria-cache FILE --out FILE';
}

const args = process.argv.slice(2);
if (args[0] !== 'compile') throw new Error(usage());
const scenarioDir = option(args, '--scenario-dir');
const ohmCacheDir = option(args, '--ohm-cache-dir');
const cliopatriaCache = option(args, '--cliopatria-cache');
const outputPath = option(args, '--out');
if (!scenarioDir || !ohmCacheDir || !cliopatriaCache || !outputPath) throw new Error(usage());

const result = await compileScenarioBorders({
  scenarioDir: path.resolve(scenarioDir),
  ohmCacheDir: path.resolve(ohmCacheDir),
  cliopatriaCachePath: path.resolve(cliopatriaCache),
});
await writeScenarioBorders(path.resolve(outputPath), result);
process.stdout.write(
  `Compiled ${result.counts.representedPolities} polities into ${result.counts.features} border features.\n`,
);
