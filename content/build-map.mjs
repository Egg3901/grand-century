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

const TARGET_PROVINCES = 1450;
const DENSIFY_TARGET_PROVINCES = 1520;
const MIN_PROVINCES = 800;
const MAX_PROVINCES = 1500;
const ADMIN0_FALLBACK_COUNTRY_FLOOR = 30;
const TOUCH_EPSILON = 0.045;
const SLIVER_ABS_AREA = 0.002;
const EUROPE_BOUNDS = { minLon: -25, maxLon: 45, minLat: 35, maxLat: 72 };
const MIN_NON_EUROPE_KEEP_SMALL = 1;
const MIN_NON_EUROPE_KEEP_MEDIUM = 2;
const MIN_NON_EUROPE_KEEP_LARGE = 3;

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
  'BAV',
  'SAX',
  'HAN',
  'WUR',
  'BAD',
  'HES',
  'PAP',
  'TUS',
  'MOD',
  'PAR',
  'TEX',
  'BEL',
  'GRE',
  'DEN',
  'SWI',
  'EGY',
  'PER',
  'AFG',
  'SIA',
  'KOR',
  'MOR',
];

const ISO_TO_TAG = {
  af: 'AFG',
  al: 'OTT',
  be: 'BEL',
  bh: 'OTT',
  bo: 'BOL',
  bt: 'BHU',
  ch: 'SWI',
  cl: 'CHL',
  co: 'CLM',
  dk: 'DEN',
  ec: 'CLM',
  eg: 'EGY',
  et: 'ETH',
  ge: 'RUS',
  gr: 'GRE',
  hn: 'CLM',
  ir: 'PER',
  jo: 'EGY',
  kh: 'CAM',
  kp: 'KOR',
  kr: 'KOR',
  la: 'LAO',
  ma: 'MOR',
  mm: 'BUR',
  np: 'NEP',
  pa: 'CLM',
  pe: 'PEU',
  py: 'PRG',
  rs: 'OTT',
  ro: 'OTT',
  sd: 'EGY',
  sy: 'EGY',
  th: 'SIA',
  uy: 'URY',
  ve: 'VEN',
  vn: 'VIE',
};

const COUNTRY_TO_TAG = {
  'united kingdom': 'ENG',
  ireland: 'ENG',
  canada: 'ENG',
  australia: 'ENG',
  'new zealand': 'ENG',
  india: 'ENG',
  pakistan: 'ENG',
  bangladesh: 'ENG',
  'south africa': 'ENG',
  nigeria: 'UNC',
  egypt: 'EGY',
  france: 'FRA',
  belgium: 'BEL',
  algeria: 'FRA',
  germany: 'PRU',
  denmark: 'DEN',
  switzerland: 'SWI',
  'czech republic': 'AUS',
  czechia: 'AUS',
  slovakia: 'AUS',
  hungary: 'AUS',
  slovenia: 'AUS',
  croatia: 'AUS',
  austria: 'AUS',
  russia: 'RUS',
  ukraine: 'RUS',
  belarus: 'RUS',
  lithuania: 'RUS',
  latvia: 'RUS',
  estonia: 'RUS',
  finland: 'RUS',
  kazakhstan: 'RUS',
  georgia: 'RUS',
  armenia: 'RUS',
  azerbaijan: 'RUS',
  'united states of america': 'USA',
  'united states': 'USA',
  china: 'QNG',
  mongolia: 'QNG',
  taiwan: 'QNG',
  turkey: 'OTT',
  syria: 'EGY',
  iraq: 'OTT',
  jordan: 'EGY',
  lebanon: 'EGY',
  israel: 'EGY',
  palestine: 'EGY',
  saudi: 'UNC',
  yemen: 'UNC',
  greece: 'GRE',
  spain: 'ESP',
  cuba: 'ESP',
  philippines: 'ESP',
  portugal: 'POR',
  angola: 'POR',
  mozambique: 'POR',
  netherlands: 'NLD',
  indonesia: 'NLD',
  sweden: 'SWE',
  norway: 'SWE',
  italy: 'SAR',
  'sardinia-piedmont': 'SAR',
  sicily: 'TSC',
  japan: 'JPN',
  mexico: 'MEX',
  brazil: 'BRA',
  argentina: 'ARG',
  peru: 'PEU',
  chile: 'CHL',
  colombia: 'CLM',
  ecuador: 'CLM',
  venezuela: 'VEN',
  bolivia: 'BOL',
  paraguay: 'PRG',
  uruguay: 'URY',
  iran: 'PER',
  persia: 'PER',
  afghanistan: 'AFG',
  thailand: 'SIA',
  cambodia: 'CAM',
  laos: 'LAO',
  vietnam: 'VIE',
  myanmar: 'BUR',
  burma: 'BUR',
  korea: 'KOR',
  'south korea': 'KOR',
  'north korea': 'KOR',
  ethiopia: 'ETH',
  morocco: 'MOR',
  nepal: 'NEP',
  bhutan: 'BHU',
  tunisia: 'OTT',
  libya: 'OTT',
  sudan: 'EGY',
  'south sudan': 'EGY',
  austria: 'AUS',
  prussia: 'PRU',
  'ottoman empire': 'OTT',
  romania: 'OTT',
  serbia: 'OTT',
  poland: 'RUS',
};

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
  const projX = sx + t * dx;
  const projY = sy + t * dy;
  return Math.hypot(px - projX, py - projY);
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
  if (maxDistance <= tolerance || index < 0) {
    return [points[0], points[points.length - 1]];
  }
  const left = simplifyLine(points.slice(0, index + 1), tolerance);
  const right = simplifyLine(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyRing(ring, tolerance) {
  const closed = ensureClosedRing(ring);
  if (closed.length <= 4) return closed;
  const body = closed.slice(0, -1);
  const simplified = simplifyLine(body, tolerance);
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
    return {
      type: 'Polygon',
      coordinates,
    };
  }
  if (geometry.type === 'MultiPolygon') {
    const coordinates = geometry.coordinates
      .map((poly) => poly.map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 4))
      .filter((poly) => poly.length > 0);
    if (coordinates.length === 0) return null;
    return {
      type: 'MultiPolygon',
      coordinates,
    };
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
  if (geometry.type === 'Polygon') {
    return Math.abs(polygonAreaRing(geometry.coordinates[0]));
  }
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
    totalX += cx / (6 * ringArea) * Math.abs(ringArea);
    totalY += cy / (6 * ringArea) * Math.abs(ringArea);
    totalArea += Math.abs(ringArea);
  };

  if (!geometry) return [0, 0];
  if (geometry.type === 'Polygon') {
    addRing(geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) addRing(poly[0]);
  }

  if (totalArea <= 0) return [0, 0];
  return [totalX / totalArea, totalY / totalArea];
}

function geometryBounds(geometry) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visitCoord = (coord) => {
    const [lon, lat] = coord;
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

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  const polys = toPolygons(geometry);
  for (const poly of polys) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
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
  const projX = sx + t * dx;
  const projY = sy + t * dy;
  const vx = px - projX;
  const vy = py - projY;
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
    props.admin
    || props.ADMIN
    || props.adm0_name
    || props.geonunit
    || props.GEOUNIT
    || props.NAME_LONG
    || props.NAME,
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
  if (admin === 'germany') {
    if (lat >= 52.5 && lon < 10.4) return 'HAN';
    if (lon >= 12.4 && lat >= 50.4) return 'SAX';
    if (lat < 49.4 && lon >= 10.2) return 'BAV';
    if (lat < 49.2 && lon < 8.5) return 'BAD';
    if (lat < 49.9 && lon >= 8.5 && lon < 10.2) return 'WUR';
    if (lon >= 8.3 && lon < 10.8 && lat >= 49.6 && lat < 51.9) return 'HES';
    return 'PRU';
  }
  if (admin === 'italy') {
    if (lon >= 9.2 && lat >= 44.8) return 'AUS'; // Lombardy-Venetia under Austria
    if (lat < 40.9) return 'TSC'; // Two Sicilies
    if (lat >= 43.1 && lon >= 9.1 && lon < 10.8) return 'TUS';
    if (lat >= 43.8 && lon >= 10.8 && lon < 11.6) return 'PAR';
    if (lat >= 43.8 && lon >= 11.6 && lon < 12.6) return 'MOD';
    if (lat >= 41.0 && lat < 43.8 && lon >= 11.0 && lon < 14.8) return 'PAP';
    return 'SAR';
  }
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
    admin === 'egypt'
    || admin === 'sudan'
    || admin === 'south sudan'
    || admin === 'syria'
    || admin === 'lebanon'
    || admin === 'israel'
    || admin === 'jordan'
    || admin === 'palestine'
  ) {
    return 'EGY';
  }
  if (admin === 'indonesia') {
    // Keep Dutch control concentrated in Java/Sumatra/Moluccas.
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
    || label.includes('sahara')
    || label.includes('arab')
    || label.includes('desert')
  ) {
    return 'desert';
  }
  if (
    (lat > -12 && lat < 12 && lon > -80 && lon < -45)
    || (lat > -8 && lat < 18 && lon > 10 && lon < 35)
    || (lat > -8 && lat < 18 && lon > 95 && lon < 140)
    || label.includes('amazon')
    || label.includes('congo')
  ) {
    return 'jungle';
  }
  if (
    (lat > 27 && lat < 45 && lon > 65 && lon < 108)
    || (lat > -42 && lat < -18 && lon > -75 && lon < -64)
    || label.includes('alps')
    || label.includes('rocky')
    || label.includes('himal')
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
  if (lon > -12 && lon < 42 && lat > 35 && lat < 60) weight *= 2.05; // Europe
  if (lon > 67 && lon < 93 && lat > 7 && lat < 34) weight *= 2.15; // India
  if (lon > 102 && lon < 124 && lat > 20 && lat < 42) weight *= 2.3; // China core
  if (lon > 126 && lon < 146 && lat > 31 && lat < 43) weight *= 1.7; // Japan/Korea
  if (lon > 90 && lon < 121 && lat > -8 && lat < 24) weight *= 1.45; // SE Asia
  if (Math.abs(lat) > 58) weight *= 0.42;
  if (terrain === 'desert') weight *= 0.4;
  if (terrain === 'mountains') weight *= 0.62;
  if (terrain === 'jungle') weight *= 0.78;
  if (terrain === 'farmland') weight *= 1.25;
  return roundCoord(clamp(weight, 0.18, 3.2));
}

function centerOfCell(lonMin, lonStep, latMin, latStep, col, row) {
  return [
    lonMin + (col + 0.5) * lonStep,
    latMin + (row + 0.5) * latStep,
  ];
}

function cellPolygon(lonMin, lonStep, latMin, latStep, col, row) {
  const west = lonMin + col * lonStep;
  const east = west + lonStep;
  const south = latMin + row * latStep;
  const north = south + latStep;
  return [[
    [roundCoord(west), roundCoord(north)],
    [roundCoord(east), roundCoord(north)],
    [roundCoord(east), roundCoord(south)],
    [roundCoord(west), roundCoord(south)],
    [roundCoord(west), roundCoord(north)],
  ]];
}

function loadNameFromProps(props) {
  return String(
    props.name
    || props.NAME
    || props.name_en
    || props.NAME_EN
    || props.NAME_LONG
    || props.ADMIN
    || props.admin
    || 'Unknown',
  );
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
  );
}

function loadRegionHint(props) {
  return String(
    props.region
    || props.region_un
    || props.REGION_UN
    || props.continent
    || props.CONTINENT
    || '',
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

function buildParentsFromGeojson(geojson, tolerance, keyPrefix = '') {
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
    const stateName = loadNameFromProps(props);
    const adminName = loadAdminNameFromProps(props);
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
      || props.sov_a3
      || props.SOV_A3
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

function proceduralParents() {
  const pseudo = [];
  const continents = [
    { key: 'na', ownerTag: 'USA', stateName: 'North America', bbox: { minLon: -170, minLat: 10, maxLon: -50, maxLat: 72 } },
    { key: 'sa', ownerTag: 'BRA', stateName: 'South America', bbox: { minLon: -84, minLat: -56, maxLon: -33, maxLat: 13 } },
    { key: 'eu', ownerTag: 'PRU', stateName: 'Europe', bbox: { minLon: -12, minLat: 35, maxLon: 45, maxLat: 72 } },
    { key: 'af', ownerTag: 'UNC', stateName: 'Africa', bbox: { minLon: -18, minLat: -35, maxLon: 52, maxLat: 36 } },
    { key: 'as', ownerTag: 'QNG', stateName: 'Asia', bbox: { minLon: 45, minLat: -5, maxLon: 170, maxLat: 76 } },
    { key: 'oc', ownerTag: 'ENG', stateName: 'Oceania', bbox: { minLon: 110, minLat: -48, maxLon: 180, maxLat: -6 } },
  ];

  const ellipse = (lon, lat, cx, cy, rx, ry) => {
    const dx = (lon - cx) / rx;
    const dy = (lat - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  const proceduralLandMask = (lon, lat) => (
    ellipse(lon, lat, -102, 48, 56, 27)
    || ellipse(lon, lat, -86, 19, 20, 12)
    || ellipse(lon, lat, -60, -16, 24, 36)
    || ellipse(lon, lat, 18, 53, 28, 15)
    || ellipse(lon, lat, 24, 8, 30, 37)
    || ellipse(lon, lat, 86, 44, 78, 28)
    || ellipse(lon, lat, 106, 18, 43, 23)
    || ellipse(lon, lat, 134, -26, 22, 15)
    || ellipse(lon, lat, -42, 72, 14, 10)
  );

  for (const c of continents) {
    pseudo.push({
      key: c.key,
      stateName: c.stateName,
      ownerTag: c.ownerTag,
      adminName: c.stateName,
      region: c.stateName,
      bbox: c.bbox,
      area: (c.bbox.maxLon - c.bbox.minLon) * (c.bbox.maxLat - c.bbox.minLat),
      centroid: [(c.bbox.minLon + c.bbox.maxLon) * 0.5, (c.bbox.minLat + c.bbox.maxLat) * 0.5],
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [c.bbox.minLon, c.bbox.maxLat],
          [c.bbox.maxLon, c.bbox.maxLat],
          [c.bbox.maxLon, c.bbox.minLat],
          [c.bbox.minLon, c.bbox.minLat],
          [c.bbox.minLon, c.bbox.maxLat],
        ]],
      },
      proceduralLandMask,
    });
  }
  return pseudo;
}

function isEuropeLike(unit) {
  const region = normalizeName(unit.region || '');
  if (region.includes('europe')) return true;
  const lon = unit.centroid[0];
  const lat = unit.centroid[1];
  return (
    lon >= EUROPE_BOUNDS.minLon
    && lon <= EUROPE_BOUNDS.maxLon
    && lat >= EUROPE_BOUNDS.minLat
    && lat <= EUROPE_BOUNDS.maxLat
  );
}

function splitToPolygonUnits(parents) {
  const units = [];
  for (const parent of parents) {
    const polygons = toPolygons(parent.geometry);
    for (let partIndex = 0; partIndex < polygons.length; partIndex++) {
      const polygon = polygons[partIndex];
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const ring = ensureClosedRing(polygon[0] || []);
      if (ring.length < 4) continue;
      const area = Math.abs(polygonAreaRing(ring));
      if (area <= 1e-10) continue;
      const geometry = { type: 'Polygon', coordinates: [ring, ...polygon.slice(1)] };
      const centroid = geometryCentroid(geometry);
      const bbox = geometryBounds(geometry);
      if (!bbox) continue;
      units.push({
        parentKey: parent.key,
        stateName: parent.stateName,
        ownerTag: parent.ownerTag,
        adminName: parent.adminName,
        region: parent.region,
        countryKey: countryKeyForParent(parent),
        partIndex,
        partitionKey: `${partIndex}`,
        polygons: [geometry.coordinates],
        area,
        centroid,
        bbox,
      });
    }
  }
  return units;
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

function mergeAndDropTinySlivers(units) {
  const byParent = new Map();
  for (const unit of units) {
    const list = byParent.get(unit.parentKey) ?? [];
    list.push({ ...unit });
    byParent.set(unit.parentKey, list);
  }

  const merged = [];
  let mergedSlivers = 0;
  let droppedSlivers = 0;
  for (const [parentKey, group] of byParent.entries()) {
    group.sort((a, b) => b.area - a.area || a.partIndex - b.partIndex);
    const keepMinimum = Math.min(
      group.length,
      Math.max(1, isEuropeLike(group[0]) ? 2 : 1),
    );
    const tinyFloor = isEuropeLike(group[0]) ? SLIVER_ABS_AREA * 0.5 : SLIVER_ABS_AREA;

    const keepers = [];
    const slivers = [];
    group.forEach((unit, index) => {
      if (index < keepMinimum || unit.area >= tinyFloor) keepers.push(unit);
      else slivers.push(unit);
    });

    if (keepers.length === 0) keepers.push(group[0]);

    for (const sliver of slivers) {
      let best = null;
      let bestDistance = Infinity;
      for (const candidate of keepers) {
        const dx = sliver.centroid[0] - candidate.centroid[0];
        const dy = sliver.centroid[1] - candidate.centroid[1];
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      if (!best) {
        droppedSlivers += 1;
        continue;
      }
      best.polygons.push(...sliver.polygons);
      best.area += sliver.area;
      best.centroid = weightedCentroid(best.polygons);
      best.bbox = geometryBounds({
        type: best.polygons.length === 1 ? 'Polygon' : 'MultiPolygon',
        coordinates: best.polygons.length === 1 ? best.polygons[0] : best.polygons,
      });
      mergedSlivers += 1;
    }

    for (const keeper of keepers) {
      keeper.parentKey = parentKey;
      merged.push(keeper);
    }
  }

  merged.sort((a, b) => (
    a.countryKey.localeCompare(b.countryKey)
    || normalizeName(a.stateName).localeCompare(normalizeName(b.stateName))
    || a.parentKey.localeCompare(b.parentKey)
    || String(a.partitionKey || '').localeCompare(String(b.partitionKey || ''))
    || b.area - a.area
    || a.centroid[0] - b.centroid[0]
    || a.centroid[1] - b.centroid[1]
  ));
  return { units: merged, mergedSlivers, droppedSlivers };
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
    if (currentInside && nextInside) {
      output.push(next);
    } else if (currentInside && !nextInside) {
      output.push(intersect(current, next));
    } else if (!currentInside && nextInside) {
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

function rebuildUnitFromPolygons(unit, polygons, partitionKey) {
  const geometry = geometryFromPolygons(polygons);
  const bbox = geometryBounds(geometry);
  if (!bbox) return null;
  return {
    ...unit,
    polygons,
    partitionKey,
    area: Math.max(1e-9, geometryArea(geometry)),
    centroid: weightedCentroid(polygons),
    bbox,
  };
}

function splitUnitOnce(unit) {
  if (!unit.bbox || unit.area < 0.035) return null;
  const width = unit.bbox.maxLon - unit.bbox.minLon;
  const height = unit.bbox.maxLat - unit.bbox.minLat;
  if (Math.max(width, height) < 0.95) return null;
  if ((unit.partitionKey || '').length >= 10) return null;

  const primaryAxis = width >= height ? 'x' : 'y';
  const secondaryAxis = primaryAxis === 'x' ? 'y' : 'x';
  const cuts = [
    { axis: primaryAxis, cut: primaryAxis === 'x' ? unit.centroid[0] : unit.centroid[1] },
    { axis: primaryAxis, cut: primaryAxis === 'x' ? (unit.bbox.minLon + unit.bbox.maxLon) * 0.5 : (unit.bbox.minLat + unit.bbox.maxLat) * 0.5 },
    { axis: secondaryAxis, cut: secondaryAxis === 'x' ? unit.centroid[0] : unit.centroid[1] },
  ];

  for (const attempt of cuts) {
    const lowerPolygons = [];
    const upperPolygons = [];
    for (const polygon of unit.polygons) {
      const outerRing = polygon[0];
      if (!outerRing || outerRing.length < 4) continue;
      const lower = clipRingByAxis(outerRing, attempt.axis, attempt.cut, true);
      const upper = clipRingByAxis(outerRing, attempt.axis, attempt.cut, false);
      if (lower) lowerPolygons.push([lower]);
      if (upper) upperPolygons.push([upper]);
    }
    if (lowerPolygons.length === 0 || upperPolygons.length === 0) continue;
    const lowerUnit = rebuildUnitFromPolygons(unit, lowerPolygons, `${unit.partitionKey}a`);
    const upperUnit = rebuildUnitFromPolygons(unit, upperPolygons, `${unit.partitionKey}b`);
    if (!lowerUnit || !upperUnit) continue;
    const areaRatio = Math.min(lowerUnit.area, upperUnit.area) / Math.max(lowerUnit.area, upperUnit.area);
    if (areaRatio < 0.08) continue;
    return [lowerUnit, upperUnit];
  }
  return null;
}

function unitTerrainAndPopulation(unit) {
  const lon = unit.centroid[0];
  const lat = unit.centroid[1];
  const terrain = terrainForCell(lat, lon, unit.stateName, unit.region);
  const pop = populationWeight(lat, lon, terrain);
  return { terrain, pop };
}

function inSparseSprawlRegion(unit, terrain, pop) {
  const lon = unit.centroid[0];
  const lat = unit.centroid[1];
  if (terrain === 'arctic' || (Math.abs(lat) > 64 && pop < 0.65)) return true;
  const siberia = lon >= 60 && lon <= 180 && lat >= 54;
  const sahara = lon >= -20 && lon <= 35 && lat >= 12 && lat <= 35;
  const outback = lon >= 112 && lon <= 152 && lat >= -36 && lat <= -18;
  const arcticCanada = lon >= -145 && lon <= -55 && lat >= 60;
  return siberia || sahara || outback || arcticCanada;
}

function splitDesirability(unit) {
  const { terrain, pop } = unitTerrainAndPopulation(unit);
  const europeBoost = isEuropeLike(unit) ? 2.5 : 1;
  const sprawlPenalty = inSparseSprawlRegion(unit, terrain, pop) ? 0.45 : 1;
  const areaFactor = Math.sqrt(Math.max(unit.area, 1e-9));
  return pop * areaFactor * europeBoost * sprawlPenalty;
}

function retentionScore(unit) {
  const { terrain, pop } = unitTerrainAndPopulation(unit);
  const europeBoost = isEuropeLike(unit) ? 3.0 : 1;
  const populatedCoastBias = pop >= 1 ? 1.25 : 0.95;
  const harshPenalty = inSparseSprawlRegion(unit, terrain, pop) ? 0.35 : 1;
  return pop * europeBoost * populatedCoastBias * harshPenalty * Math.log1p(Math.max(unit.area, 1e-9));
}

function trimPriority(unit) {
  const { terrain, pop } = unitTerrainAndPopulation(unit);
  const sparseBonus = inSparseSprawlRegion(unit, terrain, pop) ? 2.3 : 1;
  return sparseBonus * (Math.max(unit.area, 1e-9) / Math.max(0.15, pop));
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

function densifyProvinceUnits(units, targetCount) {
  if (units.length >= targetCount) return { units: units.slice().sort(deterministicUnitSort), densifySplits: 0 };
  const working = units.slice().sort(deterministicUnitSort);
  const blocked = new Set();
  let densifySplits = 0;
  while (working.length < targetCount) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < working.length; i++) {
      const unit = working[i];
      const key = `${unit.parentKey}|${unit.partitionKey}`;
      if (blocked.has(key)) continue;
      const score = splitDesirability(unit);
      if (
        score > bestScore
        || (
          Math.abs(score - bestScore) <= 1e-12
          && bestIndex >= 0
          && deterministicUnitSort(unit, working[bestIndex]) < 0
        )
      ) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    const candidate = working[bestIndex];
    const candidateKey = `${candidate.parentKey}|${candidate.partitionKey}`;
    const split = splitUnitOnce(candidate);
    if (!split) {
      blocked.add(candidateKey);
      continue;
    }
    blocked.delete(candidateKey);
    working.splice(bestIndex, 1, split[0], split[1]);
    densifySplits += 1;
    if (densifySplits > 5000) break;
  }
  return { units: working.sort(deterministicUnitSort), densifySplits };
}

function selectProvinceUnits(units) {
  const byCountry = new Map();
  for (const unit of units) {
    const list = byCountry.get(unit.countryKey) ?? [];
    list.push(unit);
    byCountry.set(unit.countryKey, list);
  }

  const guaranteedSet = new Set();
  const pool = [];
  for (const list of byCountry.values()) {
    list.sort((a, b) => retentionScore(b) - retentionScore(a) || deterministicUnitSort(a, b));
    const europeUnits = list.filter((unit) => isEuropeLike(unit));
    const nonEuropeUnits = list.filter((unit) => !isEuropeLike(unit));
    for (const europeUnit of europeUnits) guaranteedSet.add(europeUnit);
    let minKeep = MIN_NON_EUROPE_KEEP_SMALL;
    if (nonEuropeUnits.length >= 8) minKeep = MIN_NON_EUROPE_KEEP_MEDIUM;
    if (nonEuropeUnits.length >= 20) minKeep = MIN_NON_EUROPE_KEEP_LARGE;
    const guaranteedNonEurope = nonEuropeUnits.slice(0, Math.min(minKeep, nonEuropeUnits.length));
    for (const guaranteedUnit of guaranteedNonEurope) guaranteedSet.add(guaranteedUnit);
    pool.push(...nonEuropeUnits.slice(guaranteedNonEurope.length));
  }
  const guaranteed = Array.from(guaranteedSet);

  pool.sort((a, b) => retentionScore(b) - retentionScore(a) || deterministicUnitSort(a, b));
  const selectedSet = new Set(guaranteed);
  for (const unit of pool) {
    if (selectedSet.size >= TARGET_PROVINCES) break;
    selectedSet.add(unit);
  }
  if (selectedSet.size < TARGET_PROVINCES) {
    for (const unit of pool) selectedSet.add(unit);
  }
  const selected = Array.from(selectedSet);

  const finalSet = new Set(selected);
  let toDrop = Math.max(0, selected.length - MAX_PROVINCES);
  const nonEuropeSelected = selected
    .filter((unit) => !isEuropeLike(unit))
    .sort((a, b) => trimPriority(b) - trimPriority(a) || deterministicUnitSort(a, b));
  for (const unit of nonEuropeSelected) {
    if (toDrop <= 0) break;
    if (!finalSet.has(unit)) continue;
    finalSet.delete(unit);
    toDrop -= 1;
  }
  if (toDrop > 0) {
    const europeFallback = selected
      .filter((unit) => isEuropeLike(unit))
      .sort((a, b) => retentionScore(a) - retentionScore(b) || deterministicUnitSort(a, b));
    for (const unit of europeFallback) {
      if (toDrop <= 0) break;
      if (!finalSet.has(unit)) continue;
      finalSet.delete(unit);
      toDrop -= 1;
    }
  }

  const finalUnits = Array.from(finalSet).sort(deterministicUnitSort);
  return {
    units: finalUnits,
    droppedForCap: units.length - finalUnits.length,
    europeBefore: units.filter((unit) => isEuropeLike(unit)).length,
    europeAfter: finalUnits.filter((unit) => isEuropeLike(unit)).length,
  };
}

function geometryFromPolygons(polygons) {
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
  return { type: 'MultiPolygon', coordinates: polygons };
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
  return {
    id,
    name: '',
    ownerTag: historicalOwnerOverride(unit.ownerTag, lon, lat, unit.adminName, unit.stateName),
    stateId: -1,
    stateName: unit.stateName,
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
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        pairs.add(key);
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
        geometry: {
          type: 'MultiLineString',
          coordinates,
        },
      }]
      : [],
  };
}

function computeCoastalFlags(provinces) {
  const edgeUse = new Map();
  for (const province of provinces) {
    for (const segment of province.segments) {
      const key = edgeKey(segment.start, segment.end, 220);
      const count = edgeUse.get(key) ?? 0;
      edgeUse.set(key, count + 1);
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
  const perStateCounter = new Map();

  const orderedUnits = units.slice().sort(deterministicUnitSort);

  for (const unit of orderedUnits) {
    let stateId = stateKeyToId.get(unit.parentKey);
    if (stateId === undefined) {
      stateId = stateRecords.length;
      stateKeyToId.set(unit.parentKey, stateId);
      stateRecords.push({
        id: stateId,
        key: unit.parentKey,
        name: unit.stateName,
        ownerTag: unit.ownerTag,
        provinceIds: [],
      });
    }
    const serial = (perStateCounter.get(unit.parentKey) ?? 0) + 1;
    perStateCounter.set(unit.parentKey, serial);
    const province = makeProvinceGeometryRecord(unit, provinceRecords.length);
    province.stateId = stateId;
    province.name = `${unit.stateName} ${serial}`;
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

function buildNations(provinces) {
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
    });
  }
  return nations;
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

  console.error('[build-map] LIVE GEOMETRY FETCH FAILED. Generating procedural fallback map over approximate coastline.');
  return { json: null, source: 'procedural-fallback', fallback: true, filename: null };
}

async function loadAdmin0Geojson() {
  const loaded = await tryReadRaw(ADMIN0_FILE);
  if (!loaded) return null;
  return { json: loaded.json, source: `raw:${ADMIN0_FILE}` };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const loaded = await loadSourceGeojson();
  const sourceTolerance = loaded.filename?.includes('110m') ? 0.2 : 0.08;

  let parents = loaded.json
    ? buildParentsFromGeojson(loaded.json, sourceTolerance)
    : proceduralParents();

  if (loaded.json) {
    const countriesCovered = new Set(parents.map((parent) => normalizeName(parent.adminName)));
    if (countriesCovered.size < ADMIN0_FALLBACK_COUNTRY_FLOOR) {
      const admin0 = await loadAdmin0Geojson();
      if (admin0?.json) {
        const admin0Parents = buildParentsFromGeojson(admin0.json, 0.24, 'ADM0-')
          .filter((parent) => !countriesCovered.has(normalizeName(parent.adminName)))
          .map((parent) => ({ ...parent, stateName: parent.adminName }));
        parents = [...parents, ...admin0Parents].sort(deterministicParentSort);
        console.log(`[build-map] Admin-0 fallback appended: ${admin0Parents.length} parents from ${admin0.source}`);
      } else {
        console.warn('[build-map] Admin-0 fallback unavailable; continuing with sparse admin-1 geometry only.');
      }
    }
  }

  if (parents.length === 0) {
    throw new Error('No valid parent geometries available for province generation.');
  }

  const explodedUnits = splitToPolygonUnits(parents);
  const sliverResult = mergeAndDropTinySlivers(explodedUnits);
  const densifiedResult = densifyProvinceUnits(sliverResult.units, DENSIFY_TARGET_PROVINCES);
  const selectedResult = selectProvinceUnits(densifiedResult.units);
  const { provinceRecords, stateRecords, bridgedIslands } = buildProvinceRecords(selectedResult.units);

  if (provinceRecords.length < MIN_PROVINCES || provinceRecords.length > MAX_PROVINCES) {
    throw new Error(
      `Generated province count ${provinceRecords.length} outside hard acceptance [${MIN_PROVINCES}, ${MAX_PROVINCES}].`,
    );
  }

  const nations = buildNations(provinceRecords);
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
  };

  await writeFile(path.join(OUT_DIR, 'provinces.geo.json'), `${JSON.stringify(geojson)}\n`, 'utf8');
  await writeFile(path.join(OUT_DIR, 'nationalBorders.geo.json'), `${JSON.stringify(nationalBorders)}\n`, 'utf8');
  await writeFile(path.join(OUT_DIR, 'worldSeed.json'), `${JSON.stringify(worldSeed)}\n`, 'utf8');

  const geoGzipBytes = gzipSync(JSON.stringify(geojson)).length;
  console.log(`[build-map] Source: ${loaded.source}`);
  console.log(`[build-map] Parents loaded: ${parents.length}`);
  console.log(`[build-map] Polygon parts exploded: ${explodedUnits.length}`);
  console.log(`[build-map] Slivers merged: ${sliverResult.mergedSlivers}`);
  console.log(`[build-map] Slivers dropped: ${sliverResult.droppedSlivers}`);
  console.log(`[build-map] Densify splits applied: ${densifiedResult.densifySplits}`);
  console.log(`[build-map] Europe-like units before select: ${selectedResult.europeBefore}`);
  console.log(`[build-map] Europe-like units after select: ${selectedResult.europeAfter}`);
  console.log(`[build-map] Dropped for cap/target: ${selectedResult.droppedForCap}`);
  console.log(`[build-map] Island nearest-neighbor bridges: ${bridgedIslands}`);
  console.log(`[build-map] Provinces generated: ${provinceRecords.length}`);
  console.log(`[build-map] National border segments: ${nationalBorderSegments}`);
  console.log(`[build-map] provinces.geo.json gzip bytes: ${geoGzipBytes}`);
}

main().catch((error) => {
  console.error(`[build-map] Failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
