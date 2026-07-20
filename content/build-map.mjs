import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'content', 'raw');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'generated');

const SOURCE_URLS = [
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_1_states_provinces.geojson',
];
const ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const TARGET_PROVINCES = 1100;
const MIN_PROVINCES = 800;
const MAX_PROVINCES = 1200;

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
  JPN: { name: 'Tokugawa Shogunate', color: [146, 132, 112], government: 'uncivilized', primaryCulture: 'han' },
  MEX: { name: 'Mexico', color: [146, 118, 96], government: 'presidential_dictatorship', primaryCulture: 'yankee' },
  BRA: { name: 'Brazil', color: [128, 148, 102], government: 'constitutional_monarchy', primaryCulture: 'french' },
  ARG: { name: 'Argentina', color: [150, 154, 186], government: 'presidential_dictatorship', primaryCulture: 'french' },
  PER: { name: 'Peru', color: [162, 126, 102], government: 'presidential_dictatorship', primaryCulture: 'french' },
  COL: { name: 'Colonial Territories', color: [162, 150, 132], government: 'uncivilized', primaryCulture: 'british' },
  UNC: { name: 'Uncivilized Regions', color: [136, 128, 112], government: 'uncivilized', primaryCulture: 'han' },
  UNA: { name: 'Unclaimed Frontier', color: [108, 104, 98], government: 'uncivilized', primaryCulture: 'han' },
};

const MAJOR_TAGS = ['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'QNG', 'OTT', 'ESP', 'POR', 'NLD', 'SWE', 'SAR', 'TSC'];

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
  nigeria: 'ENG',
  egypt: 'ENG',
  france: 'FRA',
  belgium: 'FRA',
  algeria: 'FRA',
  germany: 'PRU',
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
  syria: 'OTT',
  iraq: 'OTT',
  jordan: 'OTT',
  lebanon: 'OTT',
  israel: 'OTT',
  saudi: 'OTT',
  greece: 'OTT',
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
  peru: 'PER',
  austria: 'AUS',
  prussia: 'PRU',
  'ottoman empire': 'OTT',
  iran: 'OTT',
  afghanistan: 'OTT',
  thailand: 'UNC',
  vietnam: 'UNC',
  korea: 'QNG',
  ethiopia: 'UNC',
  morocco: 'UNC',
  tunisia: 'OTT',
  libya: 'OTT',
  sudan: 'OTT',
  chile: 'COL',
  colombia: 'COL',
  venezuela: 'COL',
  bolivia: 'COL',
  paraguay: 'COL',
  uruguay: 'COL',
  romania: 'OTT',
  greece: 'OTT',
  serbia: 'OTT',
  poland: 'RUS',
  denmark: 'PRU',
};

const GRID_CONFIGS = [
  { lonStep: 5, latStep: 3 },
  { lonStep: 4.5, latStep: 2.75 },
  { lonStep: 4, latStep: 2.5 },
  { lonStep: 4, latStep: 2.25 },
  { lonStep: 3.5, latStep: 2.2 },
  { lonStep: 6, latStep: 3.2 },
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
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, tolerance)),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => poly.map((ring) => simplifyRing(ring, tolerance))),
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
  const iso = normalizeName(props.iso_a2 || props.adm0_a3 || props.ADM0_A3 || '');
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

function historicalOwnerOverride(baseTag, lon, lat, adminName) {
  const admin = normalizeName(adminName);
  if (admin === 'italy') return lat < 42 ? 'TSC' : 'SAR';
  if (admin === 'germany') return lon < 11 ? 'PRU' : 'AUS';
  if (admin === 'switzerland') return 'AUS';
  if (admin === 'norway') return 'SWE';
  if (admin === 'romania' || admin === 'bulgaria' || admin === 'serbia') return 'OTT';
  if (admin === 'algeria') return 'FRA';
  if (admin === 'egypt' && lon < 30) return 'OTT';
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

function buildParentsFromGeojson(geojson, tolerance) {
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
    const stateName = String(props.name || props.NAME || props.NAME_LONG || props.name_en || `State ${i + 1}`);
    const ownerTag = ownerTagForFeature(props);
    parents.push({
      key: String(props.adm1_code || props.iso_3166_2 || `${props.adm0_a3 || 'UNK'}-${stateName}`),
      stateName,
      ownerTag,
      adminName: String(props.admin || props.ADMIN || props.geonunit || props.GEOUNIT || props.NAME || 'Unknown'),
      region: String(props.region || props.region_un || props.continent || props.REGION_UN || ''),
      bbox,
      area,
      centroid,
      geometry: simplified,
    });
  }
  return parents.sort((a, b) => a.area - b.area);
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

function pickOwnerTagFromCoords(lon, lat) {
  if (lon > -12 && lon < 42 && lat > 35 && lat < 60) return 'PRU';
  if (lon > 65 && lon < 95 && lat > 7 && lat < 34) return 'ENG';
  if (lon > 100 && lon < 125 && lat > 20 && lat < 45) return 'QNG';
  if (lon > -140 && lon < -60 && lat > 25 && lat < 56) return 'USA';
  if (lon > -75 && lon < -30 && lat > -35 && lat < 8) return 'BRA';
  if (lon > -20 && lon < 55 && lat > -32 && lat < 34) return 'UNC';
  if (lon > 95 && lon < 180 && lat < 0) return 'ENG';
  return 'COL';
}

function assignCellParent(parents, point) {
  const [lon, lat] = point;
  for (const parent of parents) {
    const { bbox } = parent;
    if (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat) continue;
    if (parent.proceduralLandMask) {
      if (parent.proceduralLandMask(lon, lat)) return parent;
      continue;
    }
    if (pointInGeometry(point, parent.geometry)) return parent;
  }
  return null;
}

function rasterize(parents, cfg) {
  const lonMin = -180;
  const lonMax = 180;
  const latMin = -60;
  const latMax = 84;
  const cols = Math.floor((lonMax - lonMin) / cfg.lonStep);
  const rows = Math.floor((latMax - latMin) / cfg.latStep);
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const center = centerOfCell(lonMin, cfg.lonStep, latMin, cfg.latStep, col, row);
      const parent = assignCellParent(parents, center);
      if (!parent) continue;
      cells.push({
        col,
        row,
        centerLon: roundCoord(center[0]),
        centerLat: roundCoord(center[1]),
        parent,
      });
    }
  }
  return { cells, lonMin, latMin, cols, rows };
}

function chooseRasterConfig(parents) {
  let best = null;
  for (const cfg of GRID_CONFIGS) {
    const candidate = rasterize(parents, cfg);
    const count = candidate.cells.length;
    const inRange = count >= MIN_PROVINCES && count <= MAX_PROVINCES;
    const distance = Math.abs(count - TARGET_PROVINCES);
    if (!best || (inRange && !best.inRange) || (inRange === best.inRange && distance < best.distance)) {
      best = { cfg, count, inRange, distance, candidate };
    }
  }
  return best;
}

function buildProvinceRecords(raster, cfg) {
  const cellByKey = new Map();
  for (const cell of raster.cells) {
    cellByKey.set(`${cell.col},${cell.row}`, cell);
  }

  let selected = raster.cells.slice();
  let droppedForCap = 0;
  if (selected.length > MAX_PROVINCES) {
    selected.sort((a, b) => a.parent.area - b.parent.area);
    droppedForCap = selected.length - MAX_PROVINCES;
    selected = selected.slice(droppedForCap);
  }

  const selectedByKey = new Map();
  for (const cell of selected) selectedByKey.set(`${cell.col},${cell.row}`, cell);

  const stateKeyToId = new Map();
  const stateRecords = [];
  const provinceRecords = [];
  const perStateCounter = new Map();

  selected.sort((a, b) => a.row - b.row || a.col - b.col);
  for (const cell of selected) {
    const stateKey = cell.parent.key;
    let stateId = stateKeyToId.get(stateKey);
    if (stateId === undefined) {
      stateId = stateRecords.length;
      stateKeyToId.set(stateKey, stateId);
      stateRecords.push({
        id: stateId,
        key: stateKey,
        name: cell.parent.stateName,
        ownerTag: cell.parent.ownerTag,
        provinceIds: [],
      });
    }

    const serial = (perStateCounter.get(stateKey) ?? 0) + 1;
    perStateCounter.set(stateKey, serial);
    const provinceName = `${cell.parent.stateName} ${serial}`;
    const terrain = terrainForCell(cell.centerLat, cell.centerLon, cell.parent.stateName, cell.parent.region);
    provinceRecords.push({
      id: provinceRecords.length,
      name: provinceName,
      ownerTag: historicalOwnerOverride(
        cell.parent.ownerTag || pickOwnerTagFromCoords(cell.centerLon, cell.centerLat),
        cell.centerLon,
        cell.centerLat,
        cell.parent.adminName,
      ),
      stateId,
      stateName: cell.parent.stateName,
      terrain,
      coastal: false,
      rgoGood: rgoForTerrain(terrain, cell.centerLat, cell.centerLon, cell.parent.key),
      neighbors: [],
      lon: cell.centerLon,
      lat: cell.centerLat,
      populationWeight: populationWeight(cell.centerLat, cell.centerLon, terrain),
      col: cell.col,
      row: cell.row,
      polygon: cellPolygon(raster.lonMin, cfg.lonStep, raster.latMin, cfg.latStep, cell.col, cell.row),
    });
    stateRecords[stateId].provinceIds.push(provinceRecords.length - 1);
  }

  const idByCellKey = new Map();
  for (const province of provinceRecords) idByCellKey.set(`${province.col},${province.row}`, province.id);

  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  for (const province of provinceRecords) {
    const neighbors = [];
    let coastal = false;
    for (const [dx, dy] of offsets) {
      const neighborId = idByCellKey.get(`${province.col + dx},${province.row + dy}`);
      if (neighborId === undefined) {
        coastal = true;
        continue;
      }
      neighbors.push(neighborId);
    }
    province.neighbors = neighbors.sort((a, b) => a - b);
    province.coastal = coastal;
  }

  // Ensure no disconnected single-cell islands violate the >=1 neighbor invariant.
  for (const province of provinceRecords) {
    if (province.neighbors.length > 0) continue;
    let bestId = -1;
    let bestDistance = Infinity;
    for (const other of provinceRecords) {
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
      const back = provinceRecords[bestId].neighbors;
      if (!back.includes(province.id)) back.push(province.id);
      province.coastal = true;
    }
  }

  for (const province of provinceRecords) province.neighbors.sort((a, b) => a - b);
  return { provinceRecords, stateRecords, droppedForCap };
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
      geometry: {
        type: 'Polygon',
        coordinates: province.polygon,
      },
    })),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSourceGeojson() {
  await mkdir(RAW_DIR, { recursive: true });

  for (const url of SOURCE_URLS) {
    try {
      const json = await fetchJson(url);
      const filename = path.basename(url);
      await writeFile(path.join(RAW_DIR, filename), `${JSON.stringify(json)}\n`, 'utf8');
      return { json, source: url, fallback: false };
    } catch (error) {
      console.warn(`[build-map] Failed to fetch ${url}: ${error.message}`);
    }
  }

  for (const url of SOURCE_URLS) {
    const filename = path.basename(url);
    const localPath = path.join(RAW_DIR, filename);
    try {
      const payload = await readFile(localPath, 'utf8');
      const json = JSON.parse(payload);
      console.warn(`[build-map] Using cached raw map from ${localPath}`);
      return { json, source: `cached:${filename}`, fallback: true };
    } catch {
      // keep trying
    }
  }

  console.error('[build-map] LIVE GEOMETRY FETCH FAILED. Generating procedural fallback map over approximate coastline.');
  return { json: null, source: 'procedural-fallback', fallback: true };
}

async function loadAdmin0Geojson() {
  const filename = path.basename(ADMIN0_URL);
  try {
    const json = await fetchJson(ADMIN0_URL);
    await writeFile(path.join(RAW_DIR, filename), `${JSON.stringify(json)}\n`, 'utf8');
    return { json, source: ADMIN0_URL };
  } catch (error) {
    console.warn(`[build-map] Failed to fetch admin-0 fallback ${ADMIN0_URL}: ${error.message}`);
  }

  try {
    const payload = await readFile(path.join(RAW_DIR, filename), 'utf8');
    return { json: JSON.parse(payload), source: `cached:${filename}` };
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const loaded = await loadSourceGeojson();
  const sourceTolerance = loaded.source.includes('110m') ? 0.25 : 0.12;

  let parents = loaded.json
    ? buildParentsFromGeojson(loaded.json, sourceTolerance)
    : proceduralParents();

  if (loaded.json) {
    const countriesCovered = new Set(parents.map((parent) => normalizeName(parent.adminName)));
    if (countriesCovered.size < 30) {
      const admin0 = await loadAdmin0Geojson();
      if (admin0?.json) {
        const admin0Parents = buildParentsFromGeojson(admin0.json, 0.28)
          .filter((parent) => !countriesCovered.has(normalizeName(parent.adminName)))
          .map((parent) => ({
            ...parent,
            key: `ADM0-${parent.key}`,
            stateName: parent.adminName,
          }));
        parents = [...parents, ...admin0Parents].sort((a, b) => a.area - b.area);
        console.log(`[build-map] Admin-0 fallback appended: ${admin0Parents.length} parents from ${admin0.source}`);
      } else {
        console.warn('[build-map] Admin-0 fallback unavailable; continuing with sparse admin-1 geometry only.');
      }
    }
  }

  if (parents.length === 0) {
    throw new Error('No valid parent geometries available for province generation.');
  }

  const chosen = chooseRasterConfig(parents);
  if (!chosen) throw new Error('Failed to rasterize province map from source geometry.');

  const { provinceRecords, stateRecords, droppedForCap } = buildProvinceRecords(chosen.candidate, chosen.cfg);
  if (provinceRecords.length < MIN_PROVINCES || provinceRecords.length > 1500) {
    throw new Error(
      `Generated province count ${provinceRecords.length} outside hard acceptance [${MIN_PROVINCES}, 1500].`,
    );
  }

  const nations = buildNations(provinceRecords);
  const geojson = compactGeojson(provinceRecords);

  const worldSeed = {
    source: loaded.source,
    generatedAt: new Date().toISOString(),
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
  await writeFile(path.join(OUT_DIR, 'worldSeed.json'), `${JSON.stringify(worldSeed)}\n`, 'utf8');

  console.log(`[build-map] Source: ${loaded.source}`);
  console.log(`[build-map] Parents loaded: ${parents.length}`);
  console.log(`[build-map] Grid chosen: lonStep=${chosen.cfg.lonStep}, latStep=${chosen.cfg.latStep}`);
  console.log(`[build-map] Provinces generated: ${provinceRecords.length}`);
  console.log(`[build-map] Sliver cells dropped for cap: ${droppedForCap}`);
}

main().catch((error) => {
  console.error(`[build-map] Failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
