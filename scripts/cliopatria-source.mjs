#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { discoverCliopatriaFromArchive } from '../content/sources/cliopatria/adapter.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return 'Usage: node scripts/cliopatria-source.mjs discover --date YYYY-MM-DD --cache FILE [--refresh] --out FILE';
}

const args = process.argv.slice(2);
const command = args[0];
const asOf = option(args, '--date');
const cachePath = option(args, '--cache');
const outputPath = option(args, '--out');
if (command !== 'discover' || !asOf || !cachePath || !outputPath) throw new Error(usage());

const result = await discoverCliopatriaFromArchive({
  asOf,
  cachePath: path.resolve(cachePath),
  refresh: args.includes('--refresh'),
});
const resolvedOutput = path.resolve(outputPath);
await mkdir(path.dirname(resolvedOutput), { recursive: true });
await writeFile(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`Discovered ${result.candidates.length} Cliopatria polity rows for ${asOf}.\n`);
