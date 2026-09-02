#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  compileOhmSourcePack,
  discoverFromOhm,
  writeOhmCompileResult,
} from '../content/sources/ohm/adapter.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/ohm-source.mjs discover --date YYYY-MM-DD --cache FILE [--refresh] [--out FILE]',
    '  node scripts/ohm-source.mjs compile --spec FILE --cache FILE [--refresh] --out FILE',
  ].join('\n');
}

const args = process.argv.slice(2);
const command = args[0];
const refresh = args.includes('--refresh');
const cachePath = option(args, '--cache');
const outputPath = option(args, '--out');

if (!command || !cachePath) throw new Error(usage());

if (command === 'discover') {
  const asOf = option(args, '--date');
  if (!asOf) throw new Error(usage());
  const candidates = await discoverFromOhm({ asOf, cachePath: path.resolve(cachePath), refresh });
  const result = { schemaVersion: 1, asOf, candidates };
  if (outputPath) await writeOhmCompileResult(path.resolve(outputPath), result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'compile') {
  const specPath = option(args, '--spec');
  if (!specPath || !outputPath) throw new Error(usage());
  const result = await compileOhmSourcePack({
    specPath: path.resolve(specPath),
    cachePath: path.resolve(cachePath),
    refresh,
  });
  await writeOhmCompileResult(path.resolve(outputPath), result);
} else {
  throw new Error(usage());
}
