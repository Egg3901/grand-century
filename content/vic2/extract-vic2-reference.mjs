/**
 * Extracts a Victoria II installation into a single checked-in reference JSON.
 *
 * Grand Century does not ship Vic2 data; this script reads a local install and
 * emits `vic2-reference.json`, which the map and history pipelines consume. Run
 * it once per Vic2 version bump:
 *
 *   node content/vic2/extract-vic2-reference.mjs [path-to-Victoria 2]
 *
 * What it pulls:
 *   map/definition.csv      province ids -> English province names
 *   map/default.map         land/sea split (sea_starts)
 *   map/region.txt          549 state regions -> member provinces
 *   map/continent.txt       province -> continent, for super-region grouping
 *   localisation/*.csv      English names for region keys and country tags
 *   common/countries.txt    tag -> country definition file
 *   common/countries/*.txt  map colours
 *   history/countries/*.txt capital, primary culture, government, civilised
 *   history/provinces/**    province ownership at the 1836 baseline
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_V2 = 'C:/Program Files (x86)/Steam/steamapps/common/Victoria 2';
const V = process.argv[2] ?? DEFAULT_V2;
const OUT = path.join(__dirname, 'vic2-reference.json');

if (!existsSync(path.join(V, 'map/definition.csv'))) {
  console.error(`No Victoria II install at: ${V}`);
  console.error('Pass the install path as the first argument.');
  process.exit(1);
}

/** Vic2 text is Windows-1252; Node only has latin1, which differs over 0x80-0x9F. */
const CP1252_HIGH = '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f'
  + '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
function readText(file) {
  const buf = readFileSync(file);
  let s = '';
  for (const b of buf) s += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
  return s;
}
const read = (rel) => readText(path.join(V, rel));

function mode(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------- provinces
const provinceName = new Map();
for (const line of read('map/definition.csv').split(/\r?\n/).slice(1)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const cols = line.split(';');
  const id = Number(cols[0]);
  if (Number.isFinite(id) && cols[4]) provinceName.set(id, cols[4].trim());
}

const seaBlock = read('map/default.map').match(/sea_starts\s*=\s*\{([\s\S]*?)\}/)[1];
const firstSea = Math.min(...seaBlock.trim().split(/\s+/).map(Number).filter(Number.isFinite));
const isLand = (id) => id > 0 && id < firstSea;

// ---------------------------------------------------------------- continents
const provinceContinent = new Map();
for (const m of read('map/continent.txt').matchAll(/^(\w+)\s*=\s*\{([\s\S]*?)^\}/gm)) {
  const continent = m[1];
  const provs = m[2].match(/provinces\s*=\s*\{([\s\S]*?)\}/);
  if (!provs) continue;
  for (const p of provs[1].trim().split(/\s+/).map(Number)) {
    if (Number.isFinite(p)) provinceContinent.set(p, continent);
  }
}

// ---------------------------------------------------------------- localisation
/** key -> English string. First file to define a key wins, matching Vic2 load order. */
const loc = new Map();
for (const file of readdirSync(path.join(V, 'localisation')).filter((f) => f.endsWith('.csv'))) {
  for (const line of readText(path.join(V, 'localisation', file)).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(';');
    if (i < 1) continue;
    const key = line.slice(0, i);
    const english = line.slice(i + 1).split(';')[0];
    if (english && !loc.has(key)) loc.set(key, english);
  }
}

// ---------------------------------------------------------------- regions
/** Three region keys Vic2 never localises; named here from their member provinces. */
const REGION_NAME_OVERRIDES = {
  FRA_1097: 'Eastern Polynesia', // Tahiti, New Caledonia, Marquesas, Tuamotus, Wallis and Futuna
  BRZ_2540: 'Western Polynesia', // Tonga, Samoa, Cook Islands, Tokelau, Ellice Islands
  SPA_517: 'Gibraltar',
};

const regions = [];
for (const m of read('map/region.txt').matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*\{([^}]*)\}/gm)) {
  const key = m[1];
  const provinceIds = m[2].trim().split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && isLand(n));
  if (!provinceIds.length) continue;
  const continents = provinceIds.map((p) => provinceContinent.get(p)).filter(Boolean);
  regions.push({
    key,
    name: REGION_NAME_OVERRIDES[key] ?? loc.get(key) ?? key,
    continent: continents.length ? mode(continents) : null,
    provinceIds,
    provinceNames: provinceIds.map((p) => provinceName.get(p) ?? `Province ${p}`),
  });
}

// ---------------------------------------------------------------- countries
const countries = [];
for (const m of read('common/countries.txt').matchAll(/^\s*([A-Z]{3})\s*=\s*"?([^"\r\n]+)"?/gm)) {
  const [, tag, file] = m;
  if (tag === 'REB') continue;
  const defPath = path.join(V, 'common', file.trim());
  let color = null;
  if (existsSync(defPath)) {
    const c = readText(defPath).match(/color\s*=\s*\{\s*(\d+)\s+(\d+)\s+(\d+)\s*\}/);
    if (c) color = [Number(c[1]), Number(c[2]), Number(c[3])];
  }
  countries.push({ tag, name: loc.get(tag) ?? tag, color, definitionFile: file.trim() });
}

// history/countries/<TAG> - <Name>.txt carries the 1836 setup
const historyDir = path.join(V, 'history/countries');
const byTag = new Map(countries.map((c) => [c.tag, c]));
for (const file of readdirSync(historyDir).filter((f) => f.endsWith('.txt'))) {
  const tag = file.slice(0, 3).toUpperCase();
  const country = byTag.get(tag);
  if (!country) continue;
  const txt = readText(path.join(historyDir, file));
  // Only the undated head of the file describes the 1836 start.
  const head = txt.split(/^\s*\d{3,4}\.\d{1,2}\.\d{1,2}\s*=/m)[0];
  const grab = (key) => head.match(new RegExp(`^\\s*${key}\\s*=\\s*([\\w.]+)`, 'm'))?.[1] ?? null;
  country.capitalProvinceId = Number(grab('capital')) || null;
  country.primaryCulture = grab('primary_culture');
  country.religion = grab('religion');
  country.government = grab('government');
  country.civilized = grab('civilized') === 'yes';
  country.literacy = Number(grab('literacy')) || null;
  country.nationalValue = grab('nationalvalue');
}

// ---------------------------------------------------------------- ownership
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fp = path.join(dir, entry);
    if (statSync(fp).isDirectory()) walk(fp, out);
    else if (entry.endsWith('.txt')) out.push(fp);
  }
  return out;
}

/** Owner as of `cutoffYear`: the undated block, overridden by the latest dated block at or before it. */
function ownerAsOf(txt, cutoffYear) {
  const head = txt.split(/^\s*\d{3,4}\.\d{1,2}\.\d{1,2}\s*=/m)[0];
  let owner = head.match(/^\s*owner\s*=\s*([A-Z]{3})/m)?.[1] ?? null;
  let best = null;
  for (const m of txt.matchAll(/(\d{3,4})\.(\d{1,2})\.(\d{1,2})\s*=\s*\{([\s\S]*?)\n\}/g)) {
    const year = Number(m[1]);
    if (year > cutoffYear) continue;
    const dated = m[4].match(/owner\s*=\s*([A-Z]{3})/)?.[1];
    if (dated && (!best || year >= best.year)) best = { year, owner: dated };
  }
  return best ? best.owner : owner;
}

const ownership = {};
const cores = {};
for (const fp of walk(path.join(V, 'history/provinces'))) {
  const id = Number(path.basename(fp).split(/[\s\-_]/)[0]);
  if (!Number.isFinite(id) || !isLand(id)) continue;
  const txt = readText(fp);
  const owner = ownerAsOf(txt, 1836);
  if (owner) ownership[id] = owner;
  const head = txt.split(/^\s*\d{3,4}\.\d{1,2}\.\d{1,2}\s*=/m)[0];
  const coreTags = [...head.matchAll(/add_core\s*=\s*([A-Z]{3})/g)].map((m) => m[1]);
  if (coreTags.length) cores[id] = [...new Set(coreTags)];
}

// Region-level ownership: every owner present, largest share first.
for (const r of regions) {
  const tally = {};
  for (const p of r.provinceIds) {
    const owner = ownership[p];
    if (owner) tally[owner] = (tally[owner] ?? 0) + 1;
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  r.owners1836 = ranked.map(([tag, provinces]) => ({ tag, provinces }));
  r.dominantOwner1836 = ranked.length ? ranked[0][0] : null;
  r.uncolonizedProvinces = r.provinceIds.filter((p) => !ownership[p]).length;
}

const landOwningTags = new Set(Object.values(ownership));
const out = {
  source: `Victoria II (Heart of Darkness) install at ${V}`,
  generatedAt: new Date().toISOString(),
  baselineYear: 1836,
  stats: {
    landProvinces: [...provinceName.keys()].filter(isLand).length,
    ownedProvinces: Object.keys(ownership).length,
    regions: regions.length,
    countryTags: countries.length,
    landOwningTags: landOwningTags.size,
  },
  regions,
  countries,
  ownership,
  cores,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote', path.relative(process.cwd(), OUT));
console.log(out.stats);
