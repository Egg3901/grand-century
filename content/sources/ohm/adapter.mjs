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
  return `[out:json][timeout:180];relation(id:${relationIds.join(',')});out geom;`;
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
      return {
        relationId: element.id,
        identityKey: element.tags?.wikidata ?? element.tags?.name ?? `ohm:relation:${element.id}`,
        name: element.tags?.name ?? null,
        wikidata: element.tags?.wikidata ?? null,
        startDate: element.tags?.start_date ?? null,
        endDate: element.tags?.end_date ?? null,
        license: license.effective,
        licenseStatus: license.status,
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
  const byId = new Map((document?.elements ?? []).map((element) => [element.id, element]));
  const features = [];
  const provenance = [];
  for (const boundary of sourcePack.boundaries) {
    const relation = byId.get(boundary.relationId);
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
    const feature = relationToGeoJsonFeature(relation);
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
