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
import { validateGeometryResolutions } from '../content/sources/geometry/compiler.mjs';
import { compileRelationships } from '../content/sources/relationships/compiler.mjs';

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
  const resolutions = await readJson(path.join(scenarioDir, 'sources', 'geometry-resolutions.json'));
  const review = await readJson(path.join(scenarioDir, 'sources', 'roster-review.json'));
  const cliopatriaDiscovery = await readJson(path.join(scenarioDir, 'sources', 'cliopatria-discovery.json'));
  validateGeometryResolutions({ asOf: id, audit, resolutions, review, cliopatriaDiscovery });
  return {
    valid: audit.entries.length - invalid.length,
    total: audit.entries.length,
    invalid: invalid.length,
    resolved: resolutions.resolutions.length,
  };
}

async function validateCompiledBorders(id) {
  const scenarioDir = path.join(scenariosRoot, id);
  const roster = await readJson(path.join(scenarioDir, 'polities.json'));
  const compiled = await readJson(path.join(scenarioDir, 'compiled', 'world-borders.geo.json'));
  const resolutions = await readJson(path.join(scenarioDir, 'sources', 'geometry-resolutions.json'));
  requireValue(compiled.schemaVersion === 1 && compiled.asOf === id, `${id} has an invalid compiled border artifact`);
  requireValue(compiled.featureCollection?.type === 'FeatureCollection', `${id} compiled borders are not GeoJSON`);
  const polityKeys = new Set(roster.polities.map((polity) => polity.key));
  const exclusive = roster.polities.filter((polity) => polity.status !== 'constituent');
  const represented = new Set();
  for (const feature of compiled.featureCollection.features ?? []) {
    const polityKey = feature.properties?.polityKey;
    requireValue(polityKeys.has(polityKey), `${id} compiled borders reference unknown polity ${polityKey}`);
    requireValue(['Polygon', 'MultiPolygon'].includes(feature.geometry?.type), `${id} has unsupported border geometry`);
    represented.add(polityKey);
    if (polityKey === 'GERMANY') {
      requireValue(feature.properties.displayName === 'Germany', `${id} compiled Germany has a non-neutral name`);
    }
  }
  for (const polity of exclusive) {
    requireValue(represented.has(polity.key), `${id} compiled borders omit ${polity.key}`);
  }
  requireValue(compiled.counts.exclusivePolities === exclusive.length, `${id} compiled exclusive-polity count is stale`);
  requireValue(compiled.counts.representedPolities === represented.size, `${id} compiled represented-polity count is stale`);
  for (const resolution of resolutions.resolutions) {
    if (resolution.action === 'close_outer_chain') {
      requireValue(
        compiled.provenance.some((entry) => entry.relationId === resolution.relationId && entry.repair?.closedOuterChains > 0),
        `${id} compiled borders omit repair provenance for relation ${resolution.relationId}`,
      );
    }
    if (resolution.action === 'cliopatria_fallback') {
      for (const sourceRecord of resolution.sourceRecords) {
        requireValue(
          compiled.provenance.some((entry) => entry.source === 'Cliopatria' && entry.sourceRecord === sourceRecord),
          `${id} compiled borders omit fallback record ${sourceRecord}`,
        );
      }
    }
  }
}

async function validateCompiledSeed(id, manifest) {
  const scenarioDir = path.join(scenariosRoot, id);
  const generatedDir = path.join(root, 'src', 'data', 'scenarios', id);
  const roster = await readJson(path.join(scenarioDir, 'polities.json'));
  const worldSeed = await readJson(path.join(generatedDir, 'worldSeed.json'));
  const borders = await readJson(path.join(generatedDir, 'nationalBorders.geo.json'));
  const diagnostics = await readJson(path.join(generatedDir, 'seed-diagnostics.json'));
  requireValue(diagnostics.schemaVersion === 1 && diagnostics.asOf === id, `${id} has invalid seed diagnostics`);
  requireValue(worldSeed.provinceCount === worldSeed.provinces.length, `${id} seed province count is stale`);
  requireValue(worldSeed.provinces.length > 0 && worldSeed.states.length > 0, `${id} seed is empty`);
  requireValue(
    worldSeed.provinces.every((province, index) => province.id === index),
    `${id} seed province ids are not contiguous`,
  );
  requireValue(
    worldSeed.states.every((state, index) => state.id === index),
    `${id} seed state ids are not contiguous`,
  );
  const nationTags = worldSeed.nations.map((nation) => nation.tag);
  const nationTagSet = new Set(nationTags);
  requireValue(nationTagSet.size === nationTags.length, `${id} seed repeats a nation tag`);
  const provinceById = new Map(worldSeed.provinces.map((province) => [province.id, province]));
  const stateById = new Map(worldSeed.states.map((state) => [state.id, state]));
  for (const province of worldSeed.provinces) {
    requireValue(nationTagSet.has(province.ownerTag), `${id} province ${province.id} has unknown owner ${province.ownerTag}`);
    const state = stateById.get(province.stateId);
    requireValue(Boolean(state), `${id} province ${province.id} has unknown state ${province.stateId}`);
    requireValue(state.ownerTag === province.ownerTag, `${id} province ${province.id} and state owner disagree`);
    requireValue(state.provinceIds.includes(province.id), `${id} state ${state.id} omits province ${province.id}`);
  }
  for (const state of worldSeed.states) {
    requireValue(nationTagSet.has(state.ownerTag), `${id} state ${state.id} has unknown owner ${state.ownerTag}`);
    requireValue(state.provinceIds.length > 0, `${id} state ${state.id} has no provinces`);
    for (const provinceId of state.provinceIds) {
      requireValue(provinceById.get(provinceId)?.stateId === state.id, `${id} state ${state.id} has a stale province reference`);
    }
  }
  for (const nation of worldSeed.nations) {
    requireValue(provinceById.get(nation.capitalProvinceId)?.ownerTag === nation.tag, `${id} nation ${nation.tag} has an invalid capital`);
    if (nation.overlordTag) {
      requireValue(nationTagSet.has(nation.overlordTag), `${id} nation ${nation.tag} has an absent overlord`);
    }
  }
  requireValue(borders.type === 'FeatureCollection', `${id} seed borders are not GeoJSON`);
  for (const feature of borders.features ?? []) {
    const nationId = feature.properties?.id;
    requireValue(Number.isInteger(nationId) && nationId >= 0 && nationId < worldSeed.nations.length, `${id} seed border has an invalid nation id`);
  }
  const gapProvinceIds = worldSeed.provinces
    .filter((province) => province.ownerTag === 'UNC')
    .map((province) => province.id);
  requireValue(
    JSON.stringify(diagnostics.gapProvinceIds) === JSON.stringify(gapProvinceIds),
    `${id} seed gap diagnostics are stale`,
  );
  requireValue(
    diagnostics.assignedProvinces === worldSeed.provinces.length - gapProvinceIds.length,
    `${id} seed assigned-province count is stale`,
  );
  const represented = worldSeed.nations.filter((nation) => nation.tag !== 'UNC').length;
  requireValue(diagnostics.representedRosterPolities === represented, `${id} represented-polity count is stale`);
  const expectedMissing = roster.polities
    .map((polity) => polity.key)
    .filter((key) => !nationTagSet.has(key));
  requireValue(
    JSON.stringify(diagnostics.rosterPolitiesWithoutProvinceCentroids) === JSON.stringify(expectedMissing),
    `${id} missing-polity diagnostics are stale`,
  );
  const expectedTerritorialMissing = roster.polities
    .filter((polity) => polity.status !== 'constituent')
    .map((polity) => polity.key)
    .filter((key) => !nationTagSet.has(key));
  requireValue(
    JSON.stringify(diagnostics.territorialRosterPolitiesWithoutProvinceCentroids) === JSON.stringify(expectedTerritorialMissing),
    `${id} territorial missing-polity diagnostics are stale`,
  );
  if (manifest.status === 'playable') {
    requireValue(gapProvinceIds.length === 0, `${id} playable seed still has uncovered provinces`);
    requireValue(diagnostics.overlaps.length === 0, `${id} playable seed still has unresolved border overlaps`);
    requireValue(diagnostics.nearestAssignments.length === 0, `${id} playable seed still has inferred nearest-border assignments`);
    requireValue(expectedTerritorialMissing.length === 0, `${id} playable seed omits territorial roster polities`);
    requireValue(diagnostics.unrepresentedOverlordLinks.length === 0, `${id} playable seed omits relationship participants`);
  }
  return {
    id,
    assigned: diagnostics.assignedProvinces,
    total: diagnostics.provinceCount,
    represented,
    roster: roster.polities.length,
  };
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

async function validateRoster(id, manifest) {
  const scenarioDir = path.join(scenariosRoot, id);
  const roster = await readJson(path.join(scenarioDir, 'polities.json'));
  const relationships = await readJson(path.join(scenarioDir, 'relationships.json'));
  const relationshipPolicy = await readJson(path.join(scenarioDir, 'sources', 'relationship-policy.json'));
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
    if (manifest.status === 'playable') {
      requireValue(polity.flagAssetTag !== 'TBD_NEUTRAL', `${id} polity ${polity.key} still has a neutral placeholder flag`);
    }
  }

  requireValue(relationships.schemaVersion === 1, `${id} has an unsupported relationship schema`);
  requireValue(relationships.asOf === id, `${id} relationship date does not match the scenario`);
  const expectedRelationships = compileRelationships({ manifest, roster, policy: relationshipPolicy });
  requireValue(
    JSON.stringify(relationships) === JSON.stringify(expectedRelationships),
    `${id} relationships are stale; regenerate them`,
  );
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
const seedAudits = [];
for (const id of catalog.scenarios) {
  const manifest = await readJson(path.join(scenariosRoot, id, 'manifest.json'));
  validateManifest(manifest, id);
  await validateOhmSpec(id);
  if (id !== '1830-01-01') {
    await validateRoster(id, manifest);
    geometryAudits.push({ id, ...await validateGeometryAudit(id, manifest) });
    await validateCompiledBorders(id);
    seedAudits.push(await validateCompiledSeed(id, manifest));
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
  process.stdout.write(
    `${audit.id}: ${audit.valid}/${audit.total} OHM relations are raw-valid; ${audit.resolved}/${audit.invalid} invalid relations have explicit resolutions.\n`,
  );
}
for (const audit of seedAudits) {
  process.stdout.write(
    `${audit.id}: ${audit.assigned}/${audit.total} province centroids represent ${audit.represented}/${audit.roster} roster polities.\n`,
  );
}
