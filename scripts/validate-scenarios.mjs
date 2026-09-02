#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  auditComplementReview,
  auditRosterReview,
  buildCandidateCrosswalk,
  loadScenarioRosterFiles,
} from '../content/sources/roster/compiler.mjs';

const root = process.cwd();
const scenariosRoot = path.join(root, 'content', 'scenarios');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`[scenario] ${message}`);
}

function validateManifest(manifest, id) {
  requireValue(manifest.schemaVersion === 1, `${id} has an unsupported manifest schema`);
  requireValue(manifest.id === id, `${id} manifest id does not match its directory`);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(id), `${id} is not an ISO scenario id`);
  requireValue(['playable', 'preview', 'development'].includes(manifest.status), `${id} has an invalid status`);
  const expectedId = [
    String(manifest.startDate?.year).padStart(4, '0'),
    String(manifest.startDate?.month).padStart(2, '0'),
    String(manifest.startDate?.day).padStart(2, '0'),
  ].join('-');
  requireValue(expectedId === id, `${id} start date does not match its id`);
  requireValue(manifest.visualPolicy?.naziImagery === 'prohibited', `${id} must prohibit Nazi imagery`);
  if (manifest.startDate.year >= 1933) {
    requireValue(
      manifest.visualPolicy?.germanyPresentation?.displayName === 'Germany'
        && manifest.visualPolicy?.germanyPresentation?.flagAssetTag === 'GER'
        && manifest.visualPolicy?.germanyPresentation?.treatment === 'neutral_tricolor',
      `${id} must declare the neutral Germany presentation`,
    );
  }
}

async function validateOhmSpec(id) {
  const specPath = path.join(scenariosRoot, id, 'sources', 'ohm.json');
  try {
    await access(specPath);
  } catch {
    return;
  }
  const spec = await readJson(specPath);
  requireValue(spec.schemaVersion === 1, `${id} has an unsupported OHM source schema`);
  requireValue(spec.asOf === id, `${id} OHM source date does not match the scenario`);
  const relationIds = (spec.boundaries ?? []).map((boundary) => boundary.relationId);
  requireValue(relationIds.length > 0, `${id} OHM source pack has no curated boundaries`);
  requireValue(new Set(relationIds).size === relationIds.length, `${id} repeats an OHM relation`);
  for (const boundary of spec.boundaries) {
    requireValue(Number.isInteger(boundary.relationId), `${id} has an invalid OHM relation id`);
    requireValue(Boolean(boundary.polityKey), `${id} has an OHM boundary without a polity key`);
    requireValue(Boolean(boundary.expectedName), `${id} has an OHM boundary without an expected name`);
  }
}

async function validateGeometryAudit(id, manifest) {
  const scenarioDir = path.join(scenariosRoot, id);
  const discovery = await readJson(path.join(scenarioDir, 'sources', 'ohm-discovery.json'));
  const audit = await readJson(path.join(scenarioDir, 'sources', 'ohm-geometry-audit.json'));
  requireValue(audit.schemaVersion === 1, `${id} has an unsupported geometry audit schema`);
  requireValue(audit.asOf === id, `${id} geometry audit date does not match the scenario`);
  const expectedIds = [...new Set(discovery.candidates.map((candidate) => candidate.relationId))].sort((a, b) => a - b);
  const actualIds = (audit.entries ?? []).map((entry) => entry.relationId).sort((a, b) => a - b);
  requireValue(
    JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    `${id} geometry audit does not cover the discovery relation set`,
  );
  const invalid = audit.entries.filter((entry) => entry.status !== 'valid');
  if (manifest.status === 'playable') {
    requireValue(invalid.length === 0, `${id} is playable with ${invalid.length} unresolved OHM geometries`);
  }
  return { valid: audit.entries.length - invalid.length, total: audit.entries.length, invalid: invalid.length };
}

async function validateCliopatria(id, files) {
  const source = await readJson(path.join(root, 'content', 'sources', 'cliopatria', 'source.json'));
  requireValue(source.license === 'CC BY 4.0', 'Cliopatria source license changed');
  requireValue(files.cliopatriaDiscovery.asOf === id, `${id} Cliopatria date does not match the scenario`);
  requireValue(
    files.cliopatriaDiscovery.source.archiveSha256 === source.archiveSha256,
    `${id} Cliopatria archive hash does not match the pinned source`,
  );
  const expectedCrosswalk = buildCandidateCrosswalk(files.discovery, files.cliopatriaDiscovery);
  requireValue(
    JSON.stringify(files.crosswalk) === JSON.stringify(expectedCrosswalk),
    `${id} source crosswalk is stale; regenerate it`,
  );
}

async function validateRoster(id) {
  const scenarioDir = path.join(scenariosRoot, id);
  const roster = await readJson(path.join(scenarioDir, 'polities.json'));
  const relationships = await readJson(path.join(scenarioDir, 'relationships.json'));
  requireValue(roster.schemaVersion === 1, `${id} has an unsupported polity schema`);
  requireValue(roster.asOf === id, `${id} polity date does not match the scenario`);
  requireValue(['vertical_slice', 'global'].includes(roster.coverage), `${id} has an invalid polity coverage`);
  requireValue(Array.isArray(roster.polities) && roster.polities.length > 0, `${id} has an empty polity roster`);
  const keys = roster.polities.map((polity) => polity.key);
  const keySet = new Set(keys);
  requireValue(keySet.size === keys.length, `${id} repeats a polity key`);
  const validStatuses = new Set([
    'sovereign',
    'constituent',
    'vassal',
    'colonial_administration',
    'tributary',
    'decentralized',
  ]);
  for (const polity of roster.polities) {
    requireValue(Boolean(polity.key) && Boolean(polity.displayName), `${id} has an unnamed polity`);
    requireValue(validStatuses.has(polity.status), `${id} polity ${polity.key} has an invalid status`);
    requireValue(Boolean(polity.flagAssetTag), `${id} polity ${polity.key} has no flag treatment`);
  }

  requireValue(relationships.schemaVersion === 1, `${id} has an unsupported relationship schema`);
  requireValue(relationships.asOf === id, `${id} relationship date does not match the scenario`);
  for (const relationship of relationships.relationships ?? []) {
    requireValue(keySet.has(relationship.from), `${id} relationship has unknown source ${relationship.from}`);
    requireValue(keySet.has(relationship.to), `${id} relationship has unknown target ${relationship.to}`);
    requireValue(relationship.from !== relationship.to, `${id} relationship points a polity at itself`);
  }

  const ohmSpec = await readJson(path.join(scenarioDir, 'sources', 'ohm.json'));
  for (const boundary of ohmSpec.boundaries ?? []) {
    const polity = roster.polities.find((candidate) => candidate.key === boundary.polityKey);
    requireValue(Boolean(polity), `${id} OHM boundary references unknown polity ${boundary.polityKey}`);
    requireValue(
      polity.sources?.some((source) => source.kind === 'ohm_relation' && source.id === boundary.relationId),
      `${id} polity ${boundary.polityKey} does not cite OHM relation ${boundary.relationId}`,
    );
  }
}

async function validateVisualAssets() {
  const flagsRoot = path.join(root, 'public', 'flags');
  const names = await readdir(flagsRoot);
  const prohibitedName = /(swastika|nsdap|schutzstaffel|hitler)/i;
  for (const name of names) {
    requireValue(!prohibitedName.test(name), `prohibited visual asset name: ${name}`);
    if (!name.endsWith('.svg')) continue;
    const body = await readFile(path.join(flagsRoot, name), 'utf8');
    requireValue(!prohibitedName.test(body), `prohibited visual asset content: ${name}`);
  }
  const neutralGermany = await readFile(path.join(flagsRoot, 'GER.svg'), 'utf8');
  requireValue(neutralGermany.includes('#2b261e'), 'neutral Germany flag is missing its black stripe');
  requireValue(neutralGermany.includes('#efe6d0'), 'neutral Germany flag is missing its white stripe');
  requireValue(neutralGermany.includes('#a83a2e'), 'neutral Germany flag is missing its red stripe');
}

async function validateSourceDirectories() {
  const names = await readdir(path.join(root, 'content', 'sources'));
  const restricted = new Set(['cshapes', 'chgis', 'correlates-of-war', 'cow']);
  for (const name of names) {
    requireValue(!restricted.has(name.toLowerCase()), `restricted source directory must not enter the pipeline: ${name}`);
  }
}

const catalog = await readJson(path.join(scenariosRoot, 'catalog.json'));
requireValue(catalog.schemaVersion === 1, 'unsupported catalog schema');
requireValue(Array.isArray(catalog.scenarios) && catalog.scenarios.length > 0, 'empty scenario catalog');
requireValue(new Set(catalog.scenarios).size === catalog.scenarios.length, 'duplicate scenario catalog entry');

const rosterAudits = [];
const complementAudits = [];
const geometryAudits = [];
for (const id of catalog.scenarios) {
  const manifest = await readJson(path.join(scenariosRoot, id, 'manifest.json'));
  validateManifest(manifest, id);
  await validateOhmSpec(id);
  if (id !== '1830-01-01') {
    await validateRoster(id);
    geometryAudits.push({ id, ...await validateGeometryAudit(id, manifest) });
    const files = await loadScenarioRosterFiles(path.join(scenariosRoot, id));
    await validateCliopatria(id, files);
    rosterAudits.push(auditRosterReview(files));
    complementAudits.push(auditComplementReview({
      manifest: files.manifest,
      roster: files.roster,
      cliopatriaDiscovery: files.cliopatriaDiscovery,
      crosswalk: files.crosswalk,
      review: files.complementReview,
    }));
  }
}
await validateVisualAssets();
await validateSourceDirectories();

process.stdout.write(`Validated ${catalog.scenarios.length} scenario manifests and visual policy.\n`);
for (const audit of rosterAudits) {
  process.stdout.write(
    `${audit.scenarioId}: ${audit.classifiedIdentities}/${audit.discoveredIdentities} OHM identities classified.\n`,
  );
}
for (const audit of complementAudits) {
  process.stdout.write(
    `${audit.scenarioId}: ${audit.classifiedIdentities}/${audit.candidates} Cliopatria-only identities classified.\n`,
  );
}
for (const audit of geometryAudits) {
  process.stdout.write(`${audit.id}: ${audit.valid}/${audit.total} OHM relations have valid geometry.\n`);
}
