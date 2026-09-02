#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditHistoricalBasemap } from './lib/historical-basemap-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const configPath = path.join(root, 'content/history/1830/reference-basemaps.json');
const worldPath = path.join(root, 'src/data/generated/worldSeed.json');
const outputPath = path.resolve(root, option('--output', 'artifacts/historical-map-audit.json'));
const config = await readJson(configPath);
const source = option('--source', config.references[0].url);

let reference;
if (/^https?:\/\//.test(source)) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to fetch reference map: HTTP ${response.status}`);
  reference = await response.json();
} else {
  reference = await readJson(path.resolve(root, source));
}

const report = auditHistoricalBasemap({
  world: await readJson(worldPath),
  reference,
  config,
});
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const { summary } = report;
console.log(`[historical-audit] ${summary.currentProvinces} provinces against ${summary.referenceFeatures} reference features`);
console.log(`[historical-audit] agreement=${summary.agreement} mismatch=${summary.mismatch} unmapped=${summary['unmapped-reference']} uncovered=${summary.uncovered}`);
console.log(`[historical-audit] report: ${path.relative(root, outputPath)}`);
for (const group of report.mismatchGroups.slice(0, 12)) {
  console.log(`  ${group.currentOwnerTag} -> ${group.expectedOwnerTags.join('|')}: ${group.count} [${group.provinceIds.join(', ')}]`);
}
