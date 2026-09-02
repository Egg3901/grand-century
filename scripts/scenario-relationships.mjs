#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileRelationships, writeRelationships } from '../content/sources/relationships/compiler.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

const args = process.argv.slice(2);
const scenarioDir = option(args, '--scenario-dir');
if (args[0] !== 'compile' || !scenarioDir) {
  throw new Error('Usage: node scripts/scenario-relationships.mjs compile --scenario-dir DIR');
}
const resolved = path.resolve(scenarioDir);
const result = compileRelationships({
  manifest: await readJson(path.join(resolved, 'manifest.json')),
  roster: await readJson(path.join(resolved, 'polities.json')),
  policy: await readJson(path.join(resolved, 'sources', 'relationship-policy.json')),
});
await writeRelationships(path.join(resolved, 'relationships.json'), result);
process.stdout.write(
  `Resolved ${result.counts.dependentPolities} dependent polities with ${result.counts.runtimeOverlords} runtime overlords.\n`,
);
