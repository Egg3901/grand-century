import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

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
const MAX_PROVINCES = 700;
const TOUCH_EPSILON = 0.045;
const SLIVER_ABS_AREA = 0.012;
const SOURCE_TOLERANCE = 0.025;
const ADMIN0_TOLERANCE = 0.03;
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
]);

const GOV_DEFAULT = 'absolute_monarchy';

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
const REQUIRED_MINOR_TAGS = [
  'BAV', 'SAX', 'HAN', 'WUR', 'BAD', 'HES', 'PAP', 'TUS', 'MOD', 'PAR', 'TEX',
  'BEL', 'GRE', 'DEN', 'SWI', 'EGY', 'PER', 'AFG', 'SIA', 'KOR', 'MOR',
];

const ISO_TO_TAG = {
  af: 'AFG', al: 'OTT', be: 'BEL', bh: 'OTT', bo: 'BOL', bt: 'BHU', ch: 'SWI', cl: 'CHL',
  co: 'CLM', dk: 'DEN', ec: 'CLM', eg: 'EGY', et: 'ETH', ge: 'RUS', gr: 'GRE', hn: 'CLM',
  ir: 'PER', jo: 'EGY', kh: 'CAM', kp: 'KOR', kr: 'KOR', la: 'LAO', ma: 'MOR', mm: 'BUR',
  np: 'NEP', pa: 'CLM', pe: 'PEU', py: 'PRG', rs: 'OTT', ro: 'OTT', sd: 'EGY', sy: 'EGY',
  th: 'SIA', uy: 'URY', ve: 'VEN', vn: 'VIE',
};

const COUNTRY_TO_TAG = {
  'united kingdom': 'ENG', ireland: 'ENG', canada: 'ENG', australia: 'ENG', 'new zealand': 'ENG',
  india: 'ENG', pakistan: 'ENG', bangladesh: 'ENG', 'south africa': 'ENG', nigeria: 'UNC',
  egypt: 'EGY', france: 'FRA', belgium: 'BEL', algeria: 'FRA', germany: 'PRU', denmark: 'DEN',
  switzerland: 'SWI', 'czech republic': 'AUS', czechia: 'AUS', slovakia: 'AUS', hungary: 'AUS',
  slovenia: 'AUS', croatia: 'AUS', austria: 'AUS', russia: 'RUS', ukraine: 'RUS', belarus: 'RUS',
  lithuania: 'RUS', latvia: 'RUS', estonia: 'RUS', finland: 'RUS', kazakhstan: 'RUS', georgia: 'RUS',
  armenia: 'RUS', azerbaijan: 'RUS', 'united states of america': 'USA', 'united states': 'USA',
  china: 'QNG', mongolia: 'QNG', taiwan: 'QNG', turkey: 'OTT', syria: 'EGY', iraq: 'OTT',
  jordan: 'EGY', lebanon: 'EGY', israel: 'EGY', palestine: 'EGY', saudi: 'UNC', yemen: 'UNC',
  greece: 'GRE', spain: 'ESP', cuba: 'ESP', philippines: 'ESP', portugal: 'POR', angola: 'POR',
  mozambique: 'POR', netherlands: 'NLD', indonesia: 'NLD', sweden: 'SWE', norway: 'SWE',
  italy: 'SAR', 'sardinia-piedmont': 'SAR', sicily: 'TSC', japan: 'JPN', mexico: 'MEX',
  brazil: 'BRA', argentina: 'ARG', peru: 'PEU', chile: 'CHL', colombia: 'CLM', ecuador: 'CLM',
  venezuela: 'VEN', bolivia: 'BOL', paraguay: 'PRG', uruguay: 'URY', iran: 'PER', persia: 'PER',
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
    candidateTags: ['SAR', 'TSC', 'PAP', 'MOD', 'PAR', 'TUS'],
    ownerTags: ['SAR', 'TSC', 'PAP', 'MOD', 'PAR', 'TUS'],
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
  if (admin === 'united states of america' && state === 'texas') return 'TEX';
  if (admin === 'belgium') return 'BEL';
  if (admin === 'greece') return 'GRE';
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
  if (admin === 'algeria') return 'FRA';
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

function buildParentsFromGeojson(geojson, tolerance, keyPrefix = '', forceCountryName = false) {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const parents = [];
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature.properties || {};
    const simplified = simplifyGeometry(feature.geometry, tolerance);
    const bbox = geometryBounds(simplified);
    if (!bbox) continue;
    const area = Math.max(1e-6, geometryArea(simplified));
    const centroid = geometryCentroid(simplified);
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
      geometry: simplified,
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
  let ring = ensureClosedRing(polygon[0] || []);
  if (ring.length < 4) return null;
  ring = clipRingByAxis(ring, 'x', bbox.maxLon, true);
  if (!ring) return null;
  ring = clipRingByAxis(ring, 'x', bbox.minLon, false);
  if (!ring) return null;
  ring = clipRingByAxis(ring, 'y', bbox.maxLat, true);
  if (!ring) return null;
  ring = clipRingByAxis(ring, 'y', bbox.minLat, false);
  if (!ring) return null;
  return [ring];
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
    });
  }
  return units.sort(deterministicUnitSort);
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
        name: unit.displayName || unit.stateName,
        ownerTag: unit.ownerTag,
        provinceIds: [],
      });
    }
    const province = makeProvinceGeometryRecord(unit, provinceRecords.length);
    province.stateId = stateId;
    stateRecords[stateId].provinceIds.push(province.id);
    provinceRecords.push(province);
  }

  const { bridgedIslands } = buildAdjacency(provinceRecords);
  computeCoastalFlags(provinceRecords);
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

  return { provinceRecords, stateRecords, bridgedIslands };
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
  const fallbackCapital = provinces[0]?.id ?? 0;
  for (const tag of MAJOR_TAGS) {
    if (!byTag.has(tag)) byTag.set(tag, { capital: fallbackCapital, score: 0 });
  }
  for (const tag of REQUIRED_MINOR_TAGS) {
    if (!byTag.has(tag)) byTag.set(tag, { capital: fallbackCapital, score: 0 });
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
      geometry: province.geometry,
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const loaded = await loadSourceGeojson();
  let parents = buildParentsFromGeojson(loaded.json, SOURCE_TOLERANCE);

  const countriesCovered = new Set(parents.map((parent) => normalizeName(parent.adminName)));
  const admin0 = await loadAdmin0Geojson();
  let admin0Appended = 0;
  if (admin0?.json) {
    const admin0Parents = buildParentsFromGeojson(admin0.json, ADMIN0_TOLERANCE, 'ADM0-', true)
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

  const baseUnits = parentsToUnits(parents);
  const sliverResult = mergeTinySlivers(baseUnits);
  assignUniqueRealNames(sliverResult.units);
  const { provinceRecords, stateRecords, bridgedIslands } = buildProvinceRecords(sliverResult.units);

  if (provinceRecords.length < MIN_PROVINCES || provinceRecords.length > MAX_PROVINCES) {
    throw new Error(
      `Generated province count ${provinceRecords.length} outside hard acceptance [${MIN_PROVINCES}, ${MAX_PROVINCES}].`,
    );
  }

  const nations = buildNations(provinceRecords, stateRecords);
  const formables = buildFormables(stateRecords);
  const geojson = compactGeojson(provinceRecords);
  const nationalBorders = compactNationalBorders(provinceRecords);
  const nationalBorderSegments = nationalBorders.features[0]?.geometry?.coordinates?.length ?? 0;

  const worldSeed = {
    source: loaded.source,
    generatedAt: '1836-01-01T00:00:00.000Z',
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
  await writeFile(path.join(OUT_DIR, 'nationalBorders.geo.json'), `${JSON.stringify(nationalBorders)}\n`, 'utf8');
  await writeFile(path.join(OUT_DIR, 'worldSeed.json'), `${JSON.stringify(worldSeed)}\n`, 'utf8');

  const chinaCount = provinceRecords.filter((province) => (
    normalizeName(province.countryKey || '') === 'china'
    || normalizeName(province.stateName).match(/gansu|qinghai|guangxi|guizhou|chongqing|beijing|fujian|anhui|guangdong|tibet|xinjiang|hainan|ningxia|shaanxi|shanxi|hubei|hunan|sichuan|yunnan|hebei|henan|liaoning|shandong|tianjin|jiangxi|jiangsu|shanghai|zhejiang|jilin|inner mongolia|heilongjiang/)
  )).length;
  const qngCount = provinceRecords.filter((province) => province.ownerTag === 'QNG').length;
  const numbered = provinceRecords.filter((province) => /\s\d+$/.test(province.name));
  const sampleNames = ['Gansu', 'California', 'Bavaria', 'Prussia', 'France', 'Texas', 'Piedmont', 'Saxony']
    .map((wanted) => provinceRecords.find((province) => province.name === wanted || province.name.startsWith(wanted))?.name)
    .filter(Boolean);

  const geoGzipBytes = gzipSync(JSON.stringify(geojson)).length;
  console.log(`[build-map] Source: ${loaded.source}`);
  console.log(`[build-map] Parents loaded: ${parents.length} (admin-1 + ${admin0Appended} admin-0)`);
  console.log(`[build-map] Units before sliver merge: ${baseUnits.length}`);
  console.log(`[build-map] Slivers merged: ${sliverResult.mergedCount}`);
  console.log(`[build-map] Island nearest-neighbor bridges: ${bridgedIslands}`);
  console.log(`[build-map] Provinces generated: ${provinceRecords.length}`);
  console.log(`[build-map] China provinces: ${chinaCount} (QNG owned: ${qngCount})`);
  console.log(`[build-map] Sample real names: ${sampleNames.join(', ') || '(none)'}`);
  console.log(`[build-map] Numbered names remaining: ${numbered.length}`);
  console.log(`[build-map] National border segments: ${nationalBorderSegments}`);
  console.log(`[build-map] provinces.geo.json gzip bytes: ${geoGzipBytes}`);
}

main().catch((error) => {
  console.error(`[build-map] Failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
