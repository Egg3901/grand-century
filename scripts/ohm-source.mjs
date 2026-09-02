#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  auditOhmGeometry,
  compileOhmSourcePack,
  curatedRelationsQuery,
  discoverFromOhm,
  findOhmRelationsByName,
  findOhmRelationsByWikidata,
  queryOverpassCached,
  writeOhmCompileResult,
} from '../content/sources/ohm/adapter.mjs';
import { mkdir, readFile } from 'node:fs/promises';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/ohm-source.mjs discover --date YYYY-MM-DD --cache FILE [--refresh] [--out FILE]',
    '  node scripts/ohm-source.mjs identity-search --date YYYY-MM-DD --wikidata QID,QID --cache FILE [--refresh] [--out FILE]',
    '  node scripts/ohm-source.mjs name-search --date YYYY-MM-DD --name TEXT --cache FILE [--refresh] [--out FILE]',
    '  node scripts/ohm-source.mjs compile --spec FILE --cache FILE [--refresh] --out FILE',
    '  node scripts/ohm-source.mjs geometry-audit --discovery FILE --cache-dir DIR [--chunk-size N] [--refresh] --out FILE',
    '  node scripts/ohm-source.mjs geometry-supplement-audit --spec FILE --cache-dir DIR [--refresh] --out FILE',
  ].join('\n');
}

const args = process.argv.slice(2);
const command = args[0];
const refresh = args.includes('--refresh');
const cachePath = option(args, '--cache');
const outputPath = option(args, '--out');

if (!command) throw new Error(usage());

if (command === 'discover') {
  const asOf = option(args, '--date');
  if (!asOf || !cachePath) throw new Error(usage());
  const candidates = await discoverFromOhm({ asOf, cachePath: path.resolve(cachePath), refresh });
  const result = { schemaVersion: 1, asOf, candidates };
  if (outputPath) await writeOhmCompileResult(path.resolve(outputPath), result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'identity-search') {
  const asOf = option(args, '--date');
  const wikidataIds = (option(args, '--wikidata') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!asOf || wikidataIds.length === 0 || !cachePath) throw new Error(usage());
  const candidates = await findOhmRelationsByWikidata({
    asOf,
    wikidataIds,
    cachePath: path.resolve(cachePath),
    refresh,
  });
  const result = { schemaVersion: 1, asOf, wikidataIds, candidates };
  if (outputPath) await writeOhmCompileResult(path.resolve(outputPath), result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'name-search') {
  const asOf = option(args, '--date');
  const searchText = option(args, '--name');
  if (!asOf || !searchText || !cachePath) throw new Error(usage());
  const candidates = await findOhmRelationsByName({
    asOf,
    searchText,
    cachePath: path.resolve(cachePath),
    refresh,
  });
  const result = { schemaVersion: 1, asOf, searchText, candidates };
  if (outputPath) await writeOhmCompileResult(path.resolve(outputPath), result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'compile') {
  const specPath = option(args, '--spec');
  if (!specPath || !cachePath || !outputPath) throw new Error(usage());
  const result = await compileOhmSourcePack({
    specPath: path.resolve(specPath),
    cachePath: path.resolve(cachePath),
    refresh,
  });
  await writeOhmCompileResult(path.resolve(outputPath), result);
} else if (command === 'geometry-audit') {
  const discoveryPath = option(args, '--discovery');
  const cacheDir = option(args, '--cache-dir');
  const chunkSize = Math.max(1, Math.min(50, Number(option(args, '--chunk-size') ?? 20)));
  if (!discoveryPath || !cacheDir || !outputPath) throw new Error(usage());
  const discovery = JSON.parse(await readFile(path.resolve(discoveryPath), 'utf8'));
  const relationIds = [...new Set(discovery.candidates.map((candidate) => candidate.relationId))].sort((a, b) => a - b);
  const resolvedCacheDir = path.resolve(cacheDir);
  await mkdir(resolvedCacheDir, { recursive: true });
  const entries = [];
  for (let offset = 0; offset < relationIds.length; offset += chunkSize) {
    const chunk = relationIds.slice(offset, offset + chunkSize);
    const cachePath = path.join(resolvedCacheDir, `relations-${String(offset / chunkSize).padStart(3, '0')}.json`);
    const document = await queryOverpassCached(curatedRelationsQuery(chunk), { cachePath, refresh });
    entries.push(...auditOhmGeometry(document, { asOf: discovery.asOf, relationIds: chunk }));
  }
  const counts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.status))]
      .sort()
      .map((status) => [status, entries.filter((entry) => entry.status === status).length]),
  );
  await writeOhmCompileResult(path.resolve(outputPath), {
    schemaVersion: 1,
    asOf: discovery.asOf,
    source: 'OpenHistoricalMap',
    relationCount: relationIds.length,
    counts,
    entries,
  });
} else if (command === 'geometry-supplement-audit') {
  const specPath = option(args, '--spec');
  const cacheDir = option(args, '--cache-dir');
  if (!specPath || !cacheDir || !outputPath) throw new Error(usage());
  const spec = JSON.parse(await readFile(path.resolve(specPath), 'utf8'));
  const resolvedCacheDir = path.resolve(cacheDir);
  await mkdir(resolvedCacheDir, { recursive: true });
  const entries = [];
  for (const supplement of spec.supplements ?? []) {
    const relationIds = [supplement.relationId];
    const cachePath = path.join(resolvedCacheDir, `supplement-${supplement.relationId}.json`);
    const document = await queryOverpassCached(curatedRelationsQuery(relationIds), { cachePath, refresh });
    const [entry] = auditOhmGeometry(document, { asOf: supplement.sourceAsOf, relationIds });
    entries.push({ ...entry, polityKey: supplement.polityKey, sourceAsOf: supplement.sourceAsOf });
  }
  await writeOhmCompileResult(path.resolve(outputPath), {
    schemaVersion: 1,
    asOf: spec.asOf,
    source: 'OpenHistoricalMap',
    entries,
  });
} else {
  throw new Error(usage());
}
