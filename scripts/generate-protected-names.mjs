import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TGC = path.join(ROOT, 'content', 'raw', 'tgc');

const anchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/history/1830/anchors.json'), 'utf8'));
const anchorProvNames = anchors.anchors.filter((a) => a.kind === 'province').map((a) => a.provinceName);

const refBasemaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/history/1830/reference-basemaps.json'), 'utf8'));
const refBasemapProvNames = refBasemaps.provinceOverrides.map((a) => a.provinceName);

const bootstrap = fs.readFileSync(path.join(ROOT, 'src/sim/bootstrap.ts'), 'utf8');

// Extract MINORITY_RULES keys
const minMatch = bootstrap.match(/MINORITY_RULES:\s*Record<string,\s*MinorityRule\[\]>\s*=\s*\{([\s\S]*?)\n\};/);
const minKeys = [];
for (const line of minMatch[1].split('\n')) {
  const m = line.match(/^\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+))\s*:\s*\[/);
  if (m) minKeys.push(m[1] || m[2]);
}

// Extract SOUTH_ASIAN_SUNNI
const sunniMatch = bootstrap.match(/SOUTH_ASIAN_SUNNI\s*=\s*new\s*Set\(\[([\s\S]*?)\]\);/);
const sunniKeys = [...sunniMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);

// Extract PLACEHOLDER_NAME_RULES
const nameMatch = bootstrap.match(/PLACEHOLDER_NAME_RULES:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/);
const nameKeys = [];
for (const line of nameMatch[1].split('\n')) {
  const m = line.match(/^\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+))\s*:\s*['"]/);
  if (m) nameKeys.push(m[1] || m[2]);
}

// Extract PLACEHOLDER_RELIGION_RULES
const relMatch = bootstrap.match(/PLACEHOLDER_RELIGION_RULES:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/);
const relKeys = [];
for (const line of relMatch[1].split('\n')) {
  const m = line.match(/^\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+))\s*:\s*['"]/);
  if (m) relKeys.push(m[1] || m[2]);
}

// Extract statesNamed from gameData.ts
const gameData = fs.readFileSync(path.join(ROOT, 'src/data/gameData.ts'), 'utf8');
const statesNamedMatches = [...gameData.matchAll(/statesNamed\([^,]+,\s*\[([^\]]+)\]\)/g)];
const statesNamedKeys = statesNamedMatches.flatMap((m) => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]));

const all = new Set([...anchorProvNames, ...refBasemapProvNames, ...minKeys, ...sunniKeys, ...nameKeys, ...relKeys, ...statesNamedKeys]);
console.log('MINORITY_RULES keys:', minKeys.length);
console.log('PLACEHOLDER_NAME_RULES keys:', nameKeys.length);
console.log('PLACEHOLDER_RELIGION_RULES keys:', relKeys.length);
console.log('Total protected names count:', all.size);
fs.writeFileSync(path.join(TGC, 'protected-names.json'), JSON.stringify([...all].sort(), null, 2));
console.log('Wrote content/raw/tgc/protected-names.json');
