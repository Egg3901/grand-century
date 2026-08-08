#!/usr/bin/env node
/**
 * moonshot-merge.mjs — the 1820 world overhaul.
 *
 * The old seed had the granularity (620 NE admin-1 provinces) but not the
 * politics: Brazil inside Portugal, Greece/Serbia/Tunis inside the Ottoman
 * blob, Peru/Bolivia inside Spain, half of Africa in an "Uncivilized Regions"
 * catch-all, France six provinces, Prussia one. This script:
 *
 *   1. TRANSFERS existing provinces to ~20 new historical nations (no
 *      geometry change — ownership + renames only).
 *   2. SPLITS the under-provinced great powers (FRA 6→18, PRU 1→10,
 *      AUS 7→12, JPN 4→6, PER 4→6, DEN/SWI/BAV/VIE) using fleet-generated
 *      province tables in /tmp/gc-moonshot/out/*.clean.json.
 *   3. Fixes cultures nation-wide from the full 0.8.0 culture list.
 *   4. Rewrites worldSeed.json with stable ids for untouched provinces and
 *      appended ids for new ones, remapping capitals and core states.
 *   5. Emits the V5-input geojson for build-v7-borders.py (dropped provinces
 *      removed, stub squares for new ones so nearest-seed Voronoi claims
 *      their NE units).
 *
 * Usage: node scripts/moonshot-merge.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const SEED = 'src/data/generated/worldSeed.json';
const GEO = 'src/data/generated/provinces.geo.json';
const OUT_V5 = '/tmp/gc-moonshot/v5-input.geo.json';
const PACKS = '/tmp/gc-moonshot/out';

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const readPack = (name) => JSON.parse(readFileSync(`${PACKS}/${name}.clean.json`, 'utf8'));

// ---------------------------------------------------------------------------
// Pack orientation: some fleet agents swapped lon/lat. Vote per pack against
// reference capitals; swap the whole pack if the swapped reading wins.
const REFS = {
  'europe-west': [['Île-de-France', 2.4, 48.8], ['Brittany', -2.8, 48.1], ['Provence', 5.4, 43.5]],
  'europe-central': [['Brandenburg', 13.4, 52.5], ['Galicia', 24.0, 49.8], ['Lower Austria', 16.4, 48.2]],
  'balkans-ottoman': [['Morea', 22.0, 37.5], ['Tehran', 51.4, 35.7], ['Bosnia', 18.4, 43.9]],
  americas: [['Rio de Janeiro', -43.2, -22.9], ['Lima', -77.0, -12.0], ['Alta California', -121.5, 38.5]],
  asia: [['Lahore', 74.3, 31.6], ['Tonkin', 105.8, 21.0], ['Kashmir', 75.0, 34.0]],
  'africa-me': [['Tunis', 10.2, 36.8], ['Sokoto', 5.2, 13.1], ['Muscat', 58.6, 23.6]],
};
function fixOrientation(name, pack) {
  const rows = [...(pack.nations ?? []), ...(pack.expansions ?? [])].flatMap((x) => x.provinces ?? []);
  let straight = 0;
  let swapped = 0;
  for (const [ref, lon, lat] of REFS[name] ?? []) {
    const row = rows.find((r) => r.name.toLowerCase().includes(ref.toLowerCase()));
    if (!row) continue;
    const dS = Math.hypot(row.lon - lon, row.lat - lat);
    const dW = Math.hypot(row.lat - lon, row.lon - lat);
    if (dS <= dW) straight += 1; else swapped += 1;
  }
  if (swapped > straight) {
    for (const r of rows) { const t = r.lon; r.lon = r.lat; r.lat = t; }
    console.log(`[orient] ${name}: SWAPPED lon/lat (vote ${swapped}:${straight})`);
  }
  return pack;
}
const packs = Object.fromEntries(
  ['europe-west', 'europe-central', 'balkans-ottoman', 'americas', 'asia', 'africa-me']
    .map((n) => [n, fixOrientation(n, readPack(n))]),
);

// ---------------------------------------------------------------------------
// New nations. Metadata mine (colors muted, cultures from the full list);
// province tables come from transfers below or pack splits.
const NEW_NATIONS = [
  { tag: 'BRA', name: 'Empire of Brazil', color: [116, 138, 98], government: 'constitutional_monarchy', primaryCulture: 'latin_american', capital: 'Rio de Janeiro' },
  { tag: 'PEU', name: 'Peru', color: [158, 118, 106], government: 'presidential_dictatorship', primaryCulture: 'latin_american', capital: 'Lima' },
  { tag: 'BOL', name: 'Bolivia', color: [150, 108, 90], government: 'presidential_dictatorship', primaryCulture: 'latin_american', capital: 'La Paz' },
  { tag: 'URU', name: 'Uruguay', color: [122, 142, 158], government: 'presidential_dictatorship', primaryCulture: 'latin_american', capital: 'Uruguay' },
  { tag: 'ECU', name: 'Ecuador', color: [166, 148, 100], government: 'presidential_dictatorship', primaryCulture: 'latin_american', capital: 'Ecuador' },
  { tag: 'UCA', name: 'Central America', color: [110, 146, 134], government: 'presidential_dictatorship', primaryCulture: 'latin_american', capital: 'Guatemala' },
  { tag: 'HAI', name: 'Haiti', color: [96, 108, 146], government: 'presidential_dictatorship', primaryCulture: 'african', capital: 'Haiti' },
  { tag: 'GRE', name: 'Greece', color: [118, 152, 172], government: 'constitutional_monarchy', primaryCulture: 'greek', capital: 'Greece' },
  { tag: 'SER', name: 'Serbia', color: [140, 122, 132], government: 'absolute_monarchy', primaryCulture: 'south_slavic', capital: 'Serbia' },
  { tag: 'TUN', name: 'Beylik of Tunis', color: [170, 140, 104], government: 'absolute_monarchy', primaryCulture: 'arabic', capital: 'Tunisia' },
  { tag: 'TRI', name: 'Tripolitania', color: [172, 154, 118], government: 'absolute_monarchy', primaryCulture: 'arabic', capital: 'Tripolitania' },
  { tag: 'SIK', name: 'Sikh Empire', color: [152, 132, 84], government: 'absolute_monarchy', primaryCulture: 'south_asian', capital: 'Lahore' },
  { tag: 'HYD', name: 'Hyderabad', color: [164, 142, 122], government: 'absolute_monarchy', primaryCulture: 'south_asian', capital: 'Hyderabad' },
  { tag: 'AWA', name: 'Awadh', color: [148, 130, 108], government: 'absolute_monarchy', primaryCulture: 'south_asian', capital: 'Awadh' },
  { tag: 'ACE', name: 'Aceh', color: [110, 136, 116], government: 'absolute_monarchy', primaryCulture: 'malay', capital: 'Aceh' },
  { tag: 'SOK', name: 'Sokoto Caliphate', color: [134, 124, 88], government: 'absolute_monarchy', primaryCulture: 'african', capital: 'Kano' },
  { tag: 'ZUL', name: 'Zulu Kingdom', color: [118, 104, 92], government: 'uncivilized', primaryCulture: 'african', capital: 'Zululand' },
  { tag: 'MAD', name: 'Merina Kingdom', color: [128, 118, 140], government: 'absolute_monarchy', primaryCulture: 'african', capital: 'Antananarivo' },
  { tag: 'OMA', name: 'Oman', color: [146, 128, 112], government: 'absolute_monarchy', primaryCulture: 'arabic', capital: 'Muscat' },
  { tag: 'ASH', name: 'Ashanti Empire', color: [124, 112, 78], government: 'uncivilized', primaryCulture: 'african', capital: 'Ashanti' },
];

// ---------------------------------------------------------------------------
// Transfers: [donorTag, provinceName, newOwnerTag, renameTo?]
const TRANSFERS = [
  // Brazil + Uruguay out of Portugal
  ...seed.provinces
    .filter((p) => p.ownerTag === 'POR' && p.lon < -30 && p.name !== 'Uruguay')
    .map((p) => ['POR', p.name, 'BRA', p.name === 'Federal' ? 'Rio Grande Frontier' : null]),
  ['POR', 'Uruguay', 'URU', null],
  // Spanish America
  ['ESP', 'Lima', 'PEU', null], ['ESP', 'Cusco', 'PEU', null], ['ESP', 'Arequipa', 'PEU', null], ['ESP', 'Amazonas (Peru)', 'PEU', null],
  ['ESP', 'Altiplano', 'BOL', null], ['ESP', 'La Paz', 'BOL', null], ['ESP', 'Santa Cruz', 'BOL', null],
  ['ESP', 'Honduras', 'UCA', null],
  ['CLM', 'Ecuador', 'ECU', null],
  // Balkans + Maghreb out of the Ottoman blob
  ['OTT', 'Greece', 'GRE', null], ['OTT', 'Republic of Serbia', 'SER', 'Serbia'],
  ['OTT', 'Tunisia', 'TUN', null], ['OTT', 'Tripolitania', 'TRI', null], ['OTT', 'Fezzan', 'TRI', null], ['OTT', 'Cyrenaica', 'TRI', null],
  // India: Sikh Empire, Hyderabad, Awadh out of the EIC sweep
  ['ENG', 'Punjab (Pakistan)', 'SIK', 'Lahore'], ['ENG', 'Punjab', 'SIK', null], ['ENG', 'Jammu and Kashmir', 'SIK', 'Kashmir'],
  ['ENG', 'Ladakh', 'SIK', null], ['ENG', 'Himachal Pradesh', 'SIK', null], ['ENG', 'Frontier', 'SIK', 'Peshawar'],
  ['ENG', 'Telangana', 'HYD', 'Hyderabad'], ['ENG', 'Uttar Pradesh', 'AWA', 'Awadh'],
  ['ENG', 'KwaZulu-Natal', 'ZUL', 'Zululand'],
  ['NLD', 'Aceh', 'ACE', null],
  // Africa
  ['UNC', 'Kano', 'SOK', null], ['UNC', 'Middle Belt', 'SOK', 'Sokoto'],
  ['UNC', 'Antananarivo', 'MAD', null], ['UNC', 'Toamasina', 'MAD', null], ['UNC', 'Toliara', 'MAD', null],
  ['UNC', 'Oman', 'OMA', 'Muscat'], ['UNC', 'United Republic of Tanzania (East)', 'OMA', 'Zanzibar Coast'],
  ['UNC', 'Ghana', 'ASH', 'Ashanti'],
  ['UNC', 'Hejaz', 'EGY', null], // Egyptian Hejaz after the Wahhabi war
  // Colonial-blob cleanup
  ['COL', 'Moldova', 'RUS', 'Bessarabia'], ['COL', 'Luxembourg', 'NLD', null],
  ['COL', 'Bosnia and Herzegovina', 'OTT', 'Bosnia'], ['COL', 'Kosovo', 'OTT', null],
  ['COL', 'Montenegro', 'OTT', null], ['COL', 'North Macedonia', 'OTT', 'Macedonia'],
  ['COL', 'Iceland', 'DEN', null], ['COL', 'East Greenland', 'DEN', null], ['COL', 'North Greenland', 'DEN', null], ['COL', 'West Greenland', 'DEN', null],
  ['COL', 'Falkland Islands', 'ARG', null], ['COL', 'Guyana', 'ENG', null], ['COL', 'Suriname', 'NLD', null],
  ['COL', 'Jamaica', 'ENG', null], ['COL', 'The Bahamas', 'ENG', null], ['COL', 'Trinidad and Tobago', 'ENG', null],
  ['COL', 'Puerto Rico', 'ESP', null], ['COL', 'Belize', 'ENG', 'British Honduras'],
  ['COL', 'Haiti', 'HAI', null], ['COL', 'Dominican Republic', 'HAI', 'Santo Domingo'],
  ['COL', 'Guatemala', 'UCA', null], ['COL', 'El Salvador', 'UCA', null], ['COL', 'Nicaragua', 'UCA', null], ['COL', 'Costa Rica', 'UCA', null],
  ['COL', 'Fiji', 'UNC', null], ['COL', 'Solomon Islands', 'UNC', null], ['COL', 'Vanuatu', 'UNC', null], ['COL', 'New Caledonia', 'UNC', null],
  ['COL', 'Papua New Guinea (Northwest)', 'UNC', null], ['COL', 'Papua New Guinea (Southeast)', 'UNC', null], ['COL', 'Papua New Guinea (Southwest)', 'UNC', null],
];
const DELETIONS = [['COL', 'Antarctica']];

// ---------------------------------------------------------------------------
// Splits: nation -> pack expansion. Donor's old provinces are dropped and the
// pack's rows appended. SWE is deliberately absent (existing 6 incl. a finer
// Norway beats the pack's 5). Pack Tejas dropped (MEX already has Texas).
const SPLITS = [
  { tag: 'FRA', pack: 'europe-west', mode: 'replace' },
  { tag: 'DEN', pack: 'europe-west', mode: 'replace', keep: ['Iceland', 'East Greenland', 'North Greenland', 'West Greenland'] },
  { tag: 'SWI', pack: 'europe-west', mode: 'replace' },
  { tag: 'NLD', pack: 'europe-west', mode: 'add', only: ['Flanders', 'Wallonia'], drop: ['Belgium'] },
  { tag: 'PRU', pack: 'europe-central', mode: 'replace' },
  { tag: 'AUS', pack: 'europe-central', mode: 'replace' },
  { tag: 'BAV', pack: 'europe-central', mode: 'replace' },
  { tag: 'PER', pack: 'balkans-ottoman', mode: 'replace' },
  { tag: 'JPN', pack: 'asia', mode: 'replace' },
  { tag: 'VIE', pack: 'asia', mode: 'replace' },
  { tag: 'MEX', pack: 'americas', mode: 'add', only: ['Alta California', 'Nuevo México', 'Nuevo Mexico'] },
];

// Culture repair for existing nations (seed only knew 8 cultures).
const CULTURE_FIX = {
  AFG: 'central_asian', PER: 'persian', EGY: 'arabic', MOR: 'arabic', ETH: 'african',
  NEP: 'south_asian', BHU: 'south_asian', CAM: 'indochinese', LAO: 'indochinese', VIE: 'indochinese',
  SIA: 'indochinese', BUR: 'indochinese', KOR: 'korean', JPN: 'japanese',
  ARG: 'latin_american', CHL: 'latin_american', MEX: 'latin_american', VEN: 'latin_american',
  CLM: 'latin_american', PRG: 'latin_american', OTT: 'turkish', SWE: 'scandinavian', DEN: 'scandinavian',
  ESP: 'iberian', POR: 'iberian', NLD: 'french', SWI: 'south_german', PAP: 'italian', SAR: 'italian',
  TSC: 'italian', TUS: 'italian', MOD: 'italian', PAR: 'italian', HAN: 'north_german', HES: 'south_german',
  SAX: 'north_german', WUR: 'south_german', BAD: 'south_german', BAV: 'south_german', PRU: 'north_german',
};

// ===========================================================================
// Execution
const byId = new Map(seed.provinces.map((p) => [p.id, p]));
const findProv = (owner, name) => seed.provinces.find((p) => p.ownerTag === owner && p.name === name);
let missing = 0;

for (const [donor, name, to, rename] of TRANSFERS) {
  const p = findProv(donor, name);
  if (!p) { console.log(`[MISS] transfer ${donor}/${name}`); missing += 1; continue; }
  p.ownerTag = to;
  if (rename) p.name = rename;
}
const dropIds = new Set();
for (const [donor, name] of DELETIONS) {
  const p = findProv(donor, name);
  if (p) dropIds.add(p.id);
}

// Splits
let nextId = Math.max(...seed.provinces.map((p) => p.id)) + 1;
const newProvinces = [];
for (const split of SPLITS) {
  const pack = packs[split.pack];
  const exp = (pack.expansions ?? []).find((e) => e.ownerTag === split.tag)
    ?? (pack.nations ?? []).find((n) => n.tag === split.tag);
  if (!exp) { console.log(`[MISS] split source ${split.tag} in ${split.pack}`); missing += 1; continue; }
  let rows = exp.provinces ?? [];
  if (split.only) rows = rows.filter((r) => split.only.includes(r.name));
  if (split.mode === 'replace') {
    for (const p of seed.provinces.filter((p) => p.ownerTag === split.tag)) {
      if (split.keep?.includes(p.name)) continue;
      dropIds.add(p.id);
    }
  }
  for (const drop of split.drop ?? []) {
    const p = findProv(split.tag, drop);
    if (p) dropIds.add(p.id);
  }
  for (const r of rows) {
    newProvinces.push({
      id: nextId, name: r.name, ownerTag: split.tag, stateId: -1, stateName: r.stateName ?? r.name,
      terrain: r.terrain, coastal: !!r.coastal, rgoGood: r.rgoGood, neighbors: [],
      lon: r.lon, lat: r.lat, populationWeight: r.populationWeight,
    });
    nextId += 1;
  }
  console.log(`[split] ${split.tag}: +${rows.length} provinces${split.mode === 'replace' ? ' (replaced old)' : ''}`);
}

// Assemble province list
seed.provinces = seed.provinces.filter((p) => !dropIds.has(p.id)).concat(newProvinces);

// States: 1:1 with provinces, rebuilt clean
seed.provinces.forEach((p, i) => { p.stateId = i; });
seed.states = seed.provinces.map((p) => ({ id: p.stateId, name: p.stateName ?? p.name }));

// Nations: drop COL, append new, fix cultures, remap capitals + cores
seed.nations = seed.nations.filter((n) => n.tag !== 'COL');
for (const n of NEW_NATIONS) {
  seed.nations.push({
    tag: n.tag, name: n.name, color: n.color, government: n.government,
    primaryCulture: n.primaryCulture, capitalProvinceId: -1, coreStateIds: [], _capital: n.capital,
  });
}
const owned = new Map();
for (const p of seed.provinces) {
  if (!owned.has(p.ownerTag)) owned.set(p.ownerTag, []);
  owned.get(p.ownerTag).push(p);
}
for (const n of seed.nations) {
  if (CULTURE_FIX[n.tag]) n.primaryCulture = CULTURE_FIX[n.tag];
  const mine = owned.get(n.tag) ?? [];
  if (mine.length === 0) { console.log(`[WARN] nation ${n.tag} owns nothing`); continue; }
  // Capital: explicit name for new nations; else keep if still owned; else richest owned.
  const wantName = n._capital;
  delete n._capital;
  const capital = (wantName && mine.find((p) => p.name === wantName))
    ?? (byId.get(n.capitalProvinceId)?.ownerTag === n.tag ? byId.get(n.capitalProvinceId) : null)
    ?? mine.slice().sort((a, b) => b.populationWeight - a.populationWeight)[0];
  n.capitalProvinceId = capital.id;
  // Cores: everything owned now, PLUS old cores whose province still exists
  // (donors keep revanchist cores on lost lands).
  const oldCores = new Set(n.coreStateIds ?? []);
  const stateIds = new Set(mine.map((p) => p.stateId));
  for (const p of seed.provinces) if (oldCores.has(p.stateId)) stateIds.add(p.stateId);
  n.coreStateIds = [...stateIds].sort((a, b) => a - b);
}

console.log(`provinces: ${seed.provinces.length} (dropped ${dropIds.size}, added ${newProvinces.length}) | nations: ${seed.nations.length} | missing lookups: ${missing}`);

if (DRY) process.exit(0);

// Renumber province ids compactly (geometry rebuild follows anyway) and
// remap all references.
const idMap = new Map();
seed.provinces.forEach((p, i) => { idMap.set(p.id, i); });
for (const p of seed.provinces) { p.id = idMap.get(p.id); p.neighbors = []; }
for (const n of seed.nations) n.capitalProvinceId = idMap.get(n.capitalProvinceId) ?? 0;
seed.provinceCount = seed.provinces.length;
seed.source = 'moonshot-merge 2026-08-07 (NE admin-1 + fleet packs)';

writeFileSync(SEED, JSON.stringify(seed));

// V5 input: existing geometry minus dropped, plus stub squares for new pids.
const geo = JSON.parse(readFileSync(GEO, 'utf8'));
const features = [];
for (const f of geo.features) {
  const oldId = f.properties.id;
  if (dropIds.has(oldId)) continue;
  const ni = idMap.get(oldId);
  if (ni === undefined) continue;
  f.properties.id = ni;
  f.properties.n = seed.provinces[ni].name;
  features.push(f);
}
for (const p of newProvinces) {
  // newProvinces entries are the same objects as in seed.provinces, so p.id
  // has already been renumbered above — use it directly.
  const ni = p.id;
  const d = 0.35;
  features.push({
    type: 'Feature',
    properties: { id: ni, n: p.name },
    geometry: { type: 'Polygon', coordinates: [[[p.lon - d, p.lat - d], [p.lon + d, p.lat - d], [p.lon + d, p.lat + d], [p.lon - d, p.lat + d], [p.lon - d, p.lat - d]]] },
  });
}

writeFileSync(OUT_V5, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`wrote ${SEED} and ${OUT_V5} (${features.length} features)`);
