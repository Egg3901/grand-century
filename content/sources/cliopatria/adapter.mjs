import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const SOURCE_PATH = new URL('./source.json', import.meta.url);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function geometryBounds(coordinates, bounds = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (!Array.isArray(coordinates)) return bounds;
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds[0] = Math.min(bounds[0], coordinates[0]);
    bounds[1] = Math.min(bounds[1], coordinates[1]);
    bounds[2] = Math.max(bounds[2], coordinates[0]);
    bounds[3] = Math.max(bounds[3], coordinates[1]);
    return bounds;
  }
  for (const child of coordinates) geometryBounds(child, bounds);
  return bounds;
}

function geometryHash(geometry) {
  return sha256(Buffer.from(JSON.stringify(geometry)));
}

export async function loadCliopatriaSourceDefinition() {
  return readJson(SOURCE_PATH);
}

export async function loadCliopatriaArchive({ cachePath, refresh = false, fetchImpl = globalThis.fetch }) {
  if (!cachePath) throw new Error('[cliopatria] cachePath is required');
  const source = await loadCliopatriaSourceDefinition();
  let bytes;
  if (refresh) {
    if (typeof fetchImpl !== 'function') throw new Error('[cliopatria] no fetch implementation is available');
    const response = await fetchImpl(source.archiveUrl, {
      headers: { 'user-agent': 'GrandCenturyScenarioCompiler/1.0' },
    });
    if (!response.ok) throw new Error(`[cliopatria] archive returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, bytes);
  } else {
    try {
      bytes = await readFile(cachePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      throw new Error(`[cliopatria] cache missing at ${cachePath}; rerun with --refresh`);
    }
  }
  const actualHash = sha256(bytes);
  if (actualHash !== source.archiveSha256) {
    throw new Error(`[cliopatria] archive hash mismatch: expected ${source.archiveSha256}, received ${actualHash}`);
  }
  return { source, bytes };
}

export function parseCliopatriaArchive(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const name = Object.keys(files).find((entry) => entry.endsWith('.geojson') && !entry.startsWith('__MACOSX/'));
  if (!name) throw new Error('[cliopatria] archive contains no GeoJSON file');
  const document = JSON.parse(new TextDecoder().decode(files[name]));
  if (document?.type !== 'FeatureCollection' || !Array.isArray(document.features)) {
    throw new Error('[cliopatria] archive GeoJSON is not a FeatureCollection');
  }
  return document;
}

export function discoverCliopatria(document, asOf, source) {
  const year = Number(String(asOf).slice(0, 4));
  if (!Number.isInteger(year)) throw new Error(`[cliopatria] invalid scenario date ${asOf}`);
  return document.features
    .filter((feature) => {
      const properties = feature.properties ?? {};
      return properties.Type === 'POLITY'
        && Number(properties.FromYear) <= year
        && Number(properties.ToYear) >= year;
    })
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      return {
        sourceRecord: index,
        identityKey: properties.Wikidata || properties.SeshatID || `cliopatria:${properties.Name}`,
        name: properties.Name,
        wikidata: properties.Wikidata || null,
        seshatId: properties.SeshatID || null,
        fromYear: properties.FromYear,
        toYear: properties.ToYear,
        areaKm2: properties.Area,
        memberOf: properties.MemberOf || null,
        components: properties.Components || null,
        wikipedia: properties.Wikipedia || null,
        geometryType: feature.geometry?.type ?? null,
        geometryHash: geometryHash(feature.geometry),
        bounds: geometryBounds(feature.geometry?.coordinates),
        license: source.license,
      };
    })
    .sort((left, right) => String(left.identityKey).localeCompare(String(right.identityKey), 'en'));
}

export async function discoverCliopatriaFromArchive(options) {
  const { source, bytes } = await loadCliopatriaArchive(options);
  const document = parseCliopatriaArchive(bytes);
  return {
    schemaVersion: 1,
    asOf: options.asOf,
    source: {
      key: source.key,
      commit: source.commit,
      archiveSha256: source.archiveSha256,
      license: source.license,
      attribution: source.attribution,
      transformations: source.transformations,
    },
    featureCount: document.features.length,
    candidates: discoverCliopatria(document, options.asOf, source),
  };
}
