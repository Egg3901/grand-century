#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  auditRosterReview,
  auditComplementReview,
  acceptSourceClassifications,
  applyManualRosterDecisions,
  rebuildScenarioRoster,
  buildCandidateCrosswalk,
  buildCarryForwardDecisionPack,
  loadScenarioRosterFiles,
  scaffoldRosterReview,
  scaffoldComplementReview,
  writeRosterReview,
} from '../content/sources/roster/compiler.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/scenario-roster.mjs scaffold --discovery FILE --out FILE',
    '  node scripts/scenario-roster.mjs audit --scenario-dir DIR',
    '  node scripts/scenario-roster.mjs crosswalk --ohm FILE --cliopatria FILE --out FILE',
    '  node scripts/scenario-roster.mjs scaffold-complement --cliopatria FILE --crosswalk FILE --out FILE',
    '  node scripts/scenario-roster.mjs accept-source --scenario-dir DIR --reviewer NAME [--date YYYY-MM-DD]',
    '  node scripts/scenario-roster.mjs apply-decisions --scenario-dir DIR --decisions FILE',
    '  node scripts/scenario-roster.mjs rebuild --scenario-dir DIR',
    '  node scripts/scenario-roster.mjs carry-forward --scenario-dir DIR --from-scenario-dir DIR --out FILE',
  ].join('\n');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'scaffold') {
  const discoveryPath = option(args, '--discovery');
  const outputPath = option(args, '--out');
  if (!discoveryPath || !outputPath) throw new Error(usage());
  const resolvedOutput = path.resolve(outputPath);
  const discovery = await readJson(path.resolve(discoveryPath));
  let existing = null;
  try {
    existing = await readJson(resolvedOutput);
  } catch {
    existing = null;
  }
  const review = scaffoldRosterReview(discovery, existing);
  await writeRosterReview(resolvedOutput, review);
  process.stdout.write(`Scaffolded ${review.entries.length} roster identities for ${review.asOf}.\n`);
} else if (command === 'audit') {
  const scenarioDir = option(args, '--scenario-dir');
  if (!scenarioDir) throw new Error(usage());
  const files = await loadScenarioRosterFiles(path.resolve(scenarioDir));
  const result = {
    ohm: auditRosterReview(files),
    cliopatria: auditComplementReview({
      manifest: files.manifest,
      roster: files.roster,
      cliopatriaDiscovery: files.cliopatriaDiscovery,
      crosswalk: files.crosswalk,
      review: files.complementReview,
    }),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'crosswalk') {
  const ohmPath = option(args, '--ohm');
  const cliopatriaPath = option(args, '--cliopatria');
  const outputPath = option(args, '--out');
  if (!ohmPath || !cliopatriaPath || !outputPath) throw new Error(usage());
  const result = buildCandidateCrosswalk(
    await readJson(path.resolve(ohmPath)),
    await readJson(path.resolve(cliopatriaPath)),
  );
  await writeRosterReview(path.resolve(outputPath), result);
  process.stdout.write(
    `Crosswalked ${result.counts.matches} matches; ${result.counts.ohmOnly} OHM-only and ${result.counts.cliopatriaOnly} Cliopatria-only candidates remain.\n`,
  );
} else if (command === 'scaffold-complement') {
  const cliopatriaPath = option(args, '--cliopatria');
  const crosswalkPath = option(args, '--crosswalk');
  const outputPath = option(args, '--out');
  if (!cliopatriaPath || !crosswalkPath || !outputPath) throw new Error(usage());
  const resolvedOutput = path.resolve(outputPath);
  let existing = null;
  try {
    existing = await readJson(resolvedOutput);
  } catch {
    existing = null;
  }
  const result = scaffoldComplementReview(
    await readJson(path.resolve(cliopatriaPath)),
    await readJson(path.resolve(crosswalkPath)),
    existing,
  );
  await writeRosterReview(resolvedOutput, result);
  process.stdout.write(`Scaffolded ${result.entries.length} Cliopatria-only roster identities for ${result.asOf}.\n`);
} else if (command === 'accept-source') {
  const scenarioDir = option(args, '--scenario-dir');
  const reviewer = option(args, '--reviewer');
  const reviewedAt = option(args, '--date') ?? new Date().toISOString().slice(0, 10);
  if (!scenarioDir || !reviewer) throw new Error(usage());
  const resolvedDir = path.resolve(scenarioDir);
  const files = await loadScenarioRosterFiles(resolvedDir);
  const result = acceptSourceClassifications({
    roster: files.roster,
    ohmReview: files.review,
    complementReview: files.complementReview,
    reviewer,
    reviewedAt,
  });
  await writeRosterReview(path.join(resolvedDir, 'polities.json'), result.roster);
  await writeRosterReview(path.join(resolvedDir, 'sources/roster-review.json'), result.ohmReview);
  await writeRosterReview(path.join(resolvedDir, 'sources/cliopatria-review.json'), result.complementReview);
  process.stdout.write(
    `Accepted ${result.counts.ohmAccepted} OHM classifications after rebuilding ${result.counts.ohmRetracted}; retracted ${result.counts.complementRetracted} automatic Cliopatria classifications.\n`,
  );
} else if (command === 'apply-decisions') {
  const scenarioDir = option(args, '--scenario-dir');
  const decisionsPath = option(args, '--decisions');
  if (!scenarioDir || !decisionsPath) throw new Error(usage());
  const resolvedDir = path.resolve(scenarioDir);
  const files = await loadScenarioRosterFiles(resolvedDir);
  const result = applyManualRosterDecisions({
    roster: files.roster,
    ohmReview: files.review,
    complementReview: files.complementReview,
    decisionPack: await readJson(path.resolve(decisionsPath)),
  });
  await writeRosterReview(path.join(resolvedDir, 'polities.json'), result.roster);
  await writeRosterReview(path.join(resolvedDir, 'sources/roster-review.json'), result.ohmReview);
  await writeRosterReview(path.join(resolvedDir, 'sources/cliopatria-review.json'), result.complementReview);
  process.stdout.write(`Applied ${result.applied} manual roster decisions.\n`);
} else if (command === 'rebuild') {
  const scenarioDir = option(args, '--scenario-dir');
  if (!scenarioDir) throw new Error(usage());
  const resolvedDir = path.resolve(scenarioDir);
  const files = await loadScenarioRosterFiles(resolvedDir);
  const decisionPack = await readJson(path.join(resolvedDir, 'sources/manual-decisions.json'));
  const result = rebuildScenarioRoster({
    baseRoster: await readJson(path.join(resolvedDir, 'sources/roster-base.json')),
    discovery: files.discovery,
    cliopatriaDiscovery: files.cliopatriaDiscovery,
    crosswalk: files.crosswalk,
    decisionPack,
    reviewedAt: decisionPack.reviewedAt,
  });
  await writeRosterReview(path.join(resolvedDir, 'polities.json'), result.roster);
  await writeRosterReview(path.join(resolvedDir, 'sources/roster-review.json'), result.ohmReview);
  await writeRosterReview(path.join(resolvedDir, 'sources/cliopatria-review.json'), result.complementReview);
  process.stdout.write(
    `Rebuilt ${result.roster.polities.length} polities with ${result.applied} manual decisions.\n`,
  );
} else if (command === 'carry-forward') {
  const scenarioDir = option(args, '--scenario-dir');
  const fromScenarioDir = option(args, '--from-scenario-dir');
  const outputPath = option(args, '--out');
  if (!scenarioDir || !fromScenarioDir || !outputPath) throw new Error(usage());
  const current = await loadScenarioRosterFiles(path.resolve(scenarioDir));
  const previous = await loadScenarioRosterFiles(path.resolve(fromScenarioDir));
  const result = buildCarryForwardDecisionPack({
    previousRoster: previous.roster,
    previousOhmReview: previous.review,
    previousComplementReview: previous.complementReview,
    currentRoster: current.roster,
    currentOhmReview: current.review,
    currentComplementReview: current.complementReview,
    reviewer: 'Codex temporal carry-forward review',
    reviewedAt: new Date().toISOString().slice(0, 10),
  });
  await writeRosterReview(path.resolve(outputPath), result);
  process.stdout.write(`Carried forward ${result.decisions.length} classifications from ${result.carriedFrom}.\n`);
} else {
  throw new Error(usage());
}
