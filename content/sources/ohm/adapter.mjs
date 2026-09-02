import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { relationActiveOn } from './temporal.mjs';
import { evaluateOhmLicense, requireAllowedOhmLicense } from './license.mjs';
import { relationToGeoJsonFeature } from './multipolygon.mjs';

export const OHM_OVERPASS_URL = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function adminBoundaryDiscoveryQuery() {
  return '[out:json][timeout:180];relation["boundary"="administrative"]["admin_level"="2"];out tags;';
}

export function curatedRelationsQuery(relationIds) {
  if (!Array.isArray(relationIds) || relationIds.length === 0) throw new Error('[ohm] no relation IDs requested');
  for (const id of relationIds) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`[ohm] invalid relation ID ${String(id)}`);
  }
  return `[out:json][timeout:180];relation(id:${relationIds.join(',')})->.roots;(.roots;.roots >>;);out geom;`;
}

export function expandNestedRelation(relation, byId, ancestry = new Set()) {
  if (ancestry.has(relation.id)) throw new Error(`[ohm] relation ${relation.id} contains a nested relation cycle`);
  const nextAncestry = new Set(ancestry).add(relation.id);
  const members = [];
  for (const member of relation.members ?? []) {
    if (member.type !== 'relation') {
      members.push(member);
      continue;
    }
    const child = byId.get(`relation:${member.ref}`);
    if (!child || child.type !== 'relation') {
      throw new Error(`[ohm] relation ${relation.id} is missing nested relation ${member.ref}`);
    }
    const expandedChild = expandNestedRelation(child, byId, nextAncestry);
    for (const childMember of expandedChild.members ?? []) {
      const childRole = childMember.role ?? '';
      const role = member.role === 'inner'
        ? (childRole === 'inner' ? 'outer' : 'inner')
        : childRole || member.role;
      members.push({
        ...childMember,
        role,
      });
    }
  }
  return { ...relation, members };
}

export function indexOhmDocument(document) {
  return new Map((document?.elements ?? []).map((element) => [`${element.type}:${element.id}`, element]));
}

export function compileOhmRelationGeometry(document, {
  relationId,
  asOf,
  closeOuterChainsMaxGapDegrees = 0,
  elementIndex = null,
}) {
  const byId = elementIndex ?? indexOhmDocument(document);
  const relation = byId.get(`relation:${relationId}`);
  if (!relation) throw new Error(`[ohm] cache is missing relation ${relationId}`);
  if (!relationActiveOn(relation.tags, asOf)) throw new Error(`[ohm] relation ${relationId} is not active on ${asOf}`);
  requireAllowedOhmLicense(relation.tags, `relation ${relationId}`);
  return relationToGeoJsonFeature(
    expandNestedRelation(relation, byId),
    { closeOuterChainsMaxGapDegrees },
  );
}

/** Read a deterministic cache by default. Network access requires refresh=true. */
export async function queryOverpassCached(query, options) {
  const { cachePath, refresh = false, fetchImpl = globalThis.fetch } = options ?? {};
  if (!cachePath) throw new Error('[ohm] cachePath is required');
  if (!refresh) {
    try {
      const cache = await readJson(cachePath);
      if (cache?.schemaVersion !== 1 || cache?.endpoint !== OHM_OVERPASS_URL || typeof cache?.query !== 'string') {
        throw new Error(`[ohm] cache at ${cachePath} predates query fingerprints; refresh it`);
      }
      if (cache.query !== query) throw new Error(`[ohm] cache query mismatch at ${cachePath}; refresh it for this source pack`);
      if (!Array.isArray(cache.document?.elements)) throw new Error(`[ohm] cache at ${cachePath} has no Overpass document`);
      return cache.document;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      throw new Error(`[ohm] cache missing at ${cachePath}; rerun with --refresh to query OHM`);
    }
  }
  if (typeof fetchImpl !== 'function') throw new Error('[ohm] no fetch implementation is available');
  const body = new URLSearchParams({ data: query });
  const response = await fetchImpl(OHM_OVERPASS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'GrandCenturyScenarioCompiler/1.0',
    },
    body,
  });
  if (!response.ok) throw new Error(`[ohm] Overpass returned HTTP ${response.status}`);
  const document = await response.json();
  if (!Array.isArray(document?.elements)) throw new Error('[ohm] Overpass response has no elements array');
  await writeJson(cachePath, {
    schemaVersion: 1,
    endpoint: OHM_OVERPASS_URL,
    query,
    document,
  });
  return document;
}

export function discoverActiveAdminBoundaries(document, asOf) {
  if (!Array.isArray(document?.elements)) throw new Error('[ohm] discovery document has no elements array');
  return document.elements
    .filter((element) => element.type === 'relation' && relationActiveOn(element.tags, asOf))
    .map((element) => {
      const license = evaluateOhmLicense(element.tags);
      const evidenceTags = Object.fromEntries([
        'place',
        'border_type',
        'country',
        'colony',
        'colony_of',
        'dependency_of',
        'protectorate_of',
        'territory',
        'disputed',
        'source',
        'wikipedia',
      ].flatMap((key) => element.tags?.[key] === undefined ? [] : [[key, element.tags[key]]]));
      return {
        relationId: element.id,
        identityKey: element.tags?.wikidata ?? element.tags?.name ?? `ohm:relation:${element.id}`,
        name: element.tags?.name ?? null,
        wikidata: element.tags?.wikidata ?? null,
        startDate: element.tags?.start_date ?? null,
        endDate: element.tags?.end_date ?? null,
        license: license.effective,
        licenseStatus: license.status,
        evidenceTags,
      };
    })
    .sort((left, right) => (
      String(left.identityKey).localeCompare(String(right.identityKey)) || left.relationId - right.relationId
    ));
}

function provenanceFor(relation, sourceSpec, license) {
  return {
    source: 'OpenHistoricalMap',
    elementType: 'relation',
    elementId: relation.id,
    elementUrl: `https://www.openhistoricalmap.org/relation/${relation.id}`,
    purpose: sourceSpec.purpose,
    polityKey: sourceSpec.polityKey,
    asOf: sourceSpec.asOf,
    name: relation.tags?.name ?? null,
    wikidata: relation.tags?.wikidata ?? null,
    startDate: relation.tags?.start_date ?? null,
    endDate: relation.tags?.end_date ?? null,
    sourceTag: relation.tags?.source ?? null,
    license: license.effective,
  };
}

export function compileCuratedRelations(document, sourcePack) {
  if (sourcePack?.schemaVersion !== 1 || typeof sourcePack.asOf !== 'string') {
    throw new Error('[ohm] source pack must declare schemaVersion 1 and asOf');
  }
  if (!Array.isArray(sourcePack.boundaries) || sourcePack.boundaries.length === 0) {
    throw new Error('[ohm] source pack has no curated boundaries');
  }
  const byId = new Map((document?.elements ?? []).map((element) => [`${element.type}:${element.id}`, element]));
  const features = [];
  const provenance = [];
  for (const boundary of sourcePack.boundaries) {
    const relation = byId.get(`relation:${boundary.relationId}`);
    if (!relation) throw new Error(`[ohm] cache is missing curated relation ${boundary.relationId}`);
    if (!relationActiveOn(relation.tags, sourcePack.asOf)) {
      throw new Error(`[ohm] relation ${relation.id} is not active on ${sourcePack.asOf}`);
    }
    if (boundary.expectedName && relation.tags?.name !== boundary.expectedName) {
      throw new Error(`[ohm] relation ${relation.id} changed name from ${boundary.expectedName} to ${relation.tags?.name ?? 'unnamed'}`);
    }
    if (boundary.expectedWikidata && relation.tags?.wikidata !== boundary.expectedWikidata) {
      throw new Error(`[ohm] relation ${relation.id} changed Wikidata identity`);
    }
    const license = requireAllowedOhmLicense(relation.tags, `relation ${relation.id}`);
    const feature = relationToGeoJsonFeature(expandNestedRelation(relation, byId));
    feature.properties.polityKey = boundary.polityKey;
    feature.properties.purpose = boundary.purpose;
    features.push(feature);
    provenance.push(provenanceFor(relation, { ...boundary, asOf: sourcePack.asOf }, license));
  }
  return {
    schemaVersion: 1,
    asOf: sourcePack.asOf,
    featureCollection: { type: 'FeatureCollection', features },
    provenance,
  };
}

function coordinateCount(geometry) {
  if (!Array.isArray(geometry)) return 0;
  if (geometry.length > 0 && typeof geometry[0] === 'number') return 1;
  return geometry.reduce((sum, child) => sum + coordinateCount(child), 0);
}

export function auditOhmGeometry(document, { asOf, relationIds }) {
  if (!Array.isArray(document?.elements)) throw new Error('[ohm] geometry audit document has no elements array');
  const byId = new Map(document.elements.map((element) => [`${element.type}:${element.id}`, element]));
  return relationIds.slice().sort((a, b) => a - b).map((relationId) => {
    const relation = byId.get(`relation:${relationId}`);
    if (!relation) return { relationId, status: 'missing', error: 'Relation is absent from the Overpass response.' };
    const name = relation.tags?.name ?? null;
    const wikidata = relation.tags?.wikidata ?? null;
    if (!relationActiveOn(relation.tags, asOf)) {
      return { relationId, name, wikidata, status: 'inactive', error: `Relation is not active on ${asOf}.` };
    }
    const license = evaluateOhmLicense(relation.tags);
    if (license.status !== 'allowed') {
      return { relationId, name, wikidata, status: 'license_review', license: license.effective };
    }
    try {
      const feature = relationToGeoJsonFeature(expandNestedRelation(relation, byId));
      const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates.length : 1;
      return {
        relationId,
        name,
        wikidata,
        status: 'valid',
        geometryType: feature.geometry.type,
        polygons,
        coordinates: coordinateCount(feature.geometry.coordinates),
        license: license.effective,
      };
    } catch (error) {
      return {
        relationId,
        name,
        wikidata,
        status: 'invalid_geometry',
        error: error instanceof Error ? error.message : String(error),
        license: license.effective,
      };
    }
  });
}

export async function loadSourcePack(specPath) {
  return readJson(specPath);
}

export async function discoverFromOhm({ asOf, cachePath, refresh = false, fetchImpl }) {
  const document = await queryOverpassCached(adminBoundaryDiscoveryQuery(), { cachePath, refresh, fetchImpl });
  return discoverActiveAdminBoundaries(document, asOf);
}

export async function compileOhmSourcePack({ specPath, cachePath, refresh = false, fetchImpl }) {
  const sourcePack = await loadSourcePack(specPath);
  const relationIds = sourcePack.boundaries?.map((boundary) => boundary.relationId) ?? [];
  const document = await queryOverpassCached(curatedRelationsQuery(relationIds), { cachePath, refresh, fetchImpl });
  return compileCuratedRelations(document, sourcePack);
}

export async function writeOhmCompileResult(outputPath, result) {
  await writeJson(outputPath, result);
}
