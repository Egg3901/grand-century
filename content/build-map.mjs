import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { topology as buildTopology } from 'topojson-server';
import { feature, neighbors as topoNeighbors } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'content', 'raw');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'generated');

const ADMIN1_FILES = [
  'ne_50m_admin_1_states_provinces.geojson',
  'ne_110m_admin_1_states_provinces.geojson',
];
const ADMIN0_FILE = 'ne_110m_admin_0_countries.geojson';

const MIN_PROVINCES = 300;
const MAX_PROVINCES = 800;
const SLIVER_ABS_AREA = 0.012;
/** Whole-country provinces above this planar area get an organic Voronoi split. */
const OVERSIZE_AREA_THRESHOLD = 32;
const ORGANIC_DENSE_EDGE = 0.55;
/** Topology-preserving simplify: quantize snaps shared edges, then shared-arc simplify. */
const TOPO_QUANTIZE = 1e5;
/** Fraction of smallest triangles removed; lower keeps more coastline detail. */
const TOPO_SIMPLIFY_QUANTILE = 0.05;
/** Densify + jitter spacing / amplitude for artificial partition chords (degrees). */
const CUT_DENSE_EDGE = 0.15;
/** Amplitude for post-simplify shared-arc debox (degrees). */
const CUT_JITTER_AMPLITUDE = 0.08;
const KEEP_LARGE_ADMINS = new Set([
  'russia',
  'united states of america',
  'united states',
  'canada',
  'china',
  'brazil',
  'india',
  'indonesia',
  'australia',
  'south africa',
]);
/** Skip ice-sheet / non-playable blobs; leave as a single province. */
const SKIP_ORGANIC_SPLIT = new Set([
  'antarctica',
]);

const GOV_DEFAULT = 'absolute_monarchy';

// ---------------------------------------------------------------- Vic2 re-cut
/**
 * Provinces are cut to Victoria II's 549 state regions rather than to modern
 * administrative units. content/vic2/ holds the extracted Vic2 tables and the
 * lon/lat each region warps to; see extract-vic2-reference.mjs and
 * build-region-points.mjs for how they are produced.
 */
const VIC2_DIR = path.join(ROOT, 'content', 'vic2');

/**
 * Vic2 tag -> Grand Century tag, for nations GC already has events, decisions,
 * formables or tests keyed to its own spelling. Anything absent here keeps its
 * Vic2 tag and is filled in from the Vic2 country table.
 */
const VIC2_TAG_ALIAS = {
  CHI: 'QNG', // Qing
  TUR: 'OTT', // Ottomans
  SPA: 'ESP',
  NET: 'NLD',
  BRZ: 'BRA',
  JAP: 'JPN',
  DAI: 'VIE', // Dai Nam / Vietnam
  VNZ: 'VEN',
  URU: 'URY',
  SIC: 'TSC', // Two Sicilies
  ALD: 'ALG', // Aldjazair / Regency of Algiers
};

/** Grand Century tags that must survive even with no starting land. */
const VIC2_KEEP_TAGLESS = ['TEX', 'BEL', 'COL', 'UNC', 'UNA'];

function toGrandCenturyTag(vic2Tag) {
  if (!vic2Tag) return null;
  return VIC2_TAG_ALIAS[vic2Tag] ?? vic2Tag;
}

const NATION_LIBRARY = {
  ENG: { name: 'United Kingdom', color: [176, 94, 84], government: 'hms_government', primaryCulture: 'british' },
  FRA: { name: 'France', color: [106, 124, 182], government: 'constitutional_monarchy', primaryCulture: 'french' },
  PRU: { name: 'Prussia', color: [82, 88, 116], government: 'constitutional_monarchy', primaryCulture: 'north_german' },
  AUS: { name: 'Austrian Empire', color: [154, 132, 92], government: 'absolute_monarchy', primaryCulture: 'south_german' },
  RUS: { name: 'Russian Empire', color: [112, 128, 92], government: 'absolute_monarchy', primaryCulture: 'russian' },
  USA: { name: 'United States', color: [132, 98, 88], government: 'democracy', primaryCulture: 'yankee' },
  QNG: { name: 'Qing Empire', color: [146, 126, 72], government: 'uncivilized', primaryCulture: 'han' },
  OTT: { name: 'Ottoman Empire', color: [128, 112, 88], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  ESP: { name: 'Spain', color: [170, 136, 88], government: 'constitutional_monarchy', primaryCulture: 'french' },
  POR: { name: 'Portugal', color: [166, 124, 86], government: 'constitutional_monarchy', primaryCulture: 'french' },
  NLD: { name: 'Netherlands', color: [148, 132, 110], government: 'constitutional_monarchy', primaryCulture: 'north_german' },
  SWE: { name: 'Sweden', color: [132, 148, 170], government: 'constitutional_monarchy', primaryCulture: 'north_german' },
  SAR: { name: 'Sardinia-Piedmont', color: [174, 152, 122], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  TSC: { name: 'Two Sicilies', color: [163, 130, 102], government: 'absolute_monarchy', primaryCulture: 'south_german' },
  BAV: { name: 'Bavaria', color: [146, 122, 168], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  SAX: { name: 'Kingdom of Saxony', color: [132, 118, 152], government: 'constitutional_monarchy', primaryCulture: 'north_german' },
  HAN: { name: 'Kingdom of Hanover', color: [138, 132, 160], government: 'constitutional_monarchy', primaryCulture: 'north_german' },
  WUR: { name: 'Wurttemberg', color: [164, 134, 118], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  BAD: { name: 'Baden', color: [172, 144, 124], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  HES: { name: 'Hesse', color: [150, 128, 142], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  PAP: { name: 'Papal States', color: [196, 184, 142], government: 'absolute_monarchy', primaryCulture: 'south_german' },
  TUS: { name: 'Grand Duchy of Tuscany', color: [170, 146, 132], government: 'constitutional_monarchy', primaryCulture: 'south_german' },
  MOD: { name: 'Duchy of Modena', color: [162, 136, 126], government: 'absolute_monarchy', primaryCulture: 'south_german' },
  PAR: { name: 'Duchy of Parma', color: [168, 142, 130], government: 'absolute_monarchy', primaryCulture: 'south_german' },
  TEX: { name: 'Republic of Texas', color: [144, 122, 110], government: 'presidential_dictatorship', primaryCulture: 'yankee' },
  JPN: { name: 'Tokugawa Shogunate', color: [146, 132, 112], government: 'uncivilized', primaryCulture: 'han' },
  MEX: { name: 'Mexico', color: [146, 118, 96], government: 'presidential_dictatorship', primaryCulture: 'yankee' },
  BRA: { name: 'Brazil', color: [128, 148, 102], government: 'constitutional_monarchy', primaryCulture: 'french' },
  ARG: { name: 'Argentina', color: [150, 154, 186], government: 'presidential_dictatorship', primaryCulture: 'french' },
  PER: { name: 'Persia', color: [140, 114, 90], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  PEU: { name: 'Peru', color: [162, 126, 102], government: 'presidential_dictatorship', primaryCulture: 'french' },
  BEL: { name: 'Belgium', color: [166, 140, 100], government: 'constitutional_monarchy', primaryCulture: 'french' },
  GRE: { name: 'Kingdom of Greece', color: [132, 152, 184], government: 'absolute_monarchy', primaryCulture: 'french' },
  // BEL/GRE/TEX remain in the library for mid-game events but are not 1820 starters.
  DEN: { name: 'Denmark', color: [170, 122, 108], government: 'absolute_monarchy', primaryCulture: 'north_german' },
  SWI: { name: 'Switzerland', color: [188, 166, 132], government: 'democracy', primaryCulture: 'south_german' },
  EGY: { name: 'Egypt', color: [158, 132, 86], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  AFG: { name: 'Afghanistan', color: [128, 110, 84], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  SIA: { name: 'Siam', color: [154, 116, 104], government: 'absolute_monarchy', primaryCulture: 'han' },
  KOR: { name: 'Joseon Korea', color: [142, 136, 166], government: 'absolute_monarchy', primaryCulture: 'han' },
  MOR: { name: 'Morocco', color: [156, 118, 98], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  ETH: { name: 'Ethiopia', color: [128, 136, 96], government: 'absolute_monarchy', primaryCulture: 'turkish' },
  NEP: { name: 'Nepal', color: [140, 122, 104], government: 'absolute_monarchy', primaryCulture: 'han' },
  BHU: { name: 'Bhutan', color: [150, 130, 108], government: 'absolute_monarchy', primaryCulture: 'han' },
  BUR: { name: 'Burma', color: [162, 128, 98], government: 'absolute_monarchy', primaryCulture: 'han' },
  VIE: { name: 'Dai Nam', color: [156, 132, 108], government: 'absolute_monarchy', primaryCulture: 'han' },
  CAM: { name: 'Cambodia', color: [156, 124, 112], government: 'absolute_monarchy', primaryCulture: 'han' },
  LAO: { name: 'Laos', color: [146, 120, 114], government: 'absolute_monarchy', primaryCulture: 'han' },
  CHL: { name: 'Chile', color: [132, 150, 174], government: 'presidential_dictatorship', primaryCulture: 'french' },
  CLM: { name: 'New Granada', color: [154, 138, 108], government: 'presidential_dictatorship', primaryCulture: 'french' },
  VEN: { name: 'Venezuela', color: [168, 146, 108], government: 'presidential_dictatorship', primaryCulture: 'french' },
  BOL: { name: 'Bolivia', color: [148, 132, 104], government: 'presidential_dictatorship', primaryCulture: 'french' },
  PRG: { name: 'Paraguay', color: [142, 120, 106], government: 'presidential_dictatorship', primaryCulture: 'french' },
  URY: { name: 'Uruguay', color: [148, 156, 186], government: 'presidential_dictatorship', primaryCulture: 'french' },
  COL: { name: 'Colonial Territories', color: [162, 150, 132], government: 'uncivilized', primaryCulture: 'british' },
  UNC: { name: 'Uncivilized Regions', color: [136, 128, 112], government: 'uncivilized', primaryCulture: 'han' },
  UNA: { name: 'Unclaimed Frontier', color: [108, 104, 98], government: 'uncivilized', primaryCulture: 'han' },
};

const MAJOR_TAGS = ['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'QNG', 'OTT', 'ESP', 'POR', 'NLD', 'SWE', 'SAR', 'TSC'];
/**
 * 1830 starters. Greece is independent (London Protocol, February 1830); Belgium
 * is not (the revolt is eight months away) and Texas is still Mexican.
 */
const REQUIRED_MINOR_TAGS = [
  'BAV', 'SAX', 'HAN', 'WUR', 'BAD', 'HES', 'PAP', 'TUS', 'MOD', 'PAR',
  'DEN', 'SWI', 'EGY', 'PER', 'AFG', 'SIA', 'KOR', 'MOR', 'MEX',
];

/** Plausible 1820 political map (ISO → tag). */
const ISO_TO_TAG = {
  af: 'AFG', al: 'OTT', be: 'NLD', bh: 'OTT', bo: 'ESP', bt: 'BHU', ch: 'SWI', cl: 'CHL',
  co: 'CLM', dk: 'DEN', ec: 'CLM', eg: 'EGY', et: 'ETH', ge: 'RUS', gr: 'OTT', hn: 'ESP',
  ir: 'PER', jo: 'EGY', kh: 'CAM', kp: 'KOR', kr: 'KOR', la: 'LAO', ma: 'MOR', mm: 'BUR',
  np: 'NEP', pa: 'ESP', pe: 'ESP', py: 'PRG', rs: 'OTT', ro: 'OTT', sd: 'EGY', sy: 'EGY',
  th: 'SIA', uy: 'POR', ve: 'VEN', vn: 'VIE',
};

/** Plausible 1820 owner lookup by modern country name. */
const COUNTRY_TO_TAG = {
  'united kingdom': 'ENG', ireland: 'ENG', canada: 'ENG', australia: 'ENG', 'new zealand': 'ENG',
  india: 'ENG', pakistan: 'ENG', bangladesh: 'ENG', 'south africa': 'ENG', nigeria: 'UNC',
  egypt: 'EGY', france: 'FRA', belgium: 'NLD', algeria: 'OTT', germany: 'PRU', denmark: 'DEN',
  switzerland: 'SWI', 'czech republic': 'AUS', czechia: 'AUS', slovakia: 'AUS', hungary: 'AUS',
  slovenia: 'AUS', croatia: 'AUS', austria: 'AUS', russia: 'RUS', ukraine: 'RUS', belarus: 'RUS',
  lithuania: 'RUS', latvia: 'RUS', estonia: 'RUS', finland: 'RUS', kazakhstan: 'RUS', georgia: 'RUS',
  armenia: 'RUS', azerbaijan: 'RUS', 'united states of america': 'USA', 'united states': 'USA',
  china: 'QNG', mongolia: 'QNG', taiwan: 'QNG', turkey: 'OTT', syria: 'EGY', iraq: 'OTT',
  jordan: 'EGY', lebanon: 'EGY', israel: 'EGY', palestine: 'EGY', saudi: 'UNC', yemen: 'UNC',
  greece: 'OTT', spain: 'ESP', cuba: 'ESP', philippines: 'ESP', portugal: 'POR', angola: 'POR',
  mozambique: 'POR', netherlands: 'NLD', indonesia: 'NLD', sweden: 'SWE', norway: 'SWE',
  italy: 'SAR', 'sardinia-piedmont': 'SAR', sicily: 'TSC', japan: 'JPN', mexico: 'MEX',
  brazil: 'POR', argentina: 'ARG', peru: 'ESP', chile: 'CHL', colombia: 'CLM', ecuador: 'CLM',
  venezuela: 'VEN', bolivia: 'ESP', paraguay: 'PRG', uruguay: 'POR', iran: 'PER', persia: 'PER',
  afghanistan: 'AFG', thailand: 'SIA', cambodia: 'CAM', laos: 'LAO', vietnam: 'VIE',
  myanmar: 'BUR', burma: 'BUR', korea: 'KOR', 'south korea': 'KOR', 'north korea': 'KOR',
  ethiopia: 'ETH', morocco: 'MOR', nepal: 'NEP', bhutan: 'BHU', tunisia: 'OTT', libya: 'OTT',
  sudan: 'EGY', 'south sudan': 'EGY', prussia: 'PRU', 'ottoman empire': 'OTT', romania: 'OTT',
  serbia: 'OTT', poland: 'RUS',
};

/** Historical named regions clipped from modern Germany / Italy outlines (exclusive bounds, not grid boxes). */
const HISTORICAL_PARTITIONS = {
  germany: [
    { name: 'Hanover', ownerTag: 'HAN', bounds: { minLon: 5.5, maxLon: 12.5, minLat: 52.15, maxLat: 55.5 } },
    { name: 'Saxony', ownerTag: 'SAX', bounds: { minLon: 11.6, maxLon: 15.5, minLat: 50.2, maxLat: 52.15 } },
    { name: 'Hesse', ownerTag: 'HES', bounds: { minLon: 7.6, maxLon: 11.6, minLat: 50.2, maxLat: 52.15 } },
    { name: 'Bavaria', ownerTag: 'BAV', bounds: { minLon: 10.25, maxLon: 14.0, minLat: 47.2, maxLat: 50.2 } },
    { name: 'Wurttemberg', ownerTag: 'WUR', bounds: { minLon: 8.75, maxLon: 10.25, minLat: 47.35, maxLat: 50.2 } },
    { name: 'Baden', ownerTag: 'BAD', bounds: { minLon: 7.2, maxLon: 8.75, minLat: 47.35, maxLat: 50.2 } },
    { name: 'Prussia', ownerTag: 'PRU', bounds: null },
  ],
  italy: [
    { name: 'Two Sicilies', ownerTag: 'TSC', bounds: { minLon: 12.4, maxLon: 19.0, minLat: 36.4, maxLat: 41.55 } },
    { name: 'Papal States', ownerTag: 'PAP', bounds: { minLon: 11.3, maxLon: 14.5, minLat: 41.55, maxLat: 43.85 } },
    { name: 'Tuscany', ownerTag: 'TUS', bounds: { minLon: 9.7, maxLon: 12.2, minLat: 42.4, maxLat: 44.15 } },
    { name: 'Modena', ownerTag: 'MOD', bounds: { minLon: 10.6, maxLon: 12.3, minLat: 44.15, maxLat: 45.05 } },
    { name: 'Parma', ownerTag: 'PAR', bounds: { minLon: 9.3, maxLon: 10.6, minLat: 44.15, maxLat: 45.15 } },
    { name: 'Lombardy-Venetia', ownerTag: 'AUS', bounds: { minLon: 8.5, maxLon: 13.9, minLat: 45.05, maxLat: 47.2 } },
    { name: 'Piedmont', ownerTag: 'SAR', bounds: null },
  ],
};

/**
 * Real regional seeds for organic Voronoi splits of oversized single-admin countries.
 * Coordinates are approximate historic/regional centers used only as partition sites.
 */
const ORGANIC_REGION_SEEDS = {
  france: [
    { name: 'Île-de-France', lon: 2.35, lat: 48.86 },
    { name: 'Normandy', lon: 1.09, lat: 49.44 },
    { name: 'Brittany', lon: -1.68, lat: 48.11 },
    { name: 'Aquitaine', lon: -0.58, lat: 44.84 },
    { name: 'Occitanie', lon: 1.44, lat: 43.60 },
    { name: 'Provence', lon: 5.37, lat: 43.30 },
  ],
  spain: [
    { name: 'Castile', lon: -3.70, lat: 40.42 },
    { name: 'Andalusia', lon: -5.98, lat: 37.39 },
    { name: 'Catalonia', lon: 2.17, lat: 41.39 },
    { name: 'Galicia', lon: -8.54, lat: 42.88 },
    { name: 'Valencia', lon: -0.38, lat: 39.47 },
  ],
  'united kingdom': [
    { name: 'England', lon: -1.5, lat: 52.5 },
    { name: 'Scotland', lon: -4.2, lat: 56.5 },
    { name: 'Wales', lon: -3.8, lat: 52.3 },
    { name: 'Ireland', lon: -7.5, lat: 53.4 },
  ],
  sweden: [
    { name: 'Svealand', lon: 18.07, lat: 59.33 },
    { name: 'Götaland', lon: 11.97, lat: 57.71 },
    { name: 'Norrland', lon: 18.15, lat: 63.18 },
  ],
  norway: [
    { name: 'Eastern Norway', lon: 10.75, lat: 59.91 },
    { name: 'Western Norway', lon: 5.32, lat: 60.39 },
    { name: 'Northern Norway', lon: 18.96, lat: 69.65 },
  ],
  poland: [
    { name: 'Greater Poland', lon: 16.93, lat: 52.41 },
    { name: 'Lesser Poland', lon: 19.94, lat: 50.06 },
    { name: 'Mazovia', lon: 21.01, lat: 52.23 },
    { name: 'Pomerania', lon: 18.65, lat: 54.35 },
  ],
  turkey: [
    { name: 'Thrace', lon: 28.98, lat: 41.01 },
    { name: 'Anatolia', lon: 32.86, lat: 39.93 },
    { name: 'Pontus', lon: 39.72, lat: 41.00 },
    { name: 'Cilicia', lon: 35.32, lat: 37.00 },
  ],
  iran: [
    { name: 'Persia', lon: 51.39, lat: 35.69 },
    { name: 'Khorasan', lon: 59.57, lat: 36.26 },
    { name: 'Fars', lon: 52.53, lat: 29.59 },
    { name: 'Azerbaijan', lon: 46.29, lat: 38.08 },
  ],
  egypt: [
    { name: 'Lower Egypt', lon: 31.24, lat: 30.04 },
    { name: 'Upper Egypt', lon: 32.90, lat: 25.69 },
    { name: 'Western Desert', lon: 28.5, lat: 27.5 },
  ],
  algeria: [
    { name: 'Algiers', lon: 3.06, lat: 36.75 },
    { name: 'Oran', lon: -0.64, lat: 35.70 },
    { name: 'Constantine', lon: 6.61, lat: 36.37 },
    { name: 'Sahara', lon: 3.0, lat: 28.0 },
  ],
  morocco: [
    { name: 'Maghreb', lon: -7.98, lat: 31.63 },
    { name: 'Rif', lon: -5.0, lat: 35.2 },
    { name: 'Souss', lon: -9.6, lat: 30.4 },
  ],
  libya: [
    { name: 'Tripolitania', lon: 13.19, lat: 32.89 },
    { name: 'Cyrenaica', lon: 20.07, lat: 32.12 },
    { name: 'Fezzan', lon: 14.4, lat: 27.0 },
  ],
  mexico: [
    { name: 'Central Mexico', lon: -99.13, lat: 19.43 },
    { name: 'Yucatán', lon: -89.62, lat: 20.97 },
    { name: 'Northern Mexico', lon: -106.07, lat: 28.63 },
    { name: 'Pacific Mexico', lon: -103.35, lat: 20.66 },
    { name: 'Gulf Mexico', lon: -96.13, lat: 19.17 },
  ],
  argentina: [
    { name: 'Buenos Aires', lon: -58.38, lat: -34.60 },
    { name: 'Patagonia', lon: -68.3, lat: -41.1 },
    { name: 'Northwest Argentina', lon: -65.2, lat: -26.8 },
    { name: 'Cuyo', lon: -68.85, lat: -32.89 },
    { name: 'Litoral', lon: -60.7, lat: -31.6 },
  ],
  peru: [
    { name: 'Lima', lon: -77.04, lat: -12.05 },
    { name: 'Arequipa', lon: -71.54, lat: -16.41 },
    { name: 'Cusco', lon: -71.97, lat: -13.53 },
    { name: 'Amazonas', lon: -73.5, lat: -5.5 },
  ],
  chile: [
    { name: 'Central Chile', lon: -70.67, lat: -33.45 },
    { name: 'Norte Grande', lon: -70.3, lat: -23.65 },
    { name: 'Araucanía', lon: -72.59, lat: -38.74 },
  ],
  japan: [
    { name: 'Kanto', lon: 139.69, lat: 35.68 },
    { name: 'Kansai', lon: 135.50, lat: 34.69 },
    { name: 'Kyushu', lon: 130.40, lat: 33.59 },
    { name: 'Tohoku', lon: 140.87, lat: 38.27 },
  ],
  kazakhstan: [
    { name: 'Western Kazakhstan', lon: 51.92, lat: 47.12 },
    { name: 'Northern Kazakhstan', lon: 71.47, lat: 51.18 },
    { name: 'Southern Kazakhstan', lon: 76.93, lat: 43.24 },
    { name: 'Eastern Kazakhstan', lon: 82.62, lat: 49.95 },
    { name: 'Central Kazakhstan', lon: 67.0, lat: 48.0 },
  ],
  ukraine: [
    { name: 'Kyiv', lon: 30.52, lat: 50.45 },
    { name: 'Kharkiv', lon: 36.23, lat: 49.99 },
    { name: 'Odessa', lon: 30.72, lat: 46.48 },
    { name: 'Lviv', lon: 24.03, lat: 49.84 },
  ],
  finland: [
    { name: 'Southern Finland', lon: 24.94, lat: 60.17 },
    { name: 'Ostrobothnia', lon: 21.51, lat: 63.10 },
    { name: 'Lapland', lon: 25.73, lat: 66.50 },
  ],
  afghanistan: [
    { name: 'Kabul', lon: 69.17, lat: 34.53 },
    { name: 'Herat', lon: 62.20, lat: 34.35 },
    { name: 'Kandahar', lon: 65.72, lat: 31.61 },
    { name: 'Balkh', lon: 67.00, lat: 36.76 },
  ],
  mongolia: [
    { name: 'Ulaanbaatar', lon: 106.91, lat: 47.92 },
    { name: 'Western Mongolia', lon: 91.64, lat: 46.1 },
    { name: 'Eastern Mongolia', lon: 114.5, lat: 48.0 },
    { name: 'Gobi', lon: 104.0, lat: 43.5 },
  ],
  'saudi arabia': [
    { name: 'Hejaz', lon: 39.83, lat: 21.39 },
    { name: 'Nejd', lon: 46.72, lat: 24.69 },
    { name: 'Eastern Arabia', lon: 50.1, lat: 26.4 },
    { name: 'Asir', lon: 42.5, lat: 18.2 },
  ],
  sudan: [
    { name: 'Khartoum', lon: 32.56, lat: 15.50 },
    { name: 'Darfur', lon: 24.2, lat: 13.5 },
    { name: 'Kordofan', lon: 30.2, lat: 13.0 },
    { name: 'Red Sea Coast', lon: 37.2, lat: 19.6 },
  ],
  ethiopia: [
    { name: 'Shewa', lon: 38.74, lat: 9.03 },
    { name: 'Tigray', lon: 39.47, lat: 13.50 },
    { name: 'Oromia', lon: 39.0, lat: 7.5 },
    { name: 'Amhara', lon: 37.4, lat: 11.6 },
  ],
  thailand: [
    { name: 'Central Siam', lon: 100.50, lat: 13.76 },
    { name: 'Northern Siam', lon: 98.99, lat: 18.79 },
    { name: 'Isan', lon: 102.79, lat: 16.43 },
    { name: 'Southern Siam', lon: 99.33, lat: 9.97 },
  ],
  myanmar: [
    { name: 'Lower Burma', lon: 96.16, lat: 16.80 },
    { name: 'Upper Burma', lon: 96.08, lat: 21.97 },
    { name: 'Shan', lon: 97.4, lat: 20.8 },
  ],
  pakistan: [
    { name: 'Punjab', lon: 74.36, lat: 31.55 },
    { name: 'Sindh', lon: 67.00, lat: 24.86 },
    { name: 'Baluchistan', lon: 67.00, lat: 30.18 },
    { name: 'Frontier', lon: 71.52, lat: 34.01 },
  ],
  colombia: [
    { name: 'Bogotá', lon: -74.07, lat: 4.71 },
    { name: 'Caribbean Colombia', lon: -75.5, lat: 10.4 },
    { name: 'Pacific Colombia', lon: -76.5, lat: 3.5 },
    { name: 'Llanos', lon: -70.5, lat: 5.0 },
  ],
  venezuela: [
    { name: 'Caracas', lon: -66.90, lat: 10.48 },
    { name: 'Zulia', lon: -71.64, lat: 10.67 },
    { name: 'Guayana', lon: -62.7, lat: 8.3 },
    { name: 'Los Llanos', lon: -67.5, lat: 8.0 },
  ],
  bolivia: [
    { name: 'La Paz', lon: -68.15, lat: -16.50 },
    { name: 'Santa Cruz', lon: -63.18, lat: -17.78 },
    { name: 'Altiplano', lon: -66.9, lat: -19.0 },
  ],
  angola: [
    { name: 'Luanda', lon: 13.23, lat: -8.84 },
    { name: 'Huambo', lon: 15.74, lat: -12.78 },
    { name: 'Cuando Cubango', lon: 17.7, lat: -16.0 },
  ],
  mozambique: [
    { name: 'Maputo', lon: 32.57, lat: -25.97 },
    { name: 'Beira', lon: 34.84, lat: -19.83 },
    { name: 'Nampula', lon: 39.27, lat: -15.12 },
  ],
  nigeria: [
    { name: 'Lagos', lon: 3.38, lat: 6.52 },
    { name: 'Kano', lon: 8.52, lat: 12.00 },
    { name: 'Niger Delta', lon: 6.9, lat: 4.8 },
    { name: 'Middle Belt', lon: 7.5, lat: 9.1 },
  ],
  madagascar: [
    { name: 'Antananarivo', lon: 47.51, lat: -18.88 },
    { name: 'Toamasina', lon: 49.40, lat: -18.15 },
    { name: 'Toliara', lon: 43.67, lat: -23.35 },
  ],
  greenland: [
    { name: 'West Greenland', lon: -51.7, lat: 64.2 },
    { name: 'East Greenland', lon: -37.6, lat: 65.6 },
    { name: 'North Greenland', lon: -46.0, lat: 77.0 },
  ],
  iraq: [
    { name: 'Baghdad', lon: 44.37, lat: 33.31 },
    { name: 'Basra', lon: 47.78, lat: 30.51 },
    { name: 'Mosul', lon: 43.12, lat: 36.34 },
  ],
  'democratic republic of the congo': [
    { name: 'Kinshasa', lon: 15.31, lat: -4.33 },
    { name: 'Katanga', lon: 27.48, lat: -11.66 },
    { name: 'Orientale', lon: 25.2, lat: 0.5 },
    { name: 'Kasai', lon: 23.6, lat: -5.9 },
    { name: 'Equateur', lon: 18.3, lat: 0.0 },
  ],
  mali: [
    { name: 'Bamako', lon: -8.00, lat: 12.64 },
    { name: 'Timbuktu', lon: -3.00, lat: 16.77 },
    { name: 'Gao', lon: 0.04, lat: 16.27 },
  ],
  niger: [
    { name: 'Niamey', lon: 2.11, lat: 13.51 },
    { name: 'Agadez', lon: 7.99, lat: 16.97 },
    { name: 'Zinder', lon: 8.99, lat: 13.81 },
  ],
  chad: [
    { name: 'N\'Djamena', lon: 15.04, lat: 12.13 },
    { name: 'Borkou', lon: 18.0, lat: 17.9 },
    { name: 'Ouaddaï', lon: 21.0, lat: 13.8 },
  ],
  mauritania: [
    { name: 'Nouakchott', lon: -15.98, lat: 18.07 },
    { name: 'Adrar', lon: -11.95, lat: 20.5 },
    { name: 'Hodh', lon: -8.0, lat: 16.5 },
  ],
};

const FORMABLE_TEMPLATES = [
  {
    key: 'GERMANY',
    resultTag: 'GER',
    resultName: 'German Empire',
    resultColor: [75, 77, 88],
    resultPrimaryCulture: 'north_german',
    candidateTags: ['PRU', 'BAV', 'SAX', 'HAN', 'BAD', 'WUR', 'HES', 'AUS'],
    ownerTags: ['PRU', 'BAV', 'SAX', 'HAN', 'BAD', 'WUR', 'HES', 'AUS'],
    requiredCoreShare: 0.65,
    requireIndependent: true,
    requireGreatPower: true,
    prestigeReward: 65,
  },
  {
    key: 'ITALY',
    resultTag: 'ITA',
    resultName: 'Kingdom of Italy',
    resultColor: [64, 120, 82],
    resultPrimaryCulture: 'south_german',
    // Parma is a minority owner inside Vic2's Emilia region and has no tag in
    // this cut; Modena carries that corner of the peninsula instead.
    candidateTags: ['SAR', 'TSC', 'PAP', 'MOD', 'TUS'],
    ownerTags: ['SAR', 'TSC', 'PAP', 'MOD', 'TUS'],
    requiredCoreShare: 0.75,
    requireIndependent: true,
    requireGreatPower: true,
    prestigeReward: 55,
  },
];

function normalizeName(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundCoord(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Display-only coordinate quantize for shipped GeoJSON (~3 decimals ≈ 111m). */
const GEOJSON_EXPORT_DECIMALS = 3;
const GEOJSON_EXPORT_FACTOR = 10 ** GEOJSON_EXPORT_DECIMALS;

function quantizeExportCoord(value) {
  return Math.round(value * GEOJSON_EXPORT_FACTOR) / GEOJSON_EXPORT_FACTOR;
}

function quantizeExportGeometry(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => ring.map((pt) => [quantizeExportCoord(pt[0]), quantizeExportCoord(pt[1])])),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => (
        poly.map((ring) => ring.map((pt) => [quantizeExportCoord(pt[0]), quantizeExportCoord(pt[1])]))
      )),
    };
  }
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map((pt) => [quantizeExportCoord(pt[0]), quantizeExportCoord(pt[1])]),
    };
  }
  if (geometry.type === 'MultiLineString') {
    return {
      type: 'MultiLineString',
      coordinates: geometry.coordinates.map((line) => line.map((pt) => [quantizeExportCoord(pt[0]), quantizeExportCoord(pt[1])])),
    };
  }
  return geometry;
}

function ensureClosedRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function perpendicularDistance(point, start, end) {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDistance = 0;
  let index = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDistance) {
      maxDistance = dist;
      index = i;
    }
  }
  if (maxDistance <= tolerance || index < 0) return [points[0], points[points.length - 1]];
  const left = simplifyLine(points.slice(0, index + 1), tolerance);
  const right = simplifyLine(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyRing(ring, tolerance) {
  const closed = ensureClosedRing(ring);
  if (closed.length <= 4) return closed;
  const simplified = simplifyLine(closed.slice(0, -1), tolerance);
  const restored = ensureClosedRing(simplified);
  return restored.length >= 4 ? restored : closed;
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry || !geometry.type || !geometry.coordinates) return geometry;
  if (geometry.type === 'Polygon') {
    const coordinates = geometry.coordinates
      .map((ring) => simplifyRing(ring, tolerance))
      .filter((ring) => ring.length >= 4);
    if (coordinates.length === 0) return null;
    return { type: 'Polygon', coordinates };
  }
  if (geometry.type === 'MultiPolygon') {
    const coordinates = geometry.coordinates
      .map((poly) => poly.map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 4))
      .filter((poly) => poly.length > 0);
    if (coordinates.length === 0) return null;
    return { type: 'MultiPolygon', coordinates };
  }
  return geometry;
}

function polygonAreaRing(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function geometryArea(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return Math.abs(polygonAreaRing(geometry.coordinates[0]));
  if (geometry.type === 'MultiPolygon') {
    let total = 0;
    for (const poly of geometry.coordinates) total += Math.abs(polygonAreaRing(poly[0]));
    return total;
  }
  return 0;
}

function geometryCentroid(geometry) {
  let totalX = 0;
  let totalY = 0;
  let totalArea = 0;
  const addRing = (ring) => {
    let ringArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      ringArea += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    ringArea *= 0.5;
    if (Math.abs(ringArea) < 1e-9) return;
    totalX += (cx / (6 * ringArea)) * Math.abs(ringArea);
    totalY += (cy / (6 * ringArea)) * Math.abs(ringArea);
    totalArea += Math.abs(ringArea);
  };
  if (!geometry) return [0, 0];
  if (geometry.type === 'Polygon') addRing(geometry.coordinates[0]);
  else if (geometry.type === 'MultiPolygon') for (const poly of geometry.coordinates) addRing(poly[0]);
  if (totalArea <= 0) return [0, 0];
  return [totalX / totalArea, totalY / totalArea];
}

function geometryBounds(geometry) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const visitCoord = ([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) for (const coord of ring) visitCoord(coord);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) for (const ring of poly) for (const coord of ring) visitCoord(coord);
  }
  if (!Number.isFinite(minLon)) return null;
  return { minLon, minLat, maxLon, maxLat };
}

function boundsNear(a, b, epsilon = 0) {
  return !(
    a.maxLon < b.minLon - epsilon
    || a.minLon > b.maxLon + epsilon
    || a.maxLat < b.minLat - epsilon
    || a.minLat > b.maxLat + epsilon
  );
}

function toPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function geometryFromPolygons(polygons) {
  if (!polygons || polygons.length === 0) return null;
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
  return { type: 'MultiPolygon', coordinates: polygons };
}

function pointSegmentDistanceSq(point, start, end) {
  const px = point[0];
  const py = point[1];
  const sx = start[0];
  const sy = start[1];
  const ex = end[0];
  const ey = end[1];
  const dx = ex - sx;
  const dy = ey - sy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-15) {
    const vx = px - sx;
    const vy = py - sy;
    return vx * vx + vy * vy;
  }
  const t = clamp(((px - sx) * dx + (py - sy) * dy) / lenSq, 0, 1);
  const vx = px - (sx + t * dx);
  const vy = py - (sy + t * dy);
  return vx * vx + vy * vy;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c, epsilon) {
  return (
    Math.min(a[0], c[0]) - epsilon <= b[0]
    && b[0] <= Math.max(a[0], c[0]) + epsilon
    && Math.min(a[1], c[1]) - epsilon <= b[1]
    && b[1] <= Math.max(a[1], c[1]) + epsilon
  );
}

function segmentsIntersect(a, b, c, d, epsilon) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if ((o1 > epsilon && o2 < -epsilon || o1 < -epsilon && o2 > epsilon)
    && (o3 > epsilon && o4 < -epsilon || o3 < -epsilon && o4 > epsilon)) {
    return true;
  }
  if (Math.abs(o1) <= epsilon && onSegment(a, c, b, epsilon)) return true;
  if (Math.abs(o2) <= epsilon && onSegment(a, d, b, epsilon)) return true;
  if (Math.abs(o3) <= epsilon && onSegment(c, a, d, epsilon)) return true;
  if (Math.abs(o4) <= epsilon && onSegment(c, b, d, epsilon)) return true;
  return false;
}

function segmentDistanceSq(segA, segB, epsilon) {
  const a0 = segA.start;
  const a1 = segA.end;
  const b0 = segB.start;
  const b1 = segB.end;
  if (segmentsIntersect(a0, a1, b0, b1, epsilon)) return 0;
  return Math.min(
    pointSegmentDistanceSq(a0, b0, b1),
    pointSegmentDistanceSq(a1, b0, b1),
    pointSegmentDistanceSq(b0, a0, a1),
    pointSegmentDistanceSq(b1, a0, a1),
  );
}

function ownerTagForFeature(props) {
  const adminName = normalizeName(
    props.admin || props.ADMIN || props.adm0_name || props.geonunit || props.GEOUNIT || props.NAME_LONG || props.NAME,
  );
  const geonunit = normalizeName(props.geonunit || props.GEOUNIT || '');
  const iso2 = normalizeName(props.iso_a2 || props.ISO_A2 || '');
  if (ISO_TO_TAG[iso2]) return ISO_TO_TAG[iso2];
  const iso = normalizeName(props.iso_a2 || props.adm0_a3 || props.ADM0_A3 || props.ISO_A2 || '');
  const region = normalizeName(props.region || props.region_un || props.continent || props.REGION_UN || '');
  const lookup = [
    adminName,
    geonunit,
    iso === 'gb' ? 'united kingdom' : '',
    iso === 'us' ? 'united states' : '',
    iso === 'cn' ? 'china' : '',
  ].filter(Boolean);
  for (const key of lookup) {
    if (COUNTRY_TO_TAG[key]) return COUNTRY_TO_TAG[key];
  }
  if (region.includes('africa') || region.includes('asia')) return 'UNC';
  if (region.includes('oceania')) return 'COL';
  return 'COL';
}

function historicalOwnerOverride(baseTag, lon, lat, adminName, stateName) {
  const admin = normalizeName(adminName);
  const state = normalizeName(stateName);
  // 1820: Texas is Mexican (not yet the Republic of Texas).
  if (admin === 'united states of america' && state === 'texas') return 'MEX';
  // 1820: Belgium still in the United Netherlands (independent 1830).
  if (admin === 'belgium') return 'NLD';
  // 1820: Greece still Ottoman (independent 1832).
  if (admin === 'greece') return 'OTT';
  if (admin === 'denmark') return 'DEN';
  if (admin === 'switzerland') return 'SWI';
  if (admin === 'norway') return 'SWE';
  if (admin === 'afghanistan') return 'AFG';
  if (admin === 'iran' || admin === 'persia') return 'PER';
  if (admin === 'morocco') return 'MOR';
  if (admin === 'ethiopia') return 'ETH';
  if (admin === 'nepal') return 'NEP';
  if (admin === 'bhutan') return 'BHU';
  if (admin === 'north korea' || admin === 'south korea' || admin === 'korea') return 'KOR';
  if (admin === 'thailand') return 'SIA';
  if (admin === 'laos') return 'LAO';
  if (admin === 'cambodia') return 'CAM';
  if (admin === 'vietnam') return 'VIE';
  if (admin === 'myanmar' || admin === 'burma') return 'BUR';
  if (
    admin === 'egypt' || admin === 'sudan' || admin === 'south sudan' || admin === 'syria'
    || admin === 'lebanon' || admin === 'israel' || admin === 'jordan' || admin === 'palestine'
  ) {
    return 'EGY';
  }
  if (admin === 'indonesia') {
    const java = lon >= 104.5 && lon <= 114.9 && lat >= -9.6 && lat <= -5.2;
    const sumatra = lon >= 94.8 && lon <= 106.6 && lat >= -6.7 && lat <= 6.3;
    const moluccas = lon >= 124.0 && lon <= 133.8 && lat >= -4.8 && lat <= 3.6;
    const riauBangka = lon >= 103.0 && lon <= 110.0 && lat >= -4.5 && lat <= 4.6;
    return java || sumatra || moluccas || riauBangka ? 'NLD' : 'UNC';
  }
  if (admin === 'albania') return 'OTT';
  if (admin === 'romania' || admin === 'bulgaria' || admin === 'serbia') return 'OTT';
  // 1820: Algiers still an Ottoman regency (French conquest 1830).
  if (admin === 'algeria') return 'OTT';
  // 1820 Latin America: Brazil/Uruguay still Portuguese; Peru/Bolivia still Spanish.
  if (admin === 'brazil' || admin === 'uruguay') return 'POR';
  if (admin === 'peru' || admin === 'bolivia') return 'ESP';
  if (admin === 'mexico') return 'MEX';
  return baseTag;
}

function terrainForCell(lat, lon, parentName, regionHint) {
  const label = normalizeName(`${parentName} ${regionHint}`);
  if (Math.abs(lat) > 66) return 'arctic';
  if (
    (lat > 12 && lat < 36 && lon > -20 && lon < 60)
    || (lat > 12 && lat < 35 && lon > 40 && lon < 80)
    || label.includes('sahara') || label.includes('arab') || label.includes('desert')
  ) {
    return 'desert';
  }
  if (
    (lat > -12 && lat < 12 && lon > -80 && lon < -45)
    || (lat > -8 && lat < 18 && lon > 10 && lon < 35)
    || (lat > -8 && lat < 18 && lon > 95 && lon < 140)
    || label.includes('amazon') || label.includes('congo')
  ) {
    return 'jungle';
  }
  if (
    (lat > 27 && lat < 45 && lon > 65 && lon < 108)
    || (lat > -42 && lat < -18 && lon > -75 && lon < -64)
    || label.includes('alps') || label.includes('rocky') || label.includes('himal')
  ) {
    return 'mountains';
  }
  if (lat > 46 || lat < -44) return 'forest';
  if (lat > 20 && lat < 55) return 'farmland';
  return 'plains';
}

function rgoForTerrain(terrain, lat, lon, salt) {
  const spin = (hashString(`${salt}:${Math.round(lat * 10)}:${Math.round(lon * 10)}`) % 1000) / 1000;
  if (terrain === 'mountains') return spin < 0.56 ? 'iron' : 'coal';
  if (terrain === 'forest' || terrain === 'jungle') return spin < 0.7 ? 'timber' : 'cotton';
  if (terrain === 'desert') return spin < 0.62 ? 'cotton' : 'cattle';
  if (terrain === 'arctic') return 'cattle';
  if (terrain === 'farmland') return spin < 0.68 ? 'grain' : 'cattle';
  if (lon < -70 && lat > 25 && lat < 48) return spin < 0.5 ? 'grain' : 'cotton';
  if (lon > 100 && lat > 18 && lat < 43) return spin < 0.75 ? 'grain' : 'coal';
  return spin < 0.58 ? 'grain' : 'cattle';
}

function populationWeight(lat, lon, terrain) {
  let weight = 1;
  if (lon > -12 && lon < 42 && lat > 35 && lat < 60) weight *= 2.05;
  if (lon > 67 && lon < 93 && lat > 7 && lat < 34) weight *= 2.15;
  if (lon > 102 && lon < 124 && lat > 20 && lat < 42) weight *= 2.3;
  if (lon > 126 && lon < 146 && lat > 31 && lat < 43) weight *= 1.7;
  if (lon > 90 && lon < 121 && lat > -8 && lat < 24) weight *= 1.45;
  if (Math.abs(lat) > 58) weight *= 0.42;
  if (terrain === 'desert') weight *= 0.4;
  if (terrain === 'mountains') weight *= 0.62;
  if (terrain === 'jungle') weight *= 0.78;
  if (terrain === 'farmland') weight *= 1.25;
  return roundCoord(clamp(weight, 0.18, 3.2));
}

function loadNameFromProps(props) {
  return String(
    props.name_en
    || props.NAME_EN
    || props.name
    || props.NAME
    || props.NAME_LONG
    || props.ADMIN
    || props.admin
    || 'Unknown',
  ).trim();
}

function loadAdminNameFromProps(props) {
  return String(
    props.admin
    || props.ADMIN
    || props.adm0_name
    || props.ADM0_NAME
    || props.geonunit
    || props.GEOUNIT
    || props.NAME_LONG
    || props.name
    || props.NAME
    || 'Unknown',
  ).trim();
}

function loadRegionHint(props) {
  return String(
    props.region || props.region_un || props.REGION_UN || props.continent || props.CONTINENT || '',
  );
}

function countryKeyForParent(parent) {
  return normalizeName(parent.adminName || parent.stateName || parent.key || '');
}

function deterministicParentSort(a, b) {
  return (
    countryKeyForParent(a).localeCompare(countryKeyForParent(b))
    || normalizeName(a.stateName).localeCompare(normalizeName(b.stateName))
    || String(a.key).localeCompare(String(b.key))
    || a.area - b.area
  );
}

function deterministicUnitSort(a, b) {
  return (
    a.countryKey.localeCompare(b.countryKey)
    || normalizeName(a.stateName).localeCompare(normalizeName(b.stateName))
    || a.parentKey.localeCompare(b.parentKey)
    || String(a.partitionKey || '').localeCompare(String(b.partitionKey || ''))
    || b.area - a.area
    || a.centroid[0] - b.centroid[0]
    || a.centroid[1] - b.centroid[1]
  );
}

function buildParentsFromGeojson(geojson, _tolerance = 0, keyPrefix = '', forceCountryName = false) {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const parents = [];
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature.properties || {};
    // Keep RAW geometry here — topology-preserving simplify runs once after all splits.
    const geometry = feature.geometry;
    const bbox = geometryBounds(geometry);
    if (!bbox) continue;
    const area = Math.max(1e-6, geometryArea(geometry));
    const centroid = geometryCentroid(geometry);
    const adminName = loadAdminNameFromProps(props);
    const stateName = forceCountryName ? adminName : loadNameFromProps(props);
    const ownerTag = ownerTagForFeature(props);
    const key = String(
      props.adm1_code
      || props.ADM1_CODE
      || props.iso_3166_2
      || props.ISO_3166_2
      || props.adm0_a3
      || props.ADM0_A3
      || props.iso_a2
      || props.ISO_A2
      || `${adminName}:${stateName}:${i + 1}`,
    );
    parents.push({
      key: `${keyPrefix}${key}`,
      stateName,
      ownerTag,
      adminName,
      region: loadRegionHint(props),
      bbox,
      area,
      centroid,
      geometry,
    });
  }
  return parents.sort(deterministicParentSort);
}

function clipRingByAxis(ring, axis, threshold, keepLower) {
  const closed = ensureClosedRing(ring);
  if (closed.length < 4) return null;
  const inside = (point) => {
    if (axis === 'x') return keepLower ? point[0] <= threshold : point[0] >= threshold;
    return keepLower ? point[1] <= threshold : point[1] >= threshold;
  };
  const intersect = (a, b) => {
    if (axis === 'x') {
      const dx = b[0] - a[0];
      const t = Math.abs(dx) < 1e-12 ? 0 : (threshold - a[0]) / dx;
      return [roundCoord(threshold), roundCoord(a[1] + t * (b[1] - a[1]))];
    }
    const dy = b[1] - a[1];
    const t = Math.abs(dy) < 1e-12 ? 0 : (threshold - a[1]) / dy;
    return [roundCoord(a[0] + t * (b[0] - a[0])), roundCoord(threshold)];
  };

  const output = [];
  for (let i = 0; i < closed.length - 1; i++) {
    const current = closed[i];
    const next = closed[i + 1];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside && nextInside) output.push(next);
    else if (currentInside && !nextInside) output.push(intersect(current, next));
    else if (!currentInside && nextInside) {
      output.push(intersect(current, next));
      output.push(next);
    }
  }

  if (output.length < 3) return null;
  const deduped = [];
  for (const point of output) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) deduped.push(point);
  }
  if (deduped.length < 3) return null;
  const closedOut = ensureClosedRing(deduped);
  if (closedOut.length < 4) return null;
  if (Math.abs(polygonAreaRing(closedOut)) < 1e-8) return null;
  return closedOut;
}

function clipPolygonToBBox(polygon, bbox) {
  const clipped = [];
  for (let r = 0; r < polygon.length; r++) {
    let ring = ensureClosedRing(polygon[r] || []);
    if (ring.length < 4) {
      if (r === 0) return null;
      continue;
    }
    ring = clipRingByAxis(ring, 'x', bbox.maxLon, true);
    if (!ring) {
      if (r === 0) return null;
      continue;
    }
    ring = clipRingByAxis(ring, 'x', bbox.minLon, false);
    if (!ring) {
      if (r === 0) return null;
      continue;
    }
    ring = clipRingByAxis(ring, 'y', bbox.maxLat, true);
    if (!ring) {
      if (r === 0) return null;
      continue;
    }
    ring = clipRingByAxis(ring, 'y', bbox.minLat, false);
    if (!ring) {
      if (r === 0) return null;
      continue;
    }
    if (Math.abs(polygonAreaRing(ring)) <= 1e-8) {
      if (r === 0) return null;
      continue;
    }
    clipped.push(ring);
  }
  return clipped.length > 0 ? clipped : null;
}

function clipGeometryToBBox(geometry, bbox) {
  const out = [];
  for (const polygon of toPolygons(geometry)) {
    const clipped = clipPolygonToBBox(polygon, bbox);
    if (clipped && Math.abs(polygonAreaRing(clipped[0])) > 1e-8) out.push(clipped);
  }
  return geometryFromPolygons(out);
}

function subtractBBoxFromGeometry(geometry, bbox) {
  const sides = [
    { minLon: -180, maxLon: bbox.minLon, minLat: -90, maxLat: 90 },
    { minLon: bbox.maxLon, maxLon: 180, minLat: -90, maxLat: 90 },
    { minLon: bbox.minLon, maxLon: bbox.maxLon, minLat: -90, maxLat: bbox.minLat },
    { minLon: bbox.minLon, maxLon: bbox.maxLon, minLat: bbox.maxLat, maxLat: 90 },
  ];
  const parts = [];
  for (const side of sides) {
    const clipped = clipGeometryToBBox(geometry, side);
    if (!clipped) continue;
    parts.push(...toPolygons(clipped));
  }
  return geometryFromPolygons(parts);
}

function pointInRing(point, ring) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  const closed = ensureClosedRing(ring);
  for (let i = 0, j = closed.length - 1; i < closed.length; j = i++) {
    const xi = closed[i][0];
    const yi = closed[i][1];
    const xj = closed[j][0];
    const yj = closed[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-15) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  for (const polygon of toPolygons(geometry)) {
    if (!pointInRing(point, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(point, polygon[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function densifyRing(ring, maxEdge) {
  const closed = ensureClosedRing(ring);
  if (closed.length < 4) return closed;
  const out = [];
  for (let i = 0; i < closed.length - 1; i++) {
    const a = closed[i];
    const b = closed[i + 1];
    out.push([roundCoord(a[0]), roundCoord(a[1])]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dist = Math.hypot(dx, dy);
    if (dist <= maxEdge) continue;
    const steps = Math.ceil(dist / maxEdge);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push([roundCoord(a[0] + dx * t), roundCoord(a[1] + dy * t)]);
    }
  }
  return ensureClosedRing(out);
}

function densifyGeometry(geometry, maxEdge) {
  const polygons = toPolygons(geometry).map((polygon) => (
    polygon.map((ring) => densifyRing(ring, maxEdge))
  ));
  return geometryFromPolygons(polygons);
}

function cutEdgeKey(start, end) {
  const ax = Math.round(start[0] * 1000);
  const ay = Math.round(start[1] * 1000);
  const bx = Math.round(end[0] * 1000);
  const by = Math.round(end[1] * 1000);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax}:${ay}|${bx}:${by}`;
  return `${bx}:${by}|${ax}:${ay}`;
}

/** True for ruler-straight partition chords after topology simplify. */
function isArtificialCutEdge(start, end, pointCount = 2) {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const len = Math.hypot(dx, dy);
  // Axis-aligned hist cuts (Germany / Italy boxes).
  if (dx < 1e-4 || dy < 1e-4) return len >= 0.35 && len <= 12;
  // Simplified Voronoi chords: few points, conspicuous medium-long length.
  if (pointCount <= 3 && len >= 1.0 && len <= 9) return true;
  return false;
}

function jitterPointOnCut(start, end, t, salt, amplitude) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const taper = Math.sin(Math.PI * t);
  const noise = ((hashString(`${salt}:${Math.round(t * 1000)}`) % 10000) / 10000 - 0.5) * 2;
  const mag = amplitude * taper * noise;
  return [
    roundCoord(start[0] + dx * t + nx * mag),
    roundCoord(start[1] + dy * t + ny * mag),
  ];
}

/**
 * Debox artificial cuts by rewriting shared edges in both neighbor polygons
 * with the same deterministic jittered polyline (edge-key salted).
 */
function deboxArtificialCutsInProvinces(provinceRecords) {
  const byId = new Map(provinceRecords.map((p) => [p.id, p]));
  const artificial = provinceRecords.filter((p) => p.artificialCuts);
  let deboxed = 0;

  const replaceEdgeInRing = (ring, start, end, replacement) => {
    const out = [];
    let changed = false;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      const forward = Math.hypot(a[0] - start[0], a[1] - start[1]) < 1e-8
        && Math.hypot(b[0] - end[0], b[1] - end[1]) < 1e-8;
      const backward = Math.hypot(a[0] - end[0], a[1] - end[1]) < 1e-8
        && Math.hypot(b[0] - start[0], b[1] - start[1]) < 1e-8;
      if (forward) {
        out.push(...replacement.slice(0, -1));
        changed = true;
      } else if (backward) {
        out.push(...replacement.slice().reverse().slice(0, -1));
        changed = true;
      } else {
        out.push(a);
      }
    }
    if (!changed) return null;
    out.push(out[0][0] === ring[ring.length - 1][0] && out[0][1] === ring[ring.length - 1][1]
      ? out[0]
      : ring[ring.length - 1]);
    // Ensure closed
    if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
      out.push(out[0]);
    }
    return out;
  };

  const applyReplacement = (province, start, end, replacement) => {
    const polys = toPolygons(province.geometry);
    let any = false;
    const next = polys.map((poly) => poly.map((ring) => {
      const replaced = replaceEdgeInRing(ring, start, end, replacement);
      if (replaced) {
        any = true;
        return replaced;
      }
      return ring;
    }));
    if (!any) return false;
    province.geometry = geometryFromPolygons(next);
    province.bbox = geometryBounds(province.geometry);
    return true;
  };

  const seen = new Set();
  for (const province of artificial) {
    for (const neighborId of province.neighbors) {
      const other = byId.get(neighborId);
      if (!other?.artificialCuts || neighborId < province.id) continue;
      const key = `${province.id}|${neighborId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Collect matching exact edges
      const edgesA = [];
      for (const poly of toPolygons(province.geometry)) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length - 1; i++) {
            edgesA.push([ring[i], ring[i + 1]]);
          }
        }
      }
      for (const [a, b] of edgesA) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!isArtificialCutEdge(a, b, 2)) continue;
        // Confirm other has this edge
        let matched = false;
        for (const poly of toPolygons(other.geometry)) {
          for (const ring of poly) {
            for (let i = 0; i < ring.length - 1; i++) {
              const c = ring[i];
              const d = ring[i + 1];
              const same = (Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-8 && Math.hypot(d[0] - b[0], d[1] - b[1]) < 1e-8)
                || (Math.hypot(c[0] - b[0], c[1] - b[1]) < 1e-8 && Math.hypot(d[0] - a[0], d[1] - a[1]) < 1e-8);
              if (same) matched = true;
            }
          }
        }
        if (!matched) continue;

        const steps = Math.min(40, Math.max(5, Math.ceil(len / CUT_DENSE_EDGE)));
        const salt = `cut:${cutEdgeKey(a, b)}`;
        const jittered = [a];
        for (let s = 1; s < steps; s++) {
          jittered.push(jitterPointOnCut(a, b, s / steps, salt, CUT_JITTER_AMPLITUDE));
        }
        jittered.push(b);
        const okA = applyReplacement(province, a, b, jittered);
        const okB = applyReplacement(other, a, b, jittered);
        if (okA && okB) deboxed += 1;
      }
    }
  }
  console.log(`[build-map] Deboxed shared partition edges: ${deboxed}`);
}

function roundGeometryCoords(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => ring.map((pt) => [roundCoord(pt[0]), roundCoord(pt[1])])),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => (
        poly.map((ring) => ring.map((pt) => [roundCoord(pt[0]), roundCoord(pt[1])]))
      )),
    };
  }
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map((pt) => [roundCoord(pt[0]), roundCoord(pt[1])]),
    };
  }
  if (geometry.type === 'MultiLineString') {
    return {
      type: 'MultiLineString',
      coordinates: geometry.coordinates.map((line) => line.map((pt) => [roundCoord(pt[0]), roundCoord(pt[1])])),
    };
  }
  return geometry;
}

function segmentIntersectionPoint(a, b, c, d) {
  const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denom) < 1e-15) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denom;
  if (t < 1e-9 || t > 1 - 1e-9 || u < 1e-9 || u > 1 - 1e-9) return null;
  return [roundCoord(a[0] + t * (b[0] - a[0])), roundCoord(a[1] + t * (b[1] - a[1]))];
}

function segmentsProperlyIntersectOrTouch(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-12;
  if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps)
    && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
    return true;
  }
  if (Math.abs(o1) <= eps && onSegment(a, c, b, eps)) return true;
  if (Math.abs(o2) <= eps && onSegment(a, d, b, eps)) return true;
  if (Math.abs(o3) <= eps && onSegment(c, a, d, eps)) return true;
  if (Math.abs(o4) <= eps && onSegment(c, b, d, eps)) return true;
  return false;
}

function ringHasSelfIntersection(ring) {
  const closed = ensureClosedRing(ring).slice(0, -1);
  if (closed.length < 4) return false;
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i];
    const b = closed[(i + 1) % closed.length];
    for (let j = i + 1; j < closed.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === closed.length - 1) continue;
      const c = closed[j];
      const d = closed[(j + 1) % closed.length];
      if (segmentsProperlyIntersectOrTouch(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Keep the largest simple loop when a ring bowties (Voronoi/clip artifact). */
function repairSelfIntersectingRing(ring, depth = 0) {
  const closed = ensureClosedRing(ring);
  // Each pass discards one bowtie lobe, so a ring with many crossings needs
  // many passes. The old ceiling of 12 silently returned unrepaired rings once
  // provinces became Voronoi cuts of concave coastlines.
  if (depth > 96 || closed.length < 4 || !ringHasSelfIntersection(closed)) {
    return closed.length >= 4 ? closed : null;
  }
  const body = closed.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const a = body[i];
    const b = body[(i + 1) % body.length];
    for (let j = i + 1; j < body.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === body.length - 1) continue;
      const c = body[j];
      const d = body[(j + 1) % body.length];
      if (!segmentsProperlyIntersectOrTouch(a, b, c, d)) continue;
      const hit = segmentIntersectionPoint(a, b, c, d);
      if (hit) {
        const loopA = [hit, ...body.slice(i + 1, j + 1), hit];
        const loopB = [hit, ...body.slice(j + 1), ...body.slice(0, i + 1), hit];
        const areaA = Math.abs(polygonAreaRing(ensureClosedRing(loopA)));
        const areaB = Math.abs(polygonAreaRing(ensureClosedRing(loopB)));
        const prefer = areaA >= areaB ? loopA : loopB;
        return repairSelfIntersectingRing(prefer, depth + 1);
      }
      // Collinear / endpoint-touching spike: drop the offending vertex and retry.
      const stripped = body.filter((_, index) => index !== ((i + 1) % body.length));
      if (stripped.length >= 3) {
        return repairSelfIntersectingRing(ensureClosedRing(stripped), depth + 1);
      }
    }
  }
  return closed;
}

function repairGeometrySelfIntersections(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates
      .map((ring, index) => {
        const repaired = repairSelfIntersectingRing(ring);
        return repaired;
      })
      .filter((ring, index) => ring && (index === 0 || Math.abs(polygonAreaRing(ring)) > 1e-8));
    if (!rings.length || !rings[0]) return null;
    return { type: 'Polygon', coordinates: rings };
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates
      .map((poly) => {
        const rings = poly
          .map((ring, index) => repairSelfIntersectingRing(ring))
          .filter((ring, index) => ring && (index === 0 || Math.abs(polygonAreaRing(ring)) > 1e-8));
        return rings.length && rings[0] ? rings : null;
      })
      .filter(Boolean);
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
    return { type: 'MultiPolygon', coordinates: polygons };
  }
  return geometry;
}

/** Snap coordinates so near-coincident partition cuts weld into shared arcs. */
function snapGeometry(geometry, grid = 5000) {
  const snap = (pt) => [
    Math.round(pt[0] * grid) / grid,
    Math.round(pt[1] * grid) / grid,
  ];
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => ensureClosedRing(ring.map(snap))),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ensureClosedRing(ring.map(snap)))),
    };
  }
  return geometry;
}

function absArcIndex(arcIdx) {
  return arcIdx < 0 ? ~arcIdx : arcIdx;
}

function iterExteriorArcs(geom, visit) {
  if (!geom || !geom.arcs) return;
  if (geom.type === 'Polygon') {
    for (const arcIdx of geom.arcs[0] || []) visit(absArcIndex(arcIdx));
    return;
  }
  if (geom.type === 'MultiPolygon') {
    for (const polygon of geom.arcs) {
      for (const arcIdx of polygon[0] || []) visit(absArcIndex(arcIdx));
    }
  }
}

function decodeTopoArc(topo, arcIndex) {
  const transform = topo.transform;
  const arc = topo.arcs[arcIndex];
  const points = [];
  let x = 0;
  let y = 0;
  for (const point of arc) {
    x += point[0];
    y += point[1];
    if (transform) {
      points.push([
        x * transform.scale[0] + transform.translate[0],
        y * transform.scale[1] + transform.translate[1],
      ]);
    } else {
      points.push([x, y]);
    }
  }
  return points;
}

/**
 * Raster land-mask coastal detection: flood-fill ocean from the map frame, then
 * mark provinces that touch an ocean cell. Ignores interior coverage gaps.
 */
function computeCoastalFromLandMask(geometries) {
  const CELL = 0.5;
  const lon0 = -180;
  const lat0 = -90;
  const cols = Math.ceil(360 / CELL);
  const rows = Math.ceil(180 / CELL);
  const land = new Uint8Array(cols * rows);
  const owner = new Int32Array(cols * rows);
  owner.fill(-1);

  const toCell = (lon, lat) => {
    const c = clamp(Math.floor((lon - lon0) / CELL), 0, cols - 1);
    const r = clamp(Math.floor((lat - lat0) / CELL), 0, rows - 1);
    return r * cols + c;
  };

  for (let i = 0; i < geometries.length; i++) {
    const bbox = geometryBounds(geometries[i]);
    if (!bbox) continue;
    const c0 = clamp(Math.floor((bbox.minLon - lon0) / CELL), 0, cols - 1);
    const c1 = clamp(Math.floor((bbox.maxLon - lon0) / CELL), 0, cols - 1);
    const r0 = clamp(Math.floor((bbox.minLat - lat0) / CELL), 0, rows - 1);
    const r1 = clamp(Math.floor((bbox.maxLat - lat0) / CELL), 0, rows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const lon = lon0 + (c + 0.5) * CELL;
        const lat = lat0 + (r + 0.5) * CELL;
        if (pointInGeometry([lon, lat], geometries[i])) {
          const idx = r * cols + c;
          land[idx] = 1;
          owner[idx] = i;
        }
      }
    }
  }

  // Flood-fill ocean from the frame (and any edge water).
  const ocean = new Uint8Array(cols * rows);
  const stack = [];
  const push = (idx) => {
    if (idx < 0 || idx >= ocean.length || ocean[idx] || land[idx]) return;
    ocean[idx] = 1;
    stack.push(idx);
  };
  for (let c = 0; c < cols; c++) {
    push(c);
    push((rows - 1) * cols + c);
  }
  for (let r = 0; r < rows; r++) {
    push(r * cols);
    push(r * cols + cols - 1);
  }
  while (stack.length) {
    const idx = stack.pop();
    const r = Math.floor(idx / cols);
    const c = idx - r * cols;
    if (c > 0) push(idx - 1);
    if (c + 1 < cols) push(idx + 1);
    if (r > 0) push(idx - cols);
    if (r + 1 < rows) push(idx + cols);
  }

  const coastal = new Array(geometries.length).fill(false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (!land[idx]) continue;
      const id = owner[idx];
      if (id < 0 || coastal[id]) continue;
      const neighbors = [];
      if (c > 0) neighbors.push(idx - 1);
      if (c + 1 < cols) neighbors.push(idx + 1);
      if (r > 0) neighbors.push(idx - cols);
      if (r + 1 < rows) neighbors.push(idx + cols);
      if (neighbors.some((n) => ocean[n])) coastal[id] = true;
    }
  }
  return coastal;
}

/**
 * Weld shared borders via TopoJSON, simplify each arc once, then derive
 * coastal flags, adjacency, and continuous national-border polylines.
 */
function applySharedTopology(provinceRecords) {
  const collection = {
    type: 'FeatureCollection',
    features: provinceRecords.map((province) => ({
      type: 'Feature',
      id: province.id,
      properties: {
        id: province.id,
        ownerTag: province.ownerTag,
        n: province.name,
        artificialCuts: Boolean(province.artificialCuts),
      },
      geometry: snapGeometry(province.geometry, 4000),
    })),
  };

  let topo = buildTopology({ provinces: collection }, TOPO_QUANTIZE);
  topo = presimplify(topo);
  const minWeight = quantile(topo, TOPO_SIMPLIFY_QUANTILE);
  topo = simplify(topo, minWeight);

  const simplified = feature(topo, topo.objects.provinces);
  // Topology geometry order matches the input FeatureCollection order (province id == index).
  const features = simplified.features;
  const neighborLists = topoNeighbors(topo.objects.provinces.geometries);

  if (features.length !== provinceRecords.length) {
    throw new Error(
      `Topology feature count ${features.length} != province count ${provinceRecords.length}`,
    );
  }

  const geoForMask = features.map((feat) => {
    const rounded = roundGeometryCoords(feat.geometry);
    return repairGeometrySelfIntersections(rounded) || rounded;
  });
  const coastalFlags = computeCoastalFromLandMask(geoForMask);

  for (let i = 0; i < provinceRecords.length; i++) {
    const geometry = geoForMask[i];
    provinceRecords[i].geometry = geometry;
    provinceRecords[i].bbox = geometryBounds(geometry);
    provinceRecords[i].coastal = Boolean(coastalFlags[i]);
    provinceRecords[i].neighbors = (neighborLists[i] || []).slice().sort((a, b) => a - b);
    provinceRecords[i].segments = [];
  }

  const bridgedIslands = linkIsolatedProvinces(provinceRecords);
  deboxArtificialCutsInProvinces(provinceRecords);
  for (const province of provinceRecords) {
    const repaired = repairGeometrySelfIntersections(province.geometry);
    if (repaired) {
      province.geometry = repaired;
      province.bbox = geometryBounds(repaired);
    }
  }
  const nationalBorders = buildNationalBordersFromProvinces(provinceRecords);

  return { nationalBorders, bridgedIslands };
}

function buildNationalBordersFromProvinces(provinces) {
  const edgeMap = new Map();
  for (const province of provinces) {
    for (const poly of toPolygons(province.geometry)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const start = [roundCoord(ring[i][0]), roundCoord(ring[i][1])];
          const end = [roundCoord(ring[i + 1][0]), roundCoord(ring[i + 1][1])];
          if (start[0] === end[0] && start[1] === end[1]) continue;
          const key = cutEdgeKey(start, end);
          let entry = edgeMap.get(key);
          if (!entry) {
            entry = { start, end, owners: new Set() };
            edgeMap.set(key, entry);
          }
          entry.owners.add(province.ownerTag);
        }
      }
    }
  }
  const coordinates = [];
  for (const edge of edgeMap.values()) {
    if (edge.owners.size < 2) continue;
    coordinates.push([edge.start, edge.end]);
  }
  const used = new Set();
  const polylines = [];
  const endpointIndex = new Map();
  const ptKey = (p) => `${p[0]},${p[1]}`;
  coordinates.forEach((seg, index) => {
    const a = ptKey(seg[0]);
    const b = ptKey(seg[1]);
    if (!endpointIndex.has(a)) endpointIndex.set(a, []);
    if (!endpointIndex.has(b)) endpointIndex.set(b, []);
    endpointIndex.get(a).push(index);
    endpointIndex.get(b).push(index);
  });
  const otherEnd = (seg, pt) => (ptKey(seg[0]) === ptKey(pt) ? seg[1] : seg[0]);
  for (let i = 0; i < coordinates.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let line = [coordinates[i][0], coordinates[i][1]];
    let extended = true;
    while (extended) {
      extended = false;
      for (const end of [0, 1]) {
        const tip = end === 0 ? line[0] : line[line.length - 1];
        const candidates = endpointIndex.get(ptKey(tip)) || [];
        for (const idx of candidates) {
          if (used.has(idx)) continue;
          const seg = coordinates[idx];
          if (ptKey(seg[0]) !== ptKey(tip) && ptKey(seg[1]) !== ptKey(tip)) continue;
          used.add(idx);
          const nxt = otherEnd(seg, tip);
          if (end === 0) line = [nxt, ...line];
          else line.push(nxt);
          extended = true;
          break;
        }
      }
    }
    if (line.length >= 2) polylines.push(line);
  }
  polylines.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a.length - b.length);
  return {
    type: 'FeatureCollection',
    features: polylines.length > 0
      ? [{
        type: 'Feature',
        properties: { id: 0 },
        geometry: { type: 'MultiLineString', coordinates: polylines },
      }]
      : [],
  };
}

/** Keep the side of the perpendicular bisector closer to siteA than siteB (true Voronoi half-plane). */
function clipRingByHalfPlane(ring, siteA, siteB) {
  const closed = ensureClosedRing(ring);
  if (closed.length < 4) return null;
  const ax = siteA[0];
  const ay = siteA[1];
  const bx = siteB[0];
  const by = siteB[1];
  const inside = (point) => {
    const da = (point[0] - ax) * (point[0] - ax) + (point[1] - ay) * (point[1] - ay);
    const db = (point[0] - bx) * (point[0] - bx) + (point[1] - by) * (point[1] - by);
    return da <= db + 1e-12;
  };
  const intersect = (p, q) => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const nx = 2 * (bx - ax);
    const ny = 2 * (by - ay);
    const rhs = (bx * bx + by * by) - (ax * ax + ay * ay);
    const denom = nx * dx + ny * dy;
    const t = Math.abs(denom) < 1e-15 ? 0 : (rhs - (nx * p[0] + ny * p[1])) / denom;
    const clamped = clamp(t, 0, 1);
    return [roundCoord(p[0] + clamped * dx), roundCoord(p[1] + clamped * dy)];
  };

  const output = [];
  for (let i = 0; i < closed.length - 1; i++) {
    const current = closed[i];
    const next = closed[i + 1];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside && nextInside) output.push(next);
    else if (currentInside && !nextInside) output.push(intersect(current, next));
    else if (!currentInside && nextInside) {
      output.push(intersect(current, next));
      output.push(next);
    }
  }
  if (output.length < 3) return null;
  const deduped = [];
  for (const point of output) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) deduped.push(point);
  }
  if (deduped.length < 3) return null;
  // Leave bisector chords straight here — post-simplify shared-arc debox jitters them once.
  const closedOut = ensureClosedRing(deduped);
  if (closedOut.length < 4) return null;
  if (Math.abs(polygonAreaRing(closedOut)) < 1e-8) return null;
  return closedOut;
}

function clipGeometryByHalfPlane(geometry, siteA, siteB) {
  const out = [];
  for (const polygon of toPolygons(geometry)) {
    const outer = clipRingByHalfPlane(polygon[0], siteA, siteB);
    if (!outer) continue;
    const holes = [];
    for (let h = 1; h < polygon.length; h++) {
      const hole = clipRingByHalfPlane(polygon[h], siteA, siteB);
      if (hole && Math.abs(polygonAreaRing(hole)) > 1e-8) holes.push(hole);
    }
    out.push([outer, ...holes]);
  }
  return geometryFromPolygons(out);
}

function voronoiPartitionGeometry(geometry, seeds) {
  const cells = [];
  for (let i = 0; i < seeds.length; i++) {
    let cell = geometry;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      cell = clipGeometryByHalfPlane(cell, seeds[i], seeds[j]);
      if (!cell) break;
    }
    cells.push(cell);
  }
  return cells;
}

function sampleInteriorPoints(geometry, salt) {
  const bbox = geometryBounds(geometry);
  if (!bbox) return [];
  const width = Math.max(1e-6, bbox.maxLon - bbox.minLon);
  const height = Math.max(1e-6, bbox.maxLat - bbox.minLat);
  const target = clamp(Math.round((width * height) / 4), 48, 220);
  const grid = Math.max(6, Math.ceil(Math.sqrt(target)));
  const points = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const jitter = ((hashString(`${salt}:${gx}:${gy}`) % 1000) / 1000 - 0.5) * 0.35;
      const lon = bbox.minLon + ((gx + 0.5 + jitter) / grid) * width;
      const lat = bbox.minLat + ((gy + 0.5 - jitter) / grid) * height;
      const point = [roundCoord(lon), roundCoord(lat)];
      if (pointInGeometry(point, geometry)) points.push(point);
    }
  }
  if (points.length === 0) {
    const centroid = geometryCentroid(geometry);
    if (pointInGeometry(centroid, geometry)) points.push([roundCoord(centroid[0]), roundCoord(centroid[1])]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return points;
}

function farthestPointSample(candidates, count, salt) {
  if (candidates.length === 0) return [];
  if (candidates.length <= count) return candidates.slice();
  const startIndex = hashString(salt) % candidates.length;
  const chosen = [candidates[startIndex]];
  const remaining = candidates.filter((_, index) => index !== startIndex);
  while (chosen.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const point = remaining[i];
      let minDist = Infinity;
      for (const seed of chosen) {
        const dx = point[0] - seed[0];
        const dy = point[1] - seed[1];
        const dist = dx * dx + dy * dy;
        if (dist < minDist) minDist = dist;
      }
      if (minDist > bestScore || (minDist === bestScore && (
        point[0] < remaining[bestIndex][0]
        || (point[0] === remaining[bestIndex][0] && point[1] < remaining[bestIndex][1])
      ))) {
        bestScore = minDist;
        bestIndex = i;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

function snapSeedInside(seed, geometry, candidates) {
  if (pointInGeometry(seed, geometry)) return [roundCoord(seed[0]), roundCoord(seed[1])];
  let best = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dx = candidate[0] - seed[0];
    const dy = candidate[1] - seed[1];
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  if (best) return best.slice();
  const centroid = geometryCentroid(geometry);
  return [roundCoord(centroid[0]), roundCoord(centroid[1])];
}

function compassRegionName(countryName, seed, centroid) {
  const dx = seed[0] - centroid[0];
  const dy = seed[1] - centroid[1];
  if (Math.hypot(dx, dy) < 1e-6) return `${countryName} (Central)`;
  const angle = Math.atan2(dy, dx);
  const sectors = [
    'East', 'Northeast', 'North', 'Northwest',
    'West', 'Southwest', 'South', 'Southeast',
  ];
  const index = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return `${countryName} (${sectors[index]})`;
}

function targetOrganicPartCount(area) {
  if (area >= 250) return 6;
  if (area >= 120) return 5;
  if (area >= 70) return 4;
  return 3;
}

function shouldOrganicSplitUnit(unit) {
  if (KEEP_LARGE_ADMINS.has(unit.countryKey)) return false;
  if (SKIP_ORGANIC_SPLIT.has(unit.countryKey)) return false;
  if (unit.area < OVERSIZE_AREA_THRESHOLD) return false;
  const wholeCountry = normalizeName(unit.stateName) === normalizeName(unit.adminName)
    || String(unit.parentKey || '').startsWith('ADM0-');
  return wholeCountry;
}

function resolveOrganicSeeds(unit, geometry, partCount) {
  const country = unit.countryKey;
  const catalog = ORGANIC_REGION_SEEDS[country];
  const candidates = sampleInteriorPoints(geometry, `${unit.parentKey}:sample`);
  const centroid = geometryCentroid(geometry);
  if (catalog && catalog.length > 0) {
    const named = catalog
      .slice()
      .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)) || a.lon - b.lon || a.lat - b.lat)
      .slice(0, Math.max(partCount, Math.min(6, catalog.length)))
      .map((entry) => ({
        name: entry.name,
        point: snapSeedInside([entry.lon, entry.lat], geometry, candidates),
      }));
    // Deduplicate snapped points that collapsed together.
    const unique = [];
    for (const entry of named) {
      const clash = unique.some((other) => (
        Math.hypot(other.point[0] - entry.point[0], other.point[1] - entry.point[1]) < 0.15
      ));
      if (!clash) unique.push(entry);
    }
    if (unique.length >= 3) return unique;
  }

  const count = clamp(partCount, 3, 6);
  const points = farthestPointSample(candidates, count, `${unit.parentKey}:fps`);
  return points.map((point) => ({
    name: compassRegionName(unit.adminName || unit.stateName, point, centroid),
    point,
  }));
}

function assignIslandPolygonsToSeeds(polygons, seeds) {
  const groups = seeds.map(() => []);
  for (const polygon of polygons) {
    const geometry = { type: 'Polygon', coordinates: polygon };
    const centroid = geometryCentroid(geometry);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < seeds.length; i++) {
      const dx = centroid[0] - seeds[i][0];
      const dy = centroid[1] - seeds[i][1];
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    groups[best].push(polygon);
  }
  return groups;
}

function organicSplitUnit(unit) {
  const baseGeometry = geometryFromPolygons(unit.polygons);
  if (!baseGeometry) return [unit];
  const densified = densifyGeometry(baseGeometry, ORGANIC_DENSE_EDGE);
  const partCount = targetOrganicPartCount(unit.area);
  const seeded = resolveOrganicSeeds(unit, densified, partCount);
  if (seeded.length < 2) return [unit];

  const seedPoints = seeded.map((entry) => entry.point);
  // Partition the largest landmass with Voronoi half-planes; ship leftover islands to nearest seed.
  const polygons = toPolygons(densified)
    .slice()
    .sort((a, b) => Math.abs(polygonAreaRing(b[0])) - Math.abs(polygonAreaRing(a[0])));
  const mainland = polygons[0];
  const islands = polygons.slice(1);
  const mainlandGeometry = { type: 'Polygon', coordinates: mainland };
  const cells = voronoiPartitionGeometry(mainlandGeometry, seedPoints);
  const islandGroups = assignIslandPolygonsToSeeds(islands, seedPoints);

  const units = [];
  for (let i = 0; i < seeded.length; i++) {
    const cellPolygons = [];
    if (cells[i]) cellPolygons.push(...toPolygons(cells[i]));
    cellPolygons.push(...islandGroups[i]);
    if (cellPolygons.length === 0) continue;
    const piece = unitFromGeometry(
      {
        ...unit,
        parentKey: unit.parentKey,
        countryKey: unit.countryKey,
      },
      geometryFromPolygons(cellPolygons),
      seeded[i].name,
      unit.ownerTag,
      `organic-${normalizeName(seeded[i].name).replace(/\s+/g, '-')}`,
    );
    if (!piece || piece.area < 1e-6) continue;
    piece.lockedOwner = Boolean(unit.lockedOwner);
    piece.artificialCuts = true;
    units.push(piece);
  }

  if (units.length < 2) return [unit];
  return units.sort(deterministicUnitSort);
}

function splitOversizedCountryUnits(units) {
  const out = [];
  let splitCountries = 0;
  let addedParts = 0;
  for (const unit of units) {
    if (!shouldOrganicSplitUnit(unit)) {
      out.push(unit);
      continue;
    }
    const parts = organicSplitUnit(unit);
    if (parts.length <= 1) {
      out.push(unit);
      continue;
    }
    splitCountries += 1;
    addedParts += parts.length - 1;
    out.push(...parts);
  }
  return {
    units: out.sort(deterministicUnitSort),
    splitCountries,
    addedParts,
  };
}

function weightedCentroid(polygons) {
  let totalArea = 0;
  let x = 0;
  let y = 0;
  for (const polygon of polygons) {
    const geometry = { type: 'Polygon', coordinates: polygon };
    const area = Math.max(1e-10, geometryArea(geometry));
    const centroid = geometryCentroid(geometry);
    x += centroid[0] * area;
    y += centroid[1] * area;
    totalArea += area;
  }
  if (totalArea <= 0) return [0, 0];
  return [x / totalArea, y / totalArea];
}

function unitFromGeometry(base, geometry, stateName, ownerTag, partitionKey) {
  if (!geometry) return null;
  const polygons = toPolygons(geometry);
  if (polygons.length === 0) return null;
  const area = Math.max(1e-9, geometryArea(geometry));
  const centroid = weightedCentroid(polygons);
  const bbox = geometryBounds(geometry);
  if (!bbox) return null;
  return {
    parentKey: `${base.parentKey}:${partitionKey}`,
    stateName,
    ownerTag,
    adminName: base.adminName,
    region: base.region,
    countryKey: base.countryKey || countryKeyForParent(base),
    partIndex: 0,
    partitionKey,
    polygons,
    area,
    centroid,
    bbox,
    lockedOwner: Boolean(ownerTag),
    artificialCuts: Boolean(base.artificialCuts) || String(partitionKey).startsWith('hist-') || String(partitionKey).startsWith('organic-'),
  };
}

function partitionHistoricalCountry(parent, regions) {
  const named = regions.filter((region) => region.bounds);
  const remainder = regions.find((region) => region.bounds === null);
  const units = [];

  // Clip each named region from the original country outline (exclusive bounds → real outer borders).
  for (const region of named) {
    const pieceGeometry = clipGeometryToBBox(parent.geometry, region.bounds);
    const unit = unitFromGeometry(
      parent,
      pieceGeometry,
      region.name,
      region.ownerTag,
      `hist-${normalizeName(region.name).replace(/\s+/g, '-')}`,
    );
    if (unit && unit.area > 1e-6) units.push(unit);
  }

  if (remainder) {
    let leftover = parent.geometry;
    for (const region of named) {
      leftover = subtractBBoxFromGeometry(leftover, region.bounds);
    }
    const unit = unitFromGeometry(
      parent,
      leftover,
      remainder.name,
      remainder.ownerTag,
      `hist-${normalizeName(remainder.name).replace(/\s+/g, '-')}`,
    );
    if (unit && unit.area > 1e-6) units.push(unit);
  }
  return units;
}

function parentsToUnits(parents) {
  const units = [];
  for (const parent of parents) {
    const adminKey = normalizeName(parent.adminName);
    const partition = HISTORICAL_PARTITIONS[adminKey];
    if (partition) {
      const base = {
        ...parent,
        countryKey: countryKeyForParent(parent),
      };
      units.push(...partitionHistoricalCountry(base, partition));
      continue;
    }
    const geometry = parent.geometry;
    const polygons = toPolygons(geometry);
    if (polygons.length === 0) continue;
    units.push({
      parentKey: parent.key,
      stateName: parent.stateName,
      ownerTag: parent.ownerTag,
      adminName: parent.adminName,
      region: parent.region,
      countryKey: countryKeyForParent(parent),
      partIndex: 0,
      partitionKey: '0',
      polygons,
      area: Math.max(1e-9, parent.area),
      centroid: parent.centroid,
      bbox: parent.bbox,
      lockedOwner: false,
      artificialCuts: false,
    });
  }
  return units.sort(deterministicUnitSort);
}

/**
 * Seeds whose Voronoi cell could plausibly touch `bbox`. Clipping every parent
 * against all 549 seeds is quadratic and needless: a cell only ever borders
 * nearby seeds, so take everything within a generous margin of the parent and
 * keep a floor so small islands still see enough competitors.
 */
function candidateSeedsForBounds(seeds, bbox) {
  const spanLon = bbox.maxLon - bbox.minLon;
  const spanLat = bbox.maxLat - bbox.minLat;
  const margin = Math.max(12, Math.max(spanLon, spanLat));
  const distance = (seed) => {
    const dx = Math.max(bbox.minLon - seed.lon, 0, seed.lon - bbox.maxLon);
    const dy = Math.max(bbox.minLat - seed.lat, 0, seed.lat - bbox.maxLat);
    return Math.hypot(dx, dy);
  };
  const ranked = seeds
    .map((seed) => ({ seed, d: distance(seed) }))
    .sort((a, b) => a.d - b.d || a.seed.key.localeCompare(b.seed.key));
  const within = ranked.filter((entry) => entry.d <= margin);
  const chosen = within.length >= 8 ? within : ranked.slice(0, 8);
  return chosen.slice(0, 64).map((entry) => entry.seed);
}

/**
 * Cuts the Natural Earth parents along Vic2's state regions: every parent is
 * Voronoi-partitioned by the region seeds near it, and the resulting pieces are
 * merged by region so each Vic2 region becomes exactly one province.
 */
function vic2UnitsFromParents(parents, seeds) {
  const pieces = new Map();
  const addPiece = (key, polygons, parent) => {
    let entry = pieces.get(key);
    if (!entry) pieces.set(key, (entry = { polygons: [], parents: new Map() }));
    entry.polygons.push(...polygons);
    const area = polygons.reduce((sum, poly) => sum + Math.abs(polygonAreaRing(poly[0])), 0);
    entry.parents.set(parent.adminName, (entry.parents.get(parent.adminName) ?? 0) + area);
  };

  for (const parent of parents) {
    if (!parent.bbox) continue;
    const candidates = candidateSeedsForBounds(seeds, parent.bbox);
    if (candidates.length === 1) {
      addPiece(candidates[0].key, toPolygons(parent.geometry), parent);
      continue;
    }
    const cells = voronoiPartitionGeometry(parent.geometry, candidates.map((seed) => [seed.lon, seed.lat]));
    cells.forEach((cell, index) => {
      if (!cell) return;
      const polygons = toPolygons(cell);
      if (polygons.length) addPiece(candidates[index].key, polygons, parent);
    });
  }

  const units = [];
  for (const seed of seeds) {
    const entry = pieces.get(seed.key);
    if (!entry || entry.polygons.length === 0) continue;
    // Clipping a concave parent leaves degenerate crumbs: zero-area rings and
    // sub-kilometre slivers that carry no territory but do carry self
    // intersections. Drop them before repairing what is left.
    const solid = entry.polygons.filter((polygon) => Math.abs(polygonAreaRing(polygon[0])) > MIN_PIECE_AREA);
    if (solid.length === 0) continue;
    const geometry = repairGeometrySelfIntersections(geometryFromPolygons(solid));
    if (!geometry) continue;
    const bbox = geometryBounds(geometry);
    if (!bbox) continue;
    const dominantParent = [...entry.parents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? seed.name;
    units.push({
      parentKey: seed.stateKey,
      stateName: seed.name,
      stateDisplayName: seed.stateName,
      ownerTag: seed.ownerTag,
      adminName: dominantParent,
      region: seed.continent,
      countryKey: normalizeName(dominantParent),
      partIndex: 0,
      partitionKey: seed.key,
      polygons: toPolygons(geometry),
      area: Math.max(1e-9, geometryArea(geometry)),
      centroid: weightedCentroid(toPolygons(geometry)),
      bbox,
      lockedOwner: true,
      // Voronoi chords are already organic-looking and, unlike the old bbox
      // cuts, are shared exactly between neighbouring cells. Running the debox
      // jitter over them perturbs each side independently and tears the shared
      // edge apart, which shows up as overlap slivers.
      artificialCuts: false,
    });
  }
  return units.sort(deterministicUnitSort);
}

/**
 * Groups regions into states of roughly TARGET_STATE_SIZE. Vic2's own region
 * keys are too lopsided to use directly (ENG alone carries 76 regions), so each
 * key prefix is split geographically by k-means over lon/lat. Deterministic:
 * farthest-point seeding, fixed iteration count, ties broken by region key.
 */
const TARGET_STATE_SIZE = 5;
/**
 * A state must be somewhere, not everywhere. Without this, Denmark's six
 * regions cluster into one "state" spanning Jutland, Iceland, Greenland and the
 * Gold Coast. Clusters are split until every member sits within this many
 * degrees of its centroid.
 */
const MAX_STATE_RADIUS_DEG = 10;
/**
 * Minimum area, in square degrees, for a clipped piece to count as territory.
 * Roughly 25 km^2 at the equator — below any real province fragment, and above
 * the degenerate crumbs Sutherland-Hodgman leaves on concave coastlines.
 */
const MIN_PIECE_AREA = 2e-3;

function clusterRegionsIntoStates(regions) {
  // Group by owner as well as region prefix: the historical compiler requires
  // every state to have exactly one owner, so a cluster must never straddle a
  // border.
  const byPrefix = new Map();
  for (const region of regions) {
    const prefix = `${region.ownerTag}|${region.key.split('_')[0]}`;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(region);
  }

  const assignment = new Map();
  for (const prefix of [...byPrefix.keys()].sort()) {
    const group = byPrefix.get(prefix).slice().sort((a, b) => a.key.localeCompare(b.key));
    /** Deterministic k-means over lon/lat: farthest-point seeding, fixed iterations. */
    const kmeans = (k) => {
      const centres = [[group[0].lon, group[0].lat]];
      while (centres.length < k) {
        let best = null;
        for (const region of group) {
          const d = Math.min(...centres.map((c) => Math.hypot(c[0] - region.lon, c[1] - region.lat)));
          if (!best || d > best.d) best = { d, region };
        }
        centres.push([best.region.lon, best.region.lat]);
      }
      let labels = group.map(() => 0);
      for (let iteration = 0; iteration < 25; iteration += 1) {
        labels = group.map((region) => {
          let bestIndex = 0;
          let bestDistance = Infinity;
          centres.forEach((c, i) => {
            const d = Math.hypot(c[0] - region.lon, c[1] - region.lat);
            if (d < bestDistance - 1e-12) { bestDistance = d; bestIndex = i; }
          });
          return bestIndex;
        });
        for (let i = 0; i < centres.length; i += 1) {
          const members = group.filter((_, idx) => labels[idx] === i);
          if (!members.length) continue;
          centres[i] = [
            members.reduce((s, r) => s + r.lon, 0) / members.length,
            members.reduce((s, r) => s + r.lat, 0) / members.length,
          ];
        }
      }
      return { labels, centres };
    };

    // Raise k until no cluster sprawls past MAX_STATE_RADIUS_DEG.
    let k = Math.max(1, Math.round(group.length / TARGET_STATE_SIZE));
    let result = kmeans(k);
    while (k < group.length) {
      const sprawls = result.centres.some((centre, i) => group.some(
        (region, idx) => result.labels[idx] === i
          && Math.hypot(centre[0] - region.lon, centre[1] - region.lat) > MAX_STATE_RADIUS_DEG,
      ));
      if (!sprawls) break;
      k += 1;
      result = kmeans(k);
    }

    group.forEach((region, idx) => {
      const members = group.filter((_, i) => result.labels[i] === result.labels[idx]);
      const centre = result.centres[result.labels[idx]];
      // Name the state after the region nearest its centre: representative, and
      // never a vast empty member like Greenland. The group key is an internal
      // "OWNER|prefix" string and must never reach the UI.
      const name = members.slice().sort((a, b) => (
        Math.hypot(centre[0] - a.lon, centre[1] - a.lat) - Math.hypot(centre[0] - b.lon, centre[1] - b.lat)
        || a.key.localeCompare(b.key)
      ))[0].name;
      assignment.set(region.key, { key: `${prefix}-${result.labels[idx]}`, name });
    });
  }
  return assignment;
}

function mergeTinySlivers(units) {
  const working = units.map((unit) => ({ ...unit, polygons: unit.polygons.map((poly) => poly.map((ring) => ring.map((pt) => pt.slice()))) }));
  working.sort((a, b) => a.area - b.area || deterministicUnitSort(a, b));

  let mergedCount = 0;
  const kept = [];
  for (const unit of working) {
    const isLargeEmpire = KEEP_LARGE_ADMINS.has(unit.countryKey);
    const floor = isLargeEmpire ? SLIVER_ABS_AREA * 0.35 : SLIVER_ABS_AREA;
    if (unit.area >= floor) {
      kept.push(unit);
      continue;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of kept) {
      if (candidate.countryKey !== unit.countryKey && candidate.ownerTag !== unit.ownerTag) continue;
      const dx = unit.centroid[0] - candidate.centroid[0];
      const dy = unit.centroid[1] - candidate.centroid[1];
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (!best) {
      for (const candidate of kept) {
        const dx = unit.centroid[0] - candidate.centroid[0];
        const dy = unit.centroid[1] - candidate.centroid[1];
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    if (!best) {
      kept.push(unit);
      continue;
    }
    best.polygons.push(...unit.polygons);
    best.area += unit.area;
    best.centroid = weightedCentroid(best.polygons);
    best.bbox = geometryBounds(geometryFromPolygons(best.polygons));
    best.artificialCuts = Boolean(best.artificialCuts) || Boolean(unit.artificialCuts);
    mergedCount += 1;
  }

  return { units: kept.sort(deterministicUnitSort), mergedCount };
}

function assignUniqueRealNames(units) {
  const used = new Map();
  for (const unit of units) {
    let name = String(unit.stateName || unit.adminName || 'Unknown').trim();
    const key = normalizeName(name);
    if (!used.has(key)) {
      used.set(key, unit.adminName);
      unit.displayName = name;
      continue;
    }
    const priorAdmin = used.get(key);
    if (normalizeName(priorAdmin) !== normalizeName(unit.adminName)) {
      name = `${name} (${unit.adminName})`;
    }
    unit.displayName = name;
    used.set(normalizeName(name), unit.adminName);
  }
}

function buildSegmentsFromGeometry(geometry) {
  const polygons = toPolygons(geometry);
  const segments = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const closed = ensureClosedRing(ring);
      for (let i = 0; i < closed.length - 1; i++) {
        const start = [roundCoord(closed[i][0]), roundCoord(closed[i][1])];
        const end = [roundCoord(closed[i + 1][0]), roundCoord(closed[i + 1][1])];
        if (start[0] === end[0] && start[1] === end[1]) continue;
        segments.push({
          start,
          end,
          bbox: {
            minLon: Math.min(start[0], end[0]),
            maxLon: Math.max(start[0], end[0]),
            minLat: Math.min(start[1], end[1]),
            maxLat: Math.max(start[1], end[1]),
          },
        });
      }
    }
  }
  return segments;
}

function makeProvinceGeometryRecord(unit, id) {
  const geometry = geometryFromPolygons(unit.polygons);
  const bounds = geometryBounds(geometry);
  const centroid = weightedCentroid(unit.polygons);
  const lon = roundCoord(centroid[0]);
  const lat = roundCoord(centroid[1]);
  const terrain = terrainForCell(lat, lon, unit.stateName, unit.region);
  const ownerTag = unit.lockedOwner
    ? unit.ownerTag
    : historicalOwnerOverride(unit.ownerTag, lon, lat, unit.adminName, unit.stateName);
  return {
    id,
    name: unit.displayName || unit.stateName,
    ownerTag,
    stateId: -1,
    stateName: unit.displayName || unit.stateName,
    terrain,
    coastal: false,
    rgoGood: rgoForTerrain(terrain, lat, lon, unit.parentKey),
    neighbors: [],
    lon,
    lat,
    populationWeight: populationWeight(lat, lon, terrain),
    geometry,
    bbox: bounds,
    segments: buildSegmentsFromGeometry(geometry),
    countryKey: unit.countryKey,
    parentKey: unit.parentKey,
    artificialCuts: Boolean(unit.artificialCuts),
  };
}

function candidatePairsByGrid(provinces, cellSize) {
  const grid = new Map();
  provinces.forEach((province, index) => {
    const bbox = province.bbox;
    if (!bbox) return;
    const minX = Math.floor((bbox.minLon + 180) / cellSize);
    const maxX = Math.floor((bbox.maxLon + 180) / cellSize);
    const minY = Math.floor((bbox.minLat + 90) / cellSize);
    const maxY = Math.floor((bbox.maxLat + 90) / cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const list = grid.get(key) ?? [];
        list.push(index);
        grid.set(key, list);
      }
    }
  });

  const pairs = new Set();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
  }
  return pairs;
}

function provincesTouch(a, b, epsilon) {
  if (!a.bbox || !b.bbox || !boundsNear(a.bbox, b.bbox, epsilon)) return false;
  const epsSq = epsilon * epsilon;
  for (const segA of a.segments) {
    for (const segB of b.segments) {
      if (!boundsNear(segA.bbox, segB.bbox, epsilon)) continue;
      if (segmentDistanceSq(segA, segB, epsilon) <= epsSq) return true;
    }
  }
  return false;
}

function edgeKey(start, end, precision = 1000) {
  const ax = Math.round(start[0] * precision);
  const ay = Math.round(start[1] * precision);
  const bx = Math.round(end[0] * precision);
  const by = Math.round(end[1] * precision);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax}:${ay}|${bx}:${by}`;
  return `${bx}:${by}|${ax}:${ay}`;
}

function compactNationalBorders(provinces) {
  const edges = new Map();
  for (const province of provinces) {
    for (const segment of province.segments) {
      const start = [roundCoord(segment.start[0]), roundCoord(segment.start[1])];
      const end = [roundCoord(segment.end[0]), roundCoord(segment.end[1])];
      const key = edgeKey(start, end, 260);
      let edge = edges.get(key);
      if (!edge) {
        const startFirst = start[0] < end[0] || (start[0] === end[0] && start[1] <= end[1]);
        edge = {
          start: startFirst ? start : end,
          end: startFirst ? end : start,
          owners: new Set(),
        };
        edges.set(key, edge);
      }
      edge.owners.add(province.ownerTag);
    }
  }

  const coordinates = [];
  for (const edge of edges.values()) {
    if (edge.owners.size < 2) continue;
    coordinates.push([edge.start, edge.end]);
  }
  coordinates.sort((a, b) => (
    a[0][0] - b[0][0]
    || a[0][1] - b[0][1]
    || a[1][0] - b[1][0]
    || a[1][1] - b[1][1]
  ));
  return {
    type: 'FeatureCollection',
    features: coordinates.length > 0
      ? [{
        type: 'Feature',
        properties: { id: 0 },
        geometry: { type: 'MultiLineString', coordinates },
      }]
      : [],
  };
}

function computeCoastalFlags(provinces) {
  const edgeUse = new Map();
  for (const province of provinces) {
    for (const segment of province.segments) {
      const key = edgeKey(segment.start, segment.end, 220);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  for (const province of provinces) {
    let coastal = false;
    for (const segment of province.segments) {
      const key = edgeKey(segment.start, segment.end, 220);
      if ((edgeUse.get(key) ?? 0) === 1) {
        coastal = true;
        break;
      }
    }
    province.coastal = coastal;
  }
}

function linkIsolatedProvinces(provinces) {
  let linked = 0;
  for (const province of provinces) {
    if (province.neighbors.length > 0) continue;
    let bestId = -1;
    let bestDistance = Infinity;
    for (const other of provinces) {
      if (other.id === province.id) continue;
      const dx = province.lon - other.lon;
      const dy = province.lat - other.lat;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = other.id;
      }
    }
    if (bestId >= 0) {
      province.neighbors.push(bestId);
      const reverse = provinces[bestId].neighbors;
      if (!reverse.includes(province.id)) reverse.push(province.id);
      linked += 1;
    }
  }
  for (const province of provinces) province.neighbors.sort((a, b) => a - b);
  return linked;
}

function buildAdjacency(provinces) {
  const neighbors = provinces.map(() => new Set());
  const pairs = candidatePairsByGrid(provinces, 8);
  for (const pair of pairs) {
    const [aText, bText] = pair.split('|');
    const a = Number(aText);
    const b = Number(bText);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const provinceA = provinces[a];
    const provinceB = provinces[b];
    if (!provinceA || !provinceB) continue;
    if (provincesTouch(provinceA, provinceB, TOUCH_EPSILON)) {
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }
  for (let i = 0; i < provinces.length; i++) {
    provinces[i].neighbors = Array.from(neighbors[i]).sort((a, b) => a - b);
  }
  const bridgedIslands = linkIsolatedProvinces(provinces);
  return { bridgedIslands };
}

function buildProvinceRecords(units) {
  const stateKeyToId = new Map();
  const stateRecords = [];
  const provinceRecords = [];
  const orderedUnits = units.slice().sort(deterministicUnitSort);

  for (const unit of orderedUnits) {
    const stateKey = unit.parentKey;
    let stateId = stateKeyToId.get(stateKey);
    if (stateId === undefined) {
      stateId = stateRecords.length;
      stateKeyToId.set(stateKey, stateId);
      stateRecords.push({
        id: stateId,
        key: stateKey,
        name: unit.stateDisplayName || unit.displayName || unit.stateName,
        ownerTag: unit.ownerTag,
        provinceIds: [],
      });
    }
    const province = makeProvinceGeometryRecord(unit, provinceRecords.length);
    province.stateId = stateId;
    stateRecords[stateId].provinceIds.push(province.id);
    provinceRecords.push(province);
  }

  const { nationalBorders, bridgedIslands } = applySharedTopology(provinceRecords);
  for (const state of stateRecords) {
    const ownerCounts = new Map();
    for (const provinceId of state.provinceIds) {
      const ownerTag = provinceRecords[provinceId]?.ownerTag;
      if (!ownerTag) continue;
      ownerCounts.set(ownerTag, (ownerCounts.get(ownerTag) ?? 0) + 1);
    }
    const bestOwner = Array.from(ownerCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (bestOwner) state.ownerTag = bestOwner;
  }

  return { provinceRecords, stateRecords, bridgedIslands, nationalBorders };
}

function buildNations(provinces, states) {
  const byTag = new Map();
  for (const province of provinces) {
    const tag = province.ownerTag in NATION_LIBRARY ? province.ownerTag : 'COL';
    province.ownerTag = tag;
    const score = province.populationWeight;
    const current = byTag.get(tag);
    if (!current || score > current.score) byTag.set(tag, { capital: province.id, score });
  }
  // A great power with no land means the cut went wrong, so fail rather than
  // ship a phantom. Minors are different: at Vic2 region granularity a state
  // that never dominates a region (Parma, Lucca) genuinely has nowhere to sit,
  // and the historical compiler rejects landless nations outright.
  const missingMajor = MAJOR_TAGS.filter((tag) => !byTag.has(tag));
  if (missingMajor.length) {
    throw new Error(`Great powers own no provinces after the cut: ${missingMajor.join(', ')}`);
  }
  const absorbedMinors = REQUIRED_MINOR_TAGS.filter((tag) => !byTag.has(tag));
  if (absorbedMinors.length) {
    console.warn(
      `[build-map] Minors absorbed at region granularity (no dominant region): ${absorbedMinors.join(', ')}`,
    );
  }

  const coresByTag = new Map();
  for (const state of states) {
    const list = coresByTag.get(state.ownerTag) ?? [];
    list.push(state.id);
    coresByTag.set(state.ownerTag, list);
  }

  const tags = Array.from(byTag.keys()).sort((a, b) => a.localeCompare(b));
  const nations = [];
  for (const tag of tags) {
    const def = NATION_LIBRARY[tag] || NATION_LIBRARY.COL;
    nations.push({
      tag,
      name: def.name,
      color: def.color,
      government: def.government || GOV_DEFAULT,
      capitalProvinceId: byTag.get(tag)?.capital ?? 0,
      primaryCulture: def.primaryCulture || 'british',
      coreStateIds: (coresByTag.get(tag) ?? []).slice().sort((a, b) => a - b),
    });
  }
  return nations;
}

function buildFormables(states) {
  return FORMABLE_TEMPLATES.map((template) => {
    const ownerSet = new Set(template.ownerTags);
    const coreStateIds = states
      .filter((state) => ownerSet.has(state.ownerTag))
      .map((state) => state.id)
      .sort((a, b) => a - b);
    return {
      key: template.key,
      resultTag: template.resultTag,
      resultName: template.resultName,
      resultColor: template.resultColor,
      resultPrimaryCulture: template.resultPrimaryCulture,
      candidateTags: template.candidateTags.slice(),
      coreStateIds,
      requiredCoreShare: template.requiredCoreShare,
      requireIndependent: template.requireIndependent,
      requireGreatPower: template.requireGreatPower,
      prestigeReward: template.prestigeReward,
    };
  });
}

function compactGeojson(provinces) {
  return {
    type: 'FeatureCollection',
    features: provinces.map((province) => ({
      type: 'Feature',
      id: province.id,
      properties: {
        id: province.id,
        n: province.name,
      },
      // Quantize only the shipped map geometry — worldSeed lon/lat/neighbors stay
      // full-precision. Snapping vertices to the export grid can merge nearby
      // points and re-introduce self intersections that were already repaired
      // upstream, so repair once more on the quantized result.
      geometry: repairGeometrySelfIntersections(quantizeExportGeometry(province.geometry))
        ?? quantizeExportGeometry(province.geometry),
    })),
  };
}

async function readJsonFile(filePath) {
  const payload = await readFile(filePath, 'utf8');
  return JSON.parse(payload);
}

async function tryReadRaw(filename) {
  const fullPath = path.join(RAW_DIR, filename);
  try {
    return { json: await readJsonFile(fullPath), fullPath };
  } catch {
    return null;
  }
}

async function loadSourceGeojson() {
  await mkdir(RAW_DIR, { recursive: true });
  for (const filename of ADMIN1_FILES) {
    const loaded = await tryReadRaw(filename);
    if (loaded) {
      return { json: loaded.json, source: `raw:${filename}`, fallback: false, filename };
    }
  }
  throw new Error('No Natural Earth admin-1 source found in content/raw.');
}

async function loadAdmin0Geojson() {
  const loaded = await tryReadRaw(ADMIN0_FILE);
  if (!loaded) return null;
  return { json: loaded.json, source: `raw:${ADMIN0_FILE}` };
}

async function loadVic2Regions() {
  const regions = await readJsonFile(path.join(VIC2_DIR, 'vic2-region-points.json'));
  const reference = await readJsonFile(path.join(VIC2_DIR, 'vic2-reference.json'));
  const deltas = await readJsonFile(path.join(VIC2_DIR, 'vic2-1830-deltas.json'));
  return { regions: applyVic2Deltas(regions.regions, deltas), countries: reference.countries };
}

/**
 * Rolls the Vic2 1836 baseline back to 1830-01-01. Each delta is checked against
 * the owner Vic2 actually ships, so a Vic2 patch that moves a region shows up as
 * a loud failure here rather than as a silently wrong map.
 */
function applyVic2Deltas(regions, deltas) {
  const byKey = new Map(regions.map((region) => [region.key, region]));
  for (const delta of deltas.ownership) {
    const region = byKey.get(delta.regionKey);
    if (!region) throw new Error(`[1830] delta references unknown region ${delta.regionKey}`);
    if (region.dominantOwner1836 !== delta.from) {
      throw new Error(
        `[1830] ${delta.regionKey} (${delta.regionName}) expected Vic2 owner ${delta.from}`
        + ` but the install says ${region.dominantOwner1836}`,
      );
    }
    region.dominantOwner1836 = delta.to;
  }
  console.log(`[build-map] 1830 rollback: ${deltas.ownership.length} region ownership deltas applied`);
  return regions;
}

/** Vic2 government -> the eight Grand Century GovernmentType values. */
const VIC2_GOVERNMENT = {
  absolute_monarchy: 'absolute_monarchy',
  hms_government: 'hms_government',
  prussian_constitutionalism: 'constitutional_monarchy',
  democracy: 'democracy',
  presidential_dictatorship: 'presidential_dictatorship',
  bourgeois_dictatorship: 'presidential_dictatorship',
  proletarian_dictatorship: 'proletarian_dictatorship',
  fascist_dictatorship: 'fascist_dictatorship',
  theocracy: 'absolute_monarchy',
};

/**
 * Fills NATION_LIBRARY out to every tag that actually owns land after the cut.
 * Hand-written Grand Century entries win, so existing colours and names survive;
 * everything else is generated from Vic2's country table.
 */
function registerVic2Nations(countries, seeds) {
  const byGcTag = new Map();
  for (const country of countries) {
    const tag = toGrandCenturyTag(country.tag);
    if (!byGcTag.has(tag)) byGcTag.set(tag, country);
  }
  const owning = new Set(seeds.map((seed) => seed.ownerTag));
  let added = 0;
  for (const tag of [...owning].sort()) {
    if (NATION_LIBRARY[tag]) continue;
    const country = byGcTag.get(tag);
    if (!country) {
      NATION_LIBRARY[tag] = { ...NATION_LIBRARY.COL, name: tag };
      added += 1;
      continue;
    }
    NATION_LIBRARY[tag] = {
      name: country.name,
      color: country.color ?? [128, 128, 128],
      government: VIC2_GOVERNMENT[country.government] ?? GOV_DEFAULT,
      primaryCulture: country.primaryCulture ?? 'cosmopolitan',
    };
    added += 1;
  }
  for (const tag of VIC2_KEEP_TAGLESS) {
    if (!NATION_LIBRARY[tag]) NATION_LIBRARY[tag] = { ...NATION_LIBRARY.COL, name: tag };
  }
  console.log(`[build-map] Nation library: ${Object.keys(NATION_LIBRARY).length} tags (${added} added from Vic2)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const loaded = await loadSourceGeojson();
  let parents = buildParentsFromGeojson(loaded.json, 0);

  const countriesCovered = new Set(parents.map((parent) => normalizeName(parent.adminName)));
  const admin0 = await loadAdmin0Geojson();
  let admin0Appended = 0;
  if (admin0?.json) {
    const admin0Parents = buildParentsFromGeojson(admin0.json, 0, 'ADM0-', true)
      .filter((parent) => !countriesCovered.has(normalizeName(parent.adminName)));
    admin0Appended = admin0Parents.length;
    parents = [...parents, ...admin0Parents].sort(deterministicParentSort);
    console.log(`[build-map] Admin-0 countries appended: ${admin0Appended} from ${admin0.source}`);
  } else {
    console.warn('[build-map] Admin-0 fallback unavailable; continuing with admin-1 geometry only.');
  }

  if (parents.length === 0) {
    throw new Error('No valid parent geometries available for province generation.');
  }

  const vic2 = await loadVic2Regions();
  const owned = vic2.regions.map((region) => ({
    ...region,
    ownerTag: toGrandCenturyTag(region.dominantOwner1836) ?? 'UNC',
  }));
  const stateAssignment = clusterRegionsIntoStates(owned);
  const seeds = owned.map((region) => {
    const state = stateAssignment.get(region.key);
    return {
      key: region.key,
      name: region.name,
      lon: region.lon,
      lat: region.lat,
      continent: region.continent,
      pixelArea: region.pixelArea,
      ownerTag: region.ownerTag,
      stateKey: state.key,
      stateName: state.name,
    };
  });
  registerVic2Nations(vic2.countries, seeds);

  const units = vic2UnitsFromParents(parents, seeds);
  console.log(`[build-map] Vic2 regions seeded: ${seeds.length}, units cut: ${units.length}`);
  const missing = seeds.length - units.length;
  if (missing > 0) {
    const emptyKeys = seeds.filter((seed) => !units.some((unit) => unit.partitionKey === seed.key)).map((seed) => seed.key);
    console.warn(`[build-map] regions with no land after the cut (${missing}): ${emptyKeys.join(', ')}`);
  }
  const { provinceRecords, stateRecords, bridgedIslands, nationalBorders } = buildProvinceRecords(units);

  if (provinceRecords.length < MIN_PROVINCES || provinceRecords.length > MAX_PROVINCES) {
    throw new Error(
      `Generated province count ${provinceRecords.length} outside hard acceptance [${MIN_PROVINCES}, ${MAX_PROVINCES}].`,
    );
  }

  const nations = buildNations(provinceRecords, stateRecords);
  const formables = buildFormables(stateRecords);
  const geojson = compactGeojson(provinceRecords);
  const nationalBorderParts = nationalBorders.features[0]?.geometry?.coordinates?.length ?? 0;
  const coastalCount = provinceRecords.filter((province) => province.coastal).length;

  const worldSeed = {
    source: loaded.source,
    generatedAt: '1830-01-01T00:00:00.000Z',
    provinceCount: provinceRecords.length,
    provinces: provinceRecords.map((province) => ({
      id: province.id,
      name: province.name,
      ownerTag: province.ownerTag,
      stateId: province.stateId,
      stateName: province.stateName,
      terrain: province.terrain,
      coastal: province.coastal,
      rgoGood: province.rgoGood,
      neighbors: province.neighbors,
      lon: province.lon,
      lat: province.lat,
      populationWeight: province.populationWeight,
    })),
    states: stateRecords.map((state) => ({
      id: state.id,
      name: state.name,
      ownerTag: state.ownerTag,
      provinceIds: state.provinceIds,
    })),
    nations,
    formables,
  };

  await writeFile(path.join(OUT_DIR, 'provinces.geo.json'), `${JSON.stringify(geojson)}\n`, 'utf8');
  const nationalBordersExport = {
    type: 'FeatureCollection',
    features: nationalBorders.features.map((feat) => ({
      ...feat,
      geometry: quantizeExportGeometry(feat.geometry),
    })),
  };
  await writeFile(path.join(OUT_DIR, 'nationalBorders.geo.json'), `${JSON.stringify(nationalBordersExport)}\n`, 'utf8');
  await writeFile(path.join(OUT_DIR, 'worldSeed.json'), `${JSON.stringify(worldSeed)}\n`, 'utf8');

  const chinaCount = provinceRecords.filter((province) => (
    normalizeName(province.countryKey || '') === 'china'
    || normalizeName(province.stateName).match(/gansu|qinghai|guangxi|guizhou|chongqing|beijing|fujian|anhui|guangdong|tibet|xinjiang|hainan|ningxia|shaanxi|shanxi|hubei|hunan|sichuan|yunnan|hebei|henan|liaoning|shandong|tianjin|jiangxi|jiangsu|shanghai|zhejiang|jilin|inner mongolia|heilongjiang/)
  )).length;
  const qngCount = provinceRecords.filter((province) => province.ownerTag === 'QNG').length;
  const numbered = provinceRecords.filter((province) => /\s\d+$/.test(province.name));
  const sampleNames = ['Gansu', 'California', 'Bavaria', 'Prussia', 'Île-de-France', 'Brittany', 'Provence', 'Texas', 'Piedmont', 'Saxony']
    .map((wanted) => provinceRecords.find((province) => province.name === wanted || province.name.startsWith(wanted))?.name)
    .filter(Boolean);

  const geoGzipBytes = gzipSync(JSON.stringify(geojson)).length;
  console.log(`[build-map] Source: ${loaded.source}`);
  console.log(`[build-map] Parents loaded: ${parents.length} (admin-1 + ${admin0Appended} admin-0)`);
  console.log(`[build-map] States (Vic2 region clusters): ${stateRecords.length}`);
  console.log(`[build-map] Island nearest-neighbor bridges: ${bridgedIslands}`);
  console.log(`[build-map] Provinces generated: ${provinceRecords.length}`);
  console.log(`[build-map] Coastal provinces: ${coastalCount}`);
  console.log(`[build-map] China provinces: ${chinaCount} (QNG owned: ${qngCount})`);
  console.log(`[build-map] Sample real names: ${sampleNames.join(', ') || '(none)'}`);
  console.log(`[build-map] Numbered names remaining: ${numbered.length}`);
  console.log(`[build-map] National border polylines: ${nationalBorderParts}`);
  console.log(`[build-map] provinces.geo.json gzip bytes: ${geoGzipBytes}`);
}

main().catch((error) => {
  console.error(`[build-map] Failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
