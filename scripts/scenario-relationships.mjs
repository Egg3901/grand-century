#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildCarryForwardRelationshipPolicy,
  compileRelationships,
  writeRelationships,
} from '../content/sources/relationships/compiler.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function options(args, name) {
  return args.flatMap((value, index) => value === name ? [args[index + 1]] : []).filter(Boolean);
}

const args = process.argv.slice(2);
const scenarioDir = option(args, '--scenario-dir');
if (args[0] === 'compile' && scenarioDir) {
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
} else if (args[0] === 'carry-forward' && scenarioDir) {
  const fromScenarioDirs = options(args, '--from-scenario-dir');
  const outputPath = option(args, '--out');
  if (fromScenarioDirs.length === 0 || !outputPath) {
    throw new Error('Usage: node scripts/scenario-relationships.mjs carry-forward --scenario-dir DIR --from-scenario-dir DIR [--from-scenario-dir DIR] --out FILE');
  }
  const resolved = path.resolve(scenarioDir);
  const manifest = await readJson(path.join(resolved, 'manifest.json'));
  const result = buildCarryForwardRelationshipPolicy({
    asOf: manifest.id,
    roster: await readJson(path.join(resolved, 'polities.json')),
    previousRelationships: await Promise.all(fromScenarioDirs.map((directory) => (
      readJson(path.join(path.resolve(directory), 'relationships.json'))
    ))),
    reviewedBy: 'Codex temporal relationship review',
    reviewedAt: new Date().toISOString().slice(0, 10),
  });
  await writeRelationships(path.resolve(outputPath), result);
  process.stdout.write(`Carried ${result.decisions.length} dependent-polity relationship decisions.\n`);
} else {
  throw new Error('Usage: node scripts/scenario-relationships.mjs compile|carry-forward --scenario-dir DIR');
}
