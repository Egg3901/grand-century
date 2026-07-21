#!/usr/bin/env node
/**
 * fix-capitals.mjs — heal worldSeed capitalProvinceId with real 1820 capitals.
 *
 * The original seed bake picked capitals by population/order, which landed
 * "United Kingdom capital: Bangladesh", "Russia: Crimea", "USA: Alabama" —
 * every capital-anchored label and capital star glyph inherited the error.
 *
 * For each nation: find the OWNED province whose polygon contains the real
 * historical capital coordinates; fall back to the owned province nearest to
 * it. COL/UNC (game constructs) are left untouched.
 *
 * Run: node scripts/fix-capitals.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED_PATH = path.join(ROOT, 'src/data/generated/worldSeed.json');
const GEO_PATH = path.join(ROOT, 'src/data/generated/provinces.geo.json');

// Real capital coordinates, 1820 (start of campaign).
const CAPITALS = {
  ENG: [-0.12, 51.5],    // London
  FRA: [2.35, 48.85],    // Paris
  RUS: [30.31, 59.94],   // St Petersburg
  AUS: [16.37, 48.21],   // Vienna
  PRU: [13.4, 52.52],    // Berlin
  OTT: [28.98, 41.01],   // Constantinople
  ESP: [-3.7, 40.42],    // Madrid
  POR: [-9.14, 38.72],   // Lisbon
  NLD: [4.9, 52.37],     // Amsterdam
  DEN: [12.57, 55.68],   // Copenhagen
  SWE: [18.07, 59.33],   // Stockholm
  SWI: [7.45, 46.95],    // Bern
  BAV: [11.58, 48.14],   // Munich
  SAX: [13.74, 51.05],   // Dresden
  HAN: [9.73, 52.37],    // Hanover
  WUR: [9.18, 48.78],    // Stuttgart
  BAD: [8.4, 49.01],     // Karlsruhe
  HES: [8.65, 49.87],    // Darmstadt
  SAR: [7.69, 45.07],    // Turin
  TSC: [14.25, 40.85],   // Naples
  PAP: [12.48, 41.9],    // Rome
  TUS: [11.25, 43.77],   // Florence
  MOD: [10.92, 44.65],   // Modena
  PAR: [10.33, 44.8],    // Parma
  QNG: [116.4, 39.9],    // Beijing
  JPN: [139.69, 35.69],  // Edo
  KOR: [126.98, 37.57],  // Hanyang (Seoul)
  SIA: [100.5, 13.75],   // Bangkok
  BUR: [96.08, 21.98],   // Amarapura
  VIE: [107.58, 16.47],  // Hue
  CAM: [104.75, 11.8],   // Oudong
  LAO: [102.13, 19.89],  // Luang Prabang
  NEP: [85.32, 27.7],    // Kathmandu
  BHU: [89.64, 27.47],   // Thimphu
  AFG: [69.17, 34.53],   // Kabul
  PER: [51.39, 35.69],   // Tehran
  EGY: [31.24, 30.05],   // Cairo
  MOR: [-5.0, 34.03],    // Fez
  ETH: [37.47, 12.6],    // Gondar
  USA: [-77.04, 38.91],  // Washington
  MEX: [-99.13, 19.43],  // Mexico City
  ARG: [-58.38, -34.6],  // Buenos Aires
  CHL: [-70.65, -33.45], // Santiago
  CLM: [-74.07, 4.61],   // Bogotá
  VEN: [-66.9, 10.48],   // Caracas
  PRG: [-57.63, -25.28], // Asunción
};

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const geo = JSON.parse(readFileSync(GEO_PATH, 'utf8'));
const geomById = new Map(geo.features.map((f) => [f.properties.id, f.geometry]));

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(geometry, x, y) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

let fixed = 0;
for (const nation of seed.nations) {
  const target = CAPITALS[nation.tag];
  if (!target) continue;
  const [cx, cy] = target;
  const owned = seed.provinces.filter((p) => p.ownerTag === nation.tag);
  let pick = owned.find((p) => {
    const g = geomById.get(p.id);
    return g && contains(g, cx, cy);
  });
  if (!pick) {
    let bd = Infinity;
    for (const p of owned) {
      const d = (p.lon - cx) ** 2 + (p.lat - cy) ** 2;
      if (d < bd) { bd = d; pick = p; }
    }
  }
  if (pick && pick.id !== nation.capitalProvinceId) {
    const oldName = seed.provinces.find((p) => p.id === nation.capitalProvinceId)?.name;
    console.log(`${nation.tag}: ${oldName} -> ${pick.name}`);
    nation.capitalProvinceId = pick.id;
    fixed++;
  }
}
writeFileSync(SEED_PATH, JSON.stringify(seed));
console.log(`fixed ${fixed} capitals`);
