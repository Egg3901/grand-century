import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  compileOhmRelationGeometry,
  indexOhmDocument,
} from '../ohm/adapter.mjs';
import {
  cliopatriaFeatureRecords,
  loadCliopatriaArchive,
  parseCliopatriaArchive,
} from '../cliopatria/adapter.mjs';

const EXCLUSIVE_STATUSES = new Set([
  'sovereign',
  'vassal',
  'colonial_administration',
  'tributary',
  'decentralized',
]);

function requireValue(condition, message) {
  if (!condition) throw new Error(`[geometry] ${message}`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function geometryHash(geometry) {
  return createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
}

function samePoint(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function quantizePoint(point, step) {
  return [
    Math.round(point[0] / step) * step,
    Math.round(point[1] / step) * step,
  ];
}

function simplifyRingAtStep(ring, step) {
  const points = [];
  for (const point of ring) {
    const quantized = quantizePoint(point, step);
    if (points.length === 0 || !samePoint(points[points.length - 1], quantized)) points.push(quantized);
  }
  if (points.length > 0 && !samePoint(points[0], points[points.length - 1])) points.push(points[0]);
  if (points.length < 4) return null;
  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const cross = (current[0] - previous[0]) * (next[1] - current[1])
      - (current[1] - previous[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-12) simplified.push(current);
  }
  simplified.push(simplified[0]);
  return simplified.length >= 4 ? simplified : null;
}

function simplifyRing(ring, step) {
  return simplifyRingAtStep(ring, step)
    ?? simplifyRingAtStep(ring, step / 10)
    ?? ring;
}

function simplifyPolygon(polygon, step) {
  const outer = simplifyRing(polygon[0], step);
  const holes = polygon.slice(1)
    .map((ring) => simplifyRingAtStep(ring, step) ?? simplifyRingAtStep(ring, step / 10))
    .filter(Boolean);
  return [outer, ...holes];
}

export function simplifyGeometry(geometry, step = 0.01) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: simplifyPolygon(geometry.coordinates, step) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => simplifyPolygon(polygon, step)),
    };
  }
  throw new Error(`[geometry] unsupported geometry type ${geometry.type}`);
}

function coordinateCount(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === 'number') return 1;
  return value.reduce((sum, child) => sum + coordinateCount(child), 0);
}

function featureForPolity(feature, polity, source) {
  return {
    type: 'Feature',
    id: `${polity.key}:${source.kind}:${source.id}`,
    properties: {
      polityKey: polity.key,
      displayName: polity.displayName,
      polityStatus: polity.status,
      sourceKind: source.kind,
      sourceId: source.id,
      geometryRepair: feature.properties?.geometryRepair ?? null,
    },
    geometry: feature.geometry,
  };
}

async function loadCliopatriaGeometry(cachePath, asOf) {
  const { source, bytes } = await loadCliopatriaArchive({ cachePath });
  const document = parseCliopatriaArchive(bytes);
  const records = new Map(cliopatriaFeatureRecords(document, asOf).map((entry) => [entry.sourceRecord, entry.feature]));
  return { source, records };
}

export function validateGeometryResolutions({ asOf, audit, resolutions, review, cliopatriaDiscovery }) {
  requireValue(resolutions.schemaVersion === 1 && resolutions.asOf === asOf, 'invalid geometry resolution pack');
  const invalidIds = audit.entries.filter((entry) => entry.status !== 'valid').map((entry) => entry.relationId).sort((a, b) => a - b);
  const resolutionIds = resolutions.resolutions.map((entry) => entry.relationId).sort((a, b) => a - b);
  requireValue(JSON.stringify(invalidIds) === JSON.stringify(resolutionIds), 'geometry resolutions do not cover the invalid relation set');
  const reviewByRelation = new Map(review.entries.flatMap((entry) => entry.relationIds.map((id) => [id, entry])));
  const cliByRecord = new Map(cliopatriaDiscovery.candidates.map((entry) => [entry.sourceRecord, entry]));
  for (const resolution of resolutions.resolutions) {
    requireValue(Boolean(resolution.reason), `relation ${resolution.relationId} resolution needs a reason`);
    const reviewEntry = reviewByRelation.get(resolution.relationId);
    requireValue(Boolean(reviewEntry), `relation ${resolution.relationId} resolution has no roster review`);
    if (resolution.action === 'skip_nonexclusive') {
      requireValue(!['polity', 'dependent_polity'].includes(reviewEntry.disposition), `exclusive relation ${resolution.relationId} cannot be skipped`);
    } else if (resolution.action === 'close_outer_chain') {
      requireValue(Number(resolution.maxGapDegrees) > 0, `relation ${resolution.relationId} needs a positive repair gap`);
    } else if (resolution.action === 'cliopatria_fallback') {
      requireValue(resolution.sourceRecords.length > 0, `relation ${resolution.relationId} has no fallback records`);
      for (let index = 0; index < resolution.sourceRecords.length; index += 1) {
        const candidate = cliByRecord.get(resolution.sourceRecords[index]);
        requireValue(Boolean(candidate), `relation ${resolution.relationId} has unknown fallback record`);
        requireValue(candidate.geometryHash === resolution.geometryHashes[index], `relation ${resolution.relationId} fallback hash changed`);
      }
    } else {
      throw new Error(`[geometry] unknown resolution action ${resolution.action}`);
    }
  }
}

export function validateGeometrySupplements({ asOf, roster, supplements, audit }) {
  requireValue(supplements.schemaVersion === 1 && supplements.asOf === asOf, 'invalid geometry supplement pack');
  requireValue(audit.schemaVersion === 1 && audit.asOf === asOf, 'invalid geometry supplement audit');
  const polityByKey = new Map(roster.polities.map((polity) => [polity.key, polity]));
  const auditByRelation = new Map((audit.entries ?? []).map((entry) => [entry.relationId, entry]));
  const relationIds = new Set();
  for (const supplement of supplements.supplements ?? []) {
    requireValue(!relationIds.has(supplement.relationId), `duplicate supplement relation ${supplement.relationId}`);
    relationIds.add(supplement.relationId);
    const polity = polityByKey.get(supplement.polityKey);
    requireValue(Boolean(polity), `supplement relation ${supplement.relationId} has unknown polity ${supplement.polityKey}`);
    requireValue(EXCLUSIVE_STATUSES.has(polity.status), `supplement relation ${supplement.relationId} targets nonexclusive ${supplement.polityKey}`);
    requireValue((polity.sources ?? []).length === 0, `supplemented polity ${supplement.polityKey} also has direct geometry sources`);
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(supplement.sourceAsOf), `supplement relation ${supplement.relationId} has invalid source date`);
    requireValue(supplement.sourceAsOf !== asOf, `supplement relation ${supplement.relationId} is not a temporal fallback`);
    requireValue(Boolean(supplement.expectedName), `supplement relation ${supplement.relationId} has no expected name`);
    requireValue(Boolean(supplement.reason), `supplement relation ${supplement.relationId} has no reason`);
    requireValue((supplement.evidence ?? []).length > 0, `supplement relation ${supplement.relationId} has no documentary evidence`);
    const audited = auditByRelation.get(supplement.relationId);
    requireValue(Boolean(audited), `supplement relation ${supplement.relationId} has no geometry audit`);
    requireValue(audited.sourceAsOf === supplement.sourceAsOf, `supplement relation ${supplement.relationId} audit date changed`);
    requireValue(audited.status === 'valid', `supplement relation ${supplement.relationId} did not pass geometry audit`);
  }
  requireValue(auditByRelation.size === relationIds.size, 'geometry supplement audit does not match the source pack');
}

export async function compileScenarioBorders({
  scenarioDir,
  ohmCacheDir,
  cliopatriaCachePath,
  simplificationStep = 0.01,
}) {
  const manifest = await readJson(path.join(scenarioDir, 'manifest.json'));
  const roster = await readJson(path.join(scenarioDir, 'polities.json'));
  const review = await readJson(path.join(scenarioDir, 'sources/roster-review.json'));
  const audit = await readJson(path.join(scenarioDir, 'sources/ohm-geometry-audit.json'));
  const resolutions = await readJson(path.join(scenarioDir, 'sources/geometry-resolutions.json'));
  const cliopatriaDiscovery = await readJson(path.join(scenarioDir, 'sources/cliopatria-discovery.json'));
  const supplements = await readOptionalJson(
    path.join(scenarioDir, 'sources/geometry-supplements.json'),
    { schemaVersion: 1, asOf: manifest.id, supplements: [] },
  );
  const supplementAudit = await readOptionalJson(
    path.join(scenarioDir, 'sources/geometry-supplement-audit.json'),
    { schemaVersion: 1, asOf: manifest.id, entries: [] },
  );
  validateGeometryResolutions({
    asOf: manifest.id,
    audit,
    resolutions,
    review,
    cliopatriaDiscovery,
  });
  validateGeometrySupplements({ asOf: manifest.id, roster, supplements, audit: supplementAudit });

  const auditById = new Map(audit.entries.map((entry) => [entry.relationId, entry]));
  const resolutionById = new Map(resolutions.resolutions.map((entry) => [entry.relationId, entry]));
  const exclusivePolities = roster.polities.filter((polity) => EXCLUSIVE_STATUSES.has(polity.status));
  const tasks = new Map();
  const cliTasks = new Map();
  for (const polity of exclusivePolities) {
    const ohmSources = (polity.sources ?? []).filter((source) => source.kind === 'ohm_relation');
    let selectedOhm = 0;
    for (const source of ohmSources) {
      const auditEntry = auditById.get(source.id);
      requireValue(Boolean(auditEntry), `${polity.key} OHM relation ${source.id} has no geometry audit`);
      if (auditEntry.status === 'valid') {
        tasks.set(`direct:${source.id}`, { polity, source, relationId: source.id, sourceAsOf: manifest.id, maxGapDegrees: 0 });
        selectedOhm += 1;
        continue;
      }
      const resolution = resolutionById.get(source.id);
      if (resolution?.action === 'close_outer_chain') {
        tasks.set(`direct:${source.id}`, {
          polity, source, relationId: source.id, sourceAsOf: manifest.id, maxGapDegrees: resolution.maxGapDegrees,
        });
        selectedOhm += 1;
      } else if (resolution?.action === 'cliopatria_fallback') {
        for (const record of resolution.sourceRecords) {
          cliTasks.set(`${polity.key}:${record}`, { polity, source: { kind: 'cliopatria_record', id: record } });
        }
      }
    }
    if (selectedOhm === 0 && ![...cliTasks.values()].some((task) => task.polity.key === polity.key)) {
      for (const source of (polity.sources ?? []).filter((entry) => entry.kind === 'cliopatria_record')) {
        cliTasks.set(`${polity.key}:${source.id}`, { polity, source });
      }
    }
  }
  for (const supplement of supplements.supplements ?? []) {
    const polity = roster.polities.find((entry) => entry.key === supplement.polityKey);
    tasks.set(`supplement:${supplement.relationId}`, {
      polity,
      source: { kind: 'ohm_temporal_fallback', id: supplement.relationId },
      relationId: supplement.relationId,
      sourceAsOf: supplement.sourceAsOf,
      maxGapDegrees: 0,
      supplement,
    });
  }

  const features = [];
  const provenance = [];
  const remainingTasks = new Map(tasks);
  const cacheFiles = (await readdir(ohmCacheDir)).filter((name) => name.endsWith('.json')).sort();
  for (const cacheFile of cacheFiles) {
    if (remainingTasks.size === 0) break;
    const cache = await readJson(path.join(ohmCacheDir, cacheFile));
    const document = cache.document;
    const elementIndex = indexOhmDocument(document);
    for (const [taskKey, task] of [...remainingTasks]) {
      if (!elementIndex.has(`relation:${task.relationId}`)) continue;
      const relation = elementIndex.get(`relation:${task.relationId}`);
      requireValue(
        !task.supplement || relation.tags?.name === task.supplement.expectedName,
        `supplement relation ${task.relationId} changed name`,
      );
      requireValue(
        !task.supplement?.expectedWikidata || relation.tags?.wikidata === task.supplement.expectedWikidata,
        `supplement relation ${task.relationId} changed Wikidata identity`,
      );
      const rawFeature = compileOhmRelationGeometry(document, {
        relationId: task.relationId,
        asOf: task.sourceAsOf,
        closeOuterChainsMaxGapDegrees: task.maxGapDegrees,
        elementIndex,
      });
      const sourceFeature = featureForPolity(rawFeature, task.polity, task.source);
      sourceFeature.geometry = simplifyGeometry(sourceFeature.geometry, simplificationStep);
      features.push(sourceFeature);
      provenance.push({
        polityKey: task.polity.key,
        source: 'OpenHistoricalMap',
        relationId: task.relationId,
        license: rawFeature.properties.license,
        repair: rawFeature.properties.geometryRepair,
        ...(task.supplement ? {
          treatment: 'reviewed_temporal_fallback',
          scenarioAsOf: manifest.id,
          sourceAsOf: task.sourceAsOf,
          reason: task.supplement.reason,
          evidence: task.supplement.evidence,
        } : {}),
      });
      remainingTasks.delete(taskKey);
    }
  }
  requireValue(remainingTasks.size === 0, `OHM caches are missing ${remainingTasks.size} selected relations`);

  if (cliTasks.size > 0) {
    const { source, records } = await loadCliopatriaGeometry(cliopatriaCachePath, manifest.id);
    const discoveryByRecord = new Map(cliopatriaDiscovery.candidates.map((entry) => [entry.sourceRecord, entry]));
    for (const task of cliTasks.values()) {
      const rawFeature = records.get(task.source.id);
      const candidate = discoveryByRecord.get(task.source.id);
      requireValue(Boolean(rawFeature) && Boolean(candidate), `${task.polity.key} is missing Cliopatria record ${task.source.id}`);
      requireValue(geometryHash(rawFeature.geometry) === candidate.geometryHash, `${task.polity.key} Cliopatria geometry hash changed`);
      const sourceFeature = featureForPolity(rawFeature, task.polity, task.source);
      sourceFeature.geometry = simplifyGeometry(sourceFeature.geometry, simplificationStep);
      features.push(sourceFeature);
      provenance.push({
        polityKey: task.polity.key,
        source: 'Cliopatria',
        sourceRecord: task.source.id,
        license: source.license,
        archiveSha256: source.archiveSha256,
        transformed: true,
      });
    }
  }

  const represented = new Set(features.map((feature) => feature.properties.polityKey));
  const missing = exclusivePolities.filter((polity) => !represented.has(polity.key));
  requireValue(missing.length === 0, `no selected geometry for ${missing.map((polity) => polity.key).join(', ')}`);
  features.sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'));
  const coordinates = features.reduce((sum, feature) => sum + coordinateCount(feature.geometry.coordinates), 0);
  return {
    schemaVersion: 1,
    asOf: manifest.id,
    simplification: {
      method: 'shared-grid quantization with collinear-point removal',
      stepDegrees: simplificationStep,
    },
    counts: {
      rosterPolities: roster.polities.length,
      exclusivePolities: exclusivePolities.length,
      representedPolities: represented.size,
      features: features.length,
      coordinates,
    },
    featureCollection: { type: 'FeatureCollection', features },
    provenance,
  };
}

export async function writeScenarioBorders(outputPath, result) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, 'utf8');
}
