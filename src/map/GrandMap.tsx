import { useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './GrandMap.css';
import { WORLD_SEED } from '../data/generated';
import { useStore } from '../store';
import { largestPolygon, polylabel, ringArea } from './polylabel';
import { nationShieldSvg } from '../ui/nationShield';
import {
  COAST_GLOW,
  COAST_INK,
  GRATICULE_INK,
  LAND_PAPER,
  LAND_SHADOW,
  NATION_BORDER_BAND,
  NATION_BORDER_INK,
  OCEAN_LABELS,
  PROVINCE_BORDER_INK,
  SEA_BASE,
  TERRAIN_BIOME_COLORS,
  TERRAIN_TINTS,
  TERRAIN_TINT_STRENGTH,
  WATERLINE_INK,
  createAquatintTile,
  createFoliageTile,
  createGraticule,
  createHachureTile,
  createReliefTile,
  createSeaEngravingTile,
  createStippleTile,
  mixHex,
} from './mapDecor';
import { createSealElement, createUnitCounterElement } from './mapCounters';

type MapLibreMap = import('maplibre-gl').Map;
type MapLibreMarker = import('maplibre-gl').Marker;
type ProvinceGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    properties: { id: number; n: string };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
};
type NationalBorderGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { id: number };
    geometry: {
      type: 'MultiLineString';
      coordinates: number[][][];
    };
  }>;
};
type ProvinceGeometryMetrics = {
  lon: number;
  lat: number;
  area: number;
  /** Pole-of-inaccessibility on the province's largest polygon. */
  labelLon: number;
  labelLat: number;
};
type ProvinceLabelSeed = {
  id: number;
  name: string;
  ownerTag: string;
  lon: number;
  lat: number;
  weight: number;
  area: number;
  capital?: boolean;
  prominence: number;
  minZoom: number;
};

type CountryLabelSeed = {
  tag: string;
  name: string;
  color: [number, number, number];
  lon: number;
  lat: number;
  provinceCount: number;
  area: number;
  populationWeight: number;
  prominence: number;
  minZoom: number;
  major: boolean;
};
type ScreenBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const MAP_SOURCE_ID = 'provinces';
const MAP_NATIONAL_SOURCE_ID = 'national-borders';
const MAP_GRATICULE_SOURCE_ID = 'sea-graticule';
const MAP_FILL_LAYER = 'province-fill';
const MAP_OCCUPATION_LAYER = 'province-occupation';
const MAP_PROVINCE_LINE_LAYER = 'province-line';
const MAP_NATIONAL_LINE_LAYER = 'nation-line';
const MAP_NATIONAL_BAND_LAYER = 'nation-band';
const MAP_HOVER_LAYER = 'province-hover';
const MAP_HOVER_GLOW_LAYER = 'province-hover-glow';
const MAP_HOVER_LIFT_LAYER = 'province-hover-lift';
const MAP_GRATICULE_LAYER = 'sea-graticule-lines';
const MAP_SEA_PATTERN_LAYER = 'sea-engraving';
const MAP_SEA_PATTERN_IMAGE = 'sea-engraving-tile';
const MAP_COAST_GLOW_LAYER = 'coast-glow';
const MAP_COAST_WATERLINE_1_LAYER = 'coast-waterline-1';
const MAP_COAST_WATERLINE_2_LAYER = 'coast-waterline-2';
const MAP_COASTLINE_INK_LAYER = 'coastline-ink';
const MAP_LAND_SHADOW_LAYER = 'land-shadow';
const MAP_LAND_UNDERLAY_LAYER = 'land-underlay';
const MAP_HACHURE_LAYER = 'terrain-hachure';
const MAP_HACHURE_IMAGE = 'terrain-hachure-tile';
const MAP_STIPPLE_LAYER = 'terrain-stipple';
const MAP_STIPPLE_IMAGE = 'terrain-stipple-tile';
const MAP_FOLIAGE_LAYER = 'terrain-foliage';
const MAP_FOLIAGE_IMAGE = 'terrain-foliage-tile';
const MAP_INNER_SHADE_LAYER = 'province-inner-shade';
const MAP_MOVEMENT_SOURCE = 'movement-lines';
const MAP_MOVEMENT_LAYER = 'movement-lines-layer';
const MAP_FILL_FADE_LAYER = 'province-fill-fade';
const MAP_RELIEF_LAYER = 'terrain-relief';
const MAP_RELIEF_IMAGE = 'terrain-relief-tile';
const MAP_RELIEF_SHADE_LAYER = 'terrain-relief-shade';
const MAP_RELIEF_LIGHT_LAYER = 'terrain-relief-light';
const MAP_AQUATINT_LAYER = 'land-aquatint';
const MAP_AQUATINT_IMAGE = 'land-aquatint-tile';
const MAP_PLAYER_HALO_LAYER = 'player-border-halo';
// V6: Natural Earth water plate — engraved rivers + lakes on the land mass.
const MAP_RIVERS_SOURCE_ID = 'ne-rivers';
const MAP_LAKES_SOURCE_ID = 'ne-lakes';
const MAP_LAKES_FILL_LAYER = 'ne-lakes-fill';
const MAP_LAKES_LINE_LAYER = 'ne-lakes-shore';
const MAP_RIVERS_LAYER = 'ne-rivers-ink';
const RIVER_INK = '#4a5866';
const LAKE_FILL = '#a9b7c0';
const LAKE_SHORE = '#3d4a55';
/** Duration of the mapmode cross-fade dissolve (GPU paint transition). */
const MODE_FADE_MS = 380;
/** Mapmodes where the terrain wash blends into the fills. */
const TERRAIN_TINTED_MODES = new Set(['political', 'military', 'cores']);
const DEFAULT_FILL = '#b7a486';
const MAJOR_LABEL_TAGS = new Set(['ENG', 'FRA', 'AUS', 'RUS', 'USA', 'QNG', 'OTT', 'ESP', 'BRA']);
/** Prefer homeland landmasses over sparse colonial deserts when scoring. */
const HOMELAND_PROVINCE_BY_TAG: Record<string, string> = {
  ENG: 'United Kingdom',
  FRA: 'France',
  ESP: 'Spain',
  POR: 'Portugal',
  NED: 'Netherlands',
  AUS: 'Austria',
  OTT: 'Turkey',
};
const LABEL_REFRESH_DEBOUNCE_MS = 60;
const DIPLO_COLORS = {
  self: '#6f879f',
  ally: '#7c9472',
  sphere: '#6f8f7f',
  rival: '#8a5f46',
  atWar: '#8e5a52',
  neutral: '#b5a27f',
};
const IDEOLOGY_COLORS: Record<string, string> = {
  reactionary: '#5f4a3a',
  conservative: '#6a5f4b',
  liberal: '#4f6e8f',
  socialist: '#8c4f55',
  communist: '#7b3537',
  fascist: '#352926',
};

function toHexColor(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((value) => Math.max(0, Math.min(255, Math.round(value)))) as [number, number, number];
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function muteColor(rgb: [number, number, number]): string {
  // Richer nation fills for the engraved plate: only a 10% parchment wash
  // keeps pigments deep enough to read against the terrain tinting.
  const parchment: [number, number, number] = [232, 220, 192];
  const mixed: [number, number, number] = [
    parchment[0] * 0.10 + rgb[0] * 0.90,
    parchment[1] * 0.10 + rgb[1] * 0.90,
    parchment[2] * 0.10 + rgb[2] * 0.90,
  ];
  return toHexColor(mixed);
}

/** Province ids per engraved terrain pattern (static world data). */
const MOUNTAIN_PROVINCE_IDS = WORLD_SEED.provinces
  .filter((province) => province.terrain === 'mountains')
  .map((province) => province.id);
const DESERT_PROVINCE_IDS = WORLD_SEED.provinces
  .filter((province) => province.terrain === 'desert')
  .map((province) => province.id);
const FOREST_PROVINCE_IDS = WORLD_SEED.provinces
  .filter((province) => province.terrain === 'forest' || province.terrain === 'jungle')
  .map((province) => province.id);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function blend(hex: string, amount: number): string {
  const clamped = clamp01(amount);
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const paper = [232, 220, 192];
  const mixed = [
    red * (1 - clamped) + paper[0] * clamped,
    green * (1 - clamped) + paper[1] * clamped,
    blue * (1 - clamped) + paper[2] * clamped,
  ] as [number, number, number];
  return toHexColor(mixed);
}

function bearingDegrees(from: { lon: number; lat: number }, to: { lon: number; lat: number }): number {
  const deltaLon = to.lon - from.lon;
  const deltaLat = to.lat - from.lat;
  return Math.atan2(deltaLat, deltaLon) * (180 / Math.PI);
}

function computeBounds(geojson: ProvinceGeoJson) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const feature of geojson.features) {
    const walk = (node: unknown): void => {
      if (!Array.isArray(node) || node.length === 0) return;
      if (typeof node[0] === 'number' && typeof node[1] === 'number') {
        const lon = node[0];
        const lat = node[1];
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        return;
      }
      for (const child of node) walk(child);
    };
    walk(feature.geometry.coordinates);
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }
  return [[minLon, minLat], [maxLon, maxLat]] as [[number, number], [number, number]];
}

function signedRingAreaCentroid(ring: number[][]): { area: number; lon: number; lat: number } | null {
  if (ring.length < 4) return null;
  let twiceArea = 0;
  let lonAcc = 0;
  let latAcc = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index] ?? [];
    const [x2, y2] = ring[index + 1] ?? [];
    if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) continue;
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    lonAcc += (x1 + x2) * cross;
    latAcc += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) return null;
  return {
    area: twiceArea / 2,
    lon: lonAcc / (3 * twiceArea),
    lat: latAcc / (3 * twiceArea),
  };
}

function polygonAreaCentroid(polygon: number[][][]): ProvinceGeometryMetrics | null {
  let areaAcc = 0;
  let lonAcc = 0;
  let latAcc = 0;
  for (const ring of polygon) {
    const ringStats = signedRingAreaCentroid(ring);
    if (!ringStats) continue;
    areaAcc += ringStats.area;
    lonAcc += ringStats.lon * ringStats.area;
    latAcc += ringStats.lat * ringStats.area;
  }
  const largest = polygon[0] ? [polygon[0], ...polygon.slice(1)] : null;
  const pole = largest && largest[0] && largest[0].length >= 4
    ? polylabel(largest as [number, number][][], 0.02)
    : null;
  if (Math.abs(areaAcc) > 1e-8) {
    return {
      lon: lonAcc / areaAcc,
      lat: latAcc / areaAcc,
      area: Math.abs(areaAcc),
      labelLon: pole?.lon ?? lonAcc / areaAcc,
      labelLat: pole?.lat ?? latAcc / areaAcc,
    };
  }
  const outerRing = polygon[0] ?? [];
  if (outerRing.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of outerRing) {
    lon += x;
    lat += y;
  }
  return {
    lon: lon / outerRing.length,
    lat: lat / outerRing.length,
    area: 0.01,
    labelLon: pole?.lon ?? lon / outerRing.length,
    labelLat: pole?.lat ?? lat / outerRing.length,
  };
}

function geometryAreaCentroid(
  geometry: ProvinceGeoJson['features'][number]['geometry'],
): ProvinceGeometryMetrics | null {
  const bestPoly = largestPolygon(geometry);
  const pole = bestPoly ? polylabel(bestPoly, 0.02) : null;
  if (geometry.type === 'Polygon') {
    const stats = polygonAreaCentroid(geometry.coordinates as number[][][]);
    if (!stats) return null;
    return {
      ...stats,
      labelLon: pole?.lon ?? stats.labelLon,
      labelLat: pole?.lat ?? stats.labelLat,
      area: bestPoly?.[0] ? Math.max(stats.area, ringArea(bestPoly[0])) : stats.area,
    };
  }
  let areaAcc = 0;
  let lonAcc = 0;
  let latAcc = 0;
  for (const polygon of geometry.coordinates as number[][][][]) {
    const stats = polygonAreaCentroid(polygon);
    if (!stats) continue;
    areaAcc += stats.area;
    lonAcc += stats.lon * stats.area;
    latAcc += stats.lat * stats.area;
  }
  if (areaAcc <= 0) return null;
  return {
    lon: lonAcc / areaAcc,
    lat: latAcc / areaAcc,
    area: areaAcc,
    labelLon: pole?.lon ?? lonAcc / areaAcc,
    labelLat: pole?.lat ?? latAcc / areaAcc,
  };
}

function normalizeAcrossRange(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) return 1;
  return clamp01((value - minValue) / (maxValue - minValue));
}

function intersects(a: ScreenBox, b: ScreenBox): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function makeScreenBox(centerX: number, centerY: number, width: number, height: number, padding: number): ScreenBox {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    left: centerX - halfWidth - padding,
    right: centerX + halfWidth + padding,
    top: centerY - halfHeight - padding,
    bottom: centerY + halfHeight + padding,
  };
}

function insideViewport(box: ScreenBox, width: number, height: number, padding: number): boolean {
  return box.right >= -padding && box.left <= width + padding && box.bottom >= -padding && box.top <= height + padding;
}

export function GrandMap() {
  const snapshot = useStore((state) => state.snapshot);
  const mapMode = useStore((state) => state.mapMode);
  const selectProvince = useStore((state) => state.selectProvince);
  const selectedArmy = useStore((state) => state.selectedArmy);
  const selectedFleet = useStore((state) => state.selectedFleet);
  const setSelectedArmy = useStore((state) => state.setSelectedArmy);
  const setSelectedFleet = useStore((state) => state.setSelectedFleet);
  const openPanelId = useStore((state) => state.openPanelId);
  const sendCommand = useStore((state) => state.sendCommand);
  const selectedProvince = useStore((state) => state.selectedProvince);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<any>(null);
  const hoveredRef = useRef<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const selectedArmyRef = useRef<number | null>(selectedArmy);
  const selectedFleetRef = useRef<number | null>(selectedFleet);
  const fillRef = useRef<Map<number, string>>(new globalThis.Map());
  const occupationRef = useRef<Map<number, string>>(new globalThis.Map());
  const prevMapModeRef = useRef<string | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const markerRef = useRef<Map<string, MapLibreMarker>>(new globalThis.Map());
  const markerSigRef = useRef<Map<string, string>>(new globalThis.Map());
  const countryLabelMarkerRef = useRef<Map<string, MapLibreMarker>>(new globalThis.Map());
  const provinceLabelMarkerRef = useRef<Map<number, MapLibreMarker>>(new globalThis.Map());
  const [geojson, setGeojson] = useState<ProvinceGeoJson | null>(null);
  const [nationalBorders, setNationalBorders] = useState<NationalBorderGeoJson | null>(null);
  const [rivers, setRivers] = useState<object | null>(null);
  const [lakes, setLakes] = useState<object | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    provinceId: number;
    name: string;
    owner: string;
    population: number;
  } | null>(null);

  const nationColorById = useMemo(() => {
    const colors = new globalThis.Map<number, string>();
    if (!snapshot) return colors;
    for (const nation of snapshot.nations) colors.set(nation.id, muteColor(nation.color));
    return colors;
  }, [snapshot]);

  const provinceNameById = useMemo(() => (
    new globalThis.Map<number, string>(WORLD_SEED.provinces.map((province) => [province.id, province.name]))
  ), []);

  const provinceCoordById = useMemo(() => (
    new globalThis.Map<number, { lon: number; lat: number }>(WORLD_SEED.provinces.map((province) => [province.id, { lon: province.lon, lat: province.lat }]))
  ), []);
  const nationNameByTag = useMemo(() => (
    new globalThis.Map<string, string>(WORLD_SEED.nations.map((nation) => [nation.tag, nation.name]))
  ), []);
  const provinceTerrainById = useMemo(() => (
    new globalThis.Map<number, string>(WORLD_SEED.provinces.map((province) => [province.id, province.terrain]))
  ), []);

  const provinceGeometryById = useMemo(() => {
    const map = new globalThis.Map<number, ProvinceGeometryMetrics>();
    if (!geojson) return map;
    for (const feature of geojson.features) {
      const featureId = Number(feature.id ?? feature.properties?.id);
      if (!Number.isInteger(featureId)) continue;
      const metrics = geometryAreaCentroid(feature.geometry);
      if (!metrics) continue;
      map.set(featureId, metrics);
    }
    return map;
  }, [geojson]);

  const provinceLabelSeeds = useMemo<ProvinceLabelSeed[]>(() => {
    // V6: capital provinces — star glyph + prominence boost so the seat of
    // government surfaces a full zoom tier before ordinary settlements.
    const capitalIds = new globalThis.Map<number, string>();
    for (const nation of WORLD_SEED.nations) {
      capitalIds.set(nation.capitalProvinceId, nation.tag);
    }
    const raw = WORLD_SEED.provinces.map((province) => {
      const geometry = provinceGeometryById.get(province.id);
      const area = Math.max(geometry?.area ?? 0, 0.01);
      const weight = Math.max(0.1, province.populationWeight);
      const isCapital = capitalIds.has(province.id);
      return {
        id: province.id,
        name: province.name,
        ownerTag: province.ownerTag,
        lon: geometry?.labelLon ?? geometry?.lon ?? province.lon,
        lat: geometry?.labelLat ?? geometry?.lat ?? province.lat,
        area,
        weight,
        capital: isCapital,
        prominence: Math.log(weight + 1) * 0.62 + Math.log(area + 1) * 0.38 + (isCapital ? 1.1 : 0),
      };
    });
    const minProminence = raw.reduce((minValue, province) => Math.min(minValue, province.prominence), Number.POSITIVE_INFINITY);
    const maxProminence = raw.reduce((maxValue, province) => Math.max(maxValue, province.prominence), 0);
    return raw.map((province) => {
      const normalizedProminence = normalizeAcrossRange(province.prominence, minProminence, maxProminence);
      return {
        ...province,
        minZoom: 5.1 + (1 - normalizedProminence) * 1.35,
      };
    });
  }, [provinceGeometryById]);

  const countryLabelSeeds = useMemo<CountryLabelSeed[]>(() => {
    type NationPick = {
      provinceCount: number;
      populationWeight: number;
      area: number;
      bestScore: number;
      lon: number;
      lat: number;
    };
    const byTag = new globalThis.Map<string, NationPick>();
    for (const province of provinceLabelSeeds) {
      const homelandName = HOMELAND_PROVINCE_BY_TAG[province.ownerTag];
      const homelandBoost = homelandName && province.name === homelandName ? 8 : 1;
      const score = Math.log(province.area + 1) * ((province.weight + 0.1) ** 1.85) * homelandBoost;
      const existing = byTag.get(province.ownerTag);
      if (!existing) {
        byTag.set(province.ownerTag, {
          provinceCount: 1,
          populationWeight: province.weight,
          area: province.area,
          bestScore: score,
          lon: province.lon,
          lat: province.lat,
        });
        continue;
      }
      existing.provinceCount += 1;
      existing.populationWeight += province.weight;
      existing.area += province.area;
      if (score > existing.bestScore) {
        existing.bestScore = score;
        existing.lon = province.lon;
        existing.lat = province.lat;
      }
    }
    const labels: CountryLabelSeed[] = [];
    for (const [tag, values] of byTag.entries()) {
      if (values.provinceCount === 0) continue;
      const prominence = (
        Math.log(values.provinceCount + 1) * 0.42
        + Math.log(values.populationWeight + 1) * 0.38
        + Math.log(values.area + 1) * 0.2
      );
      labels.push({
        tag,
        name: nationNameByTag.get(tag) ?? tag,
        color: WORLD_SEED.nations.find((nation) => nation.tag === tag)?.color ?? [90, 67, 48],
        lon: values.lon,
        lat: values.lat,
        provinceCount: values.provinceCount,
        area: values.area,
        populationWeight: values.populationWeight,
        prominence,
        minZoom: 4.4,
        major: MAJOR_LABEL_TAGS.has(tag),
      });
    }
    const nonMajorProminence = labels.filter((label) => !label.major).map((label) => label.prominence);
    const minProminence = nonMajorProminence.length > 0 ? Math.min(...nonMajorProminence) : 0;
    const maxProminence = nonMajorProminence.length > 0 ? Math.max(...nonMajorProminence) : 1;
    const withThresholds = labels.map((label) => {
      if (label.major) {
        return { ...label, minZoom: 0.75 };
      }
      const normalizedProminence = normalizeAcrossRange(label.prominence, minProminence, maxProminence);
      const tierBase = normalizedProminence >= 0.72
        ? 2.0
        : normalizedProminence >= 0.48
          ? 2.7
          : normalizedProminence >= 0.27
            ? 3.4
            : 4.05;
      return {
        ...label,
        minZoom: tierBase + (1 - normalizedProminence) * 0.24,
      };
    });
    withThresholds.sort((a, b) => {
      if (a.major !== b.major) return a.major ? -1 : 1;
      if (a.minZoom !== b.minZoom) return a.minZoom - b.minZoom;
      if (b.prominence !== a.prominence) return b.prominence - a.prominence;
      return a.name.localeCompare(b.name);
    });
    return withThresholds;
  }, [nationNameByTag, provinceLabelSeeds]);

  const bounds = useMemo(() => (geojson ? computeBounds(geojson) : null), [geojson]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    selectedArmyRef.current = selectedArmy;
  }, [selectedArmy]);
  useEffect(() => {
    selectedFleetRef.current = selectedFleet;
  }, [selectedFleet]);

  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL;
    const fetchJson = async <T,>(fileName: string): Promise<T | null> => {
      try {
        const response = await fetch(`${base}generated/${fileName}`);
        if (!response.ok) return null;
        return await response.json() as T;
      } catch {
        return null;
      }
    };
    const loadGeo = async () => {
      const [provinces, borders, riverData, lakeData] = await Promise.all([
        fetchJson<ProvinceGeoJson>('provinces.geo.json'),
        fetchJson<NationalBorderGeoJson>('nationalBorders.geo.json'),
        fetchJson<object>('rivers.geo.json'),
        fetchJson<object>('lakes.geo.json'),
      ]);
      if (!alive) return;
      if (provinces) setGeojson(provinces);
      if (borders) setNationalBorders(borders);
      if (riverData) setRivers(riverData);
      if (lakeData) setLakes(lakeData);
    };
    void loadGeo();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !geojson || !nationalBorders || !rivers || !lakes) return;
    let alive = true;
    let createdMap: MapLibreMap | null = null;

    const init = async () => {
      const maplibreModule = await import('maplibre-gl');
      if (!alive || !containerRef.current) return;
      const maplibregl = maplibreModule.default;
      maplibreRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [{
            id: 'paper-background',
            type: 'background',
            paint: { 'background-color': SEA_BASE },
          }],
        },
        center: [0, 18],
        zoom: 1.3,
        attributionControl: false,
        maxPitch: 0,
        renderWorldCopies: false,
        dragPan: true,
        touchZoomRotate: true,
        cooperativeGestures: false,
      });
      createdMap = map;
      mapRef.current = map;
      if (import.meta.env.DEV) {
        const g = globalThis as { __grandCenturyMap?: MapLibreMap; __gcSetMapMode?: (mode: string) => void };
        g.__grandCenturyMap = map;
        g.__gcSetMapMode = (mode) => useStore.getState().setMapMode(mode as never);
      }
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-right');

      map.on('load', () => {
        setMapReady(true);
        map.addSource(MAP_SOURCE_ID, {
          type: 'geojson',
          data: geojson as unknown as object,
        });
        map.addSource(MAP_NATIONAL_SOURCE_ID, {
          type: 'geojson',
          data: nationalBorders as unknown as object,
        });
        map.addSource(MAP_GRATICULE_SOURCE_ID, {
          type: 'geojson',
          data: createGraticule() as unknown as object,
        });
        map.addSource(MAP_MOVEMENT_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] } as unknown as object,
        });
        map.addSource(MAP_RIVERS_SOURCE_ID, {
          type: 'geojson',
          data: rivers as object,
        });
        map.addSource(MAP_LAKES_SOURCE_ID, {
          type: 'geojson',
          data: lakes as object,
        });

        // ---- Sea plate: engraved water, graticule, coastal aquatint --------
        const seaTile = createSeaEngravingTile();
        if (seaTile) {
          map.addImage(MAP_SEA_PATTERN_IMAGE, seaTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_SEA_PATTERN_LAYER,
            type: 'background',
            paint: {
              'background-pattern': MAP_SEA_PATTERN_IMAGE,
              'background-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0,
                0.45,
                4,
                0.6,
                7,
                0.7,
              ],
            },
          });
        }

        map.addLayer({
          id: MAP_GRATICULE_LAYER,
          type: 'line',
          source: MAP_GRATICULE_SOURCE_ID,
          paint: {
            'line-color': GRATICULE_INK,
            'line-width': 0.7,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.14, 4, 0.1, 6.5, 0.06],
          },
        });

        // Wide blurred ink hugging the coast. Land half is masked by the
        // opaque land underlay, leaving a soft aquatint wash over the sea.
        map.addLayer({
          id: MAP_COAST_GLOW_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          paint: {
            'line-color': COAST_GLOW,
            'line-width': ['interpolate', ['linear'], ['zoom'], 0, 4.5, 3, 7, 6, 10],
            'line-blur': ['interpolate', ['linear'], ['zoom'], 0, 4.5, 3, 7, 6, 10],
            'line-opacity': 0.32,
          },
        });

        // Classic engraved waterlines: twin strokes via line-gap-width; the
        // inner stroke hides under land, the outer reads as a coastal ring.
        map.addLayer({
          id: MAP_COAST_WATERLINE_1_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          paint: {
            'line-color': WATERLINE_INK,
            'line-width': 0.9,
            'line-gap-width': ['interpolate', ['linear'], ['zoom'], 0, 2.2, 4, 4.4, 7, 7],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.12, 3, 0.4, 7, 0.5],
          },
        });
        map.addLayer({
          id: MAP_COAST_WATERLINE_2_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          paint: {
            'line-color': WATERLINE_INK,
            'line-width': 0.8,
            'line-gap-width': ['interpolate', ['linear'], ['zoom'], 0, 5.4, 4, 9.4, 7, 14.5],
            // Silent below z2.6 — at world zoom the outer ring makes island
            // chains read as smudges; it fades in once archipelagos resolve.
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 2.6, 0, 3.4, 0.24, 7, 0.32],
          },
        });

        // Crisp coastline ink — outer half of the stroke survives the mask.
        map.addLayer({
          id: MAP_COASTLINE_INK_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': COAST_INK,
            'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.1, 4, 1.7, 7, 2.3],
            'line-opacity': 0.72,
          },
        });

        // ---- Land plate: SE plate shadow + opaque paper underlay -----------
        map.addLayer({
          id: MAP_LAND_SHADOW_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': LAND_SHADOW,
            'fill-opacity': 0.18,
            'fill-translate': [2.5, 3.5],
            'fill-translate-anchor': 'viewport',
          },
        });

        map.addLayer({
          id: MAP_LAND_UNDERLAY_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': LAND_PAPER,
            'fill-opacity': 1,
          },
        });

        // ---- Water plate (V6): engraved lakes + rivers on the land mass ---
        // Lakes sit on the paper underlay as muted steel-blue fills with an
        // ink shoreline; rivers are tapered ink strokes above terrain tints
        // but below province borders, so they read as plate engraving, not
        // as boundaries. Both fade in with zoom like the other engraving.
        map.addLayer({
          id: MAP_LAKES_FILL_LAYER,
          type: 'fill',
          source: MAP_LAKES_SOURCE_ID,
          paint: {
            'fill-color': LAKE_FILL,
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1.5, 0.55, 4, 0.7, 7, 0.8],
          },
        });
        map.addLayer({
          id: MAP_LAKES_LINE_LAYER,
          type: 'line',
          source: MAP_LAKES_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': LAKE_SHORE,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 0.5, 4, 0.9, 7, 1.3],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 1.5, 0.35, 4, 0.5, 7, 0.6],
          },
        });
        map.addLayer({
          id: MAP_RIVERS_LAYER,
          type: 'line',
          source: MAP_RIVERS_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': RIVER_INK,
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 4, 0.8, 6.5, 1.6],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.28, 4, 0.42, 6.5, 0.55],
          },
        });

        // Aquatint: a whisper of engraving noise over every land fill so no
        // province reads as dead-flat vector color. Zoom-faded — invisible at
        // world zoom, perceptible only as texture up close.
        const aquatintTile = createAquatintTile();
        if (aquatintTile) {
          map.addImage(MAP_AQUATINT_IMAGE, aquatintTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_AQUATINT_LAYER,
            type: 'fill',
            source: MAP_SOURCE_ID,
            paint: {
              'fill-pattern': MAP_AQUATINT_IMAGE,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 3.2, 0.05, 5.5, 0.09, 7, 0.12],
            },
          });
        }

        map.addLayer({
          id: MAP_FILL_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': ['coalesce', ['feature-state', 'fill'], DEFAULT_FILL],
            'fill-opacity': 0.92,
          },
        });

        // Cross-fade plate: staged next-mapmode colors dissolve in via a GPU
        // paint transition, then commit to the base fill beneath (0.5.2).
        map.addLayer({
          id: MAP_FILL_FADE_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': ['coalesce', ['feature-state', 'fillNext'], DEFAULT_FILL],
            'fill-opacity': 0,
          },
        });

        map.addLayer({
          id: MAP_OCCUPATION_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': ['coalesce', ['feature-state', 'occupationColor'], '#6b4c38'],
            'fill-opacity': ['coalesce', ['feature-state', 'occupationOpacity'], 0],
          },
        });

        // ---- Terrain engraving: hachured ranges, stippled deserts ----------
        const hachureTile = createHachureTile();
        if (hachureTile && MOUNTAIN_PROVINCE_IDS.length > 0) {
          map.addImage(MAP_HACHURE_IMAGE, hachureTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_HACHURE_LAYER,
            type: 'fill',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', MOUNTAIN_PROVINCE_IDS]],
            paint: {
              'fill-pattern': MAP_HACHURE_IMAGE,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.22, 3, 0.32, 6, 0.38],
            },
          });
        }
        const stippleTile = createStippleTile();
        if (stippleTile && DESERT_PROVINCE_IDS.length > 0) {
          map.addImage(MAP_STIPPLE_IMAGE, stippleTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_STIPPLE_LAYER,
            type: 'fill',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', DESERT_PROVINCE_IDS]],
            paint: {
              'fill-pattern': MAP_STIPPLE_IMAGE,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.18, 3, 0.26, 6, 0.3],
            },
          });
        }
        const foliageTile = createFoliageTile();
        if (foliageTile && FOREST_PROVINCE_IDS.length > 0) {
          map.addImage(MAP_FOLIAGE_IMAGE, foliageTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_FOLIAGE_LAYER,
            type: 'fill',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', FOREST_PROVINCE_IDS]],
            paint: {
              'fill-pattern': MAP_FOLIAGE_IMAGE,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.14, 3, 0.2, 6, 0.24],
            },
          });
        }

        // ---- Relief (0.5.2): hillshade impression over mountain provinces --
        // 1) Engraved mountain-profile marks with SE-flank shade hachures.
        const reliefTile = createReliefTile();
        if (reliefTile && MOUNTAIN_PROVINCE_IDS.length > 0) {
          map.addImage(MAP_RELIEF_IMAGE, reliefTile, { pixelRatio: 2 });
          map.addLayer({
            id: MAP_RELIEF_LAYER,
            type: 'fill',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', MOUNTAIN_PROVINCE_IDS]],
            paint: {
              'fill-pattern': MAP_RELIEF_IMAGE,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 3, 0.44, 6, 0.52],
            },
          });
        }
        // 2) Massif emboss: viewport-anchored light/shadow rims so ranges read
        // as raised plate-work (NW light, SE shadow). Pure GPU translate.
        if (MOUNTAIN_PROVINCE_IDS.length > 0) {
          map.addLayer({
            id: MAP_RELIEF_SHADE_LAYER,
            type: 'line',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', MOUNTAIN_PROVINCE_IDS]],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#241809',
              'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.6, 4, 2.6, 7, 3.4],
              'line-blur': 2.6,
              'line-opacity': 0.2,
              'line-translate': [1.4, 1.9],
              'line-translate-anchor': 'viewport',
            },
          });
          map.addLayer({
            id: MAP_RELIEF_LIGHT_LAYER,
            type: 'line',
            source: MAP_SOURCE_ID,
            filter: ['in', ['id'], ['literal', MOUNTAIN_PROVINCE_IDS]],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#fff3d4',
              'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.4, 4, 2.2, 7, 3],
              'line-blur': 2.2,
              'line-opacity': 0.32,
              'line-translate': [-1.2, -1.6],
              'line-translate-anchor': 'viewport',
            },
          });
        }

        // Inner shade: soft ink rim inside every parcel at close zoom — the
        // embossed "hand-tinted plate" depth that breaks up large flat fills.
        map.addLayer({
          id: MAP_INNER_SHADE_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#3c2b18',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3.6, 0, 5, 6, 7, 11],
            'line-blur': ['interpolate', ['linear'], ['zoom'], 3.6, 2, 5, 7, 7, 12],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.6, 0, 4.6, 0.12, 6, 0.17],
          },
        });

        // ---- Borders: fine sepia province rules, weighted national ink ----
        map.addLayer({
          id: MAP_PROVINCE_LINE_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': PROVINCE_BORDER_INK,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.2,
              0.25,
              4.8,
              0.5,
              6.8,
              0.85,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.0,
              0,
              4.2,
              0.22,
              5.4,
              0.5,
              7.2,
              0.72,
            ],
          },
        });

        // Player border halo: a soft warm glow hugging the player's provinces
        // so their empire reads instantly on the political plate. Source is
        // the province polygons (the static national-borders MultiLineString
        // carries no per-nation attribution); the visible set + opacity are
        // driven from the snapshot effect below.
        map.addLayer({
          id: MAP_PLAYER_HALO_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#c99a58',
            'line-width': ['interpolate', ['linear'], ['zoom'], 0, 4.5, 3, 7, 6, 11],
            'line-blur': 4.5,
            'line-opacity': 0,
          },
        });

        // Soft dark band beneath the national line — engraved plate weight
        // without the wobble a single thick stroke would show.
        map.addLayer({
          id: MAP_NATIONAL_BAND_LAYER,
          type: 'line',
          source: MAP_NATIONAL_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': NATION_BORDER_BAND,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              2.6,
              3.5,
              4.4,
              6.5,
              6.5,
            ],
            'line-blur': 3.5,
            'line-opacity': 0.22,
          },
        });

        map.addLayer({
          id: MAP_NATIONAL_LINE_LAYER,
          type: 'line',
          source: MAP_NATIONAL_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': NATION_BORDER_INK,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              1.05,
              3.5,
              1.5,
              6.5,
              2.0,
              8.5,
              2.4,
            ],
            'line-opacity': 0.96,
          },
        });

        // ---- Selection & hover: paper lift + ink halo + crisp rule --------
        map.addLayer({
          id: MAP_HOVER_LIFT_LAYER,
          type: 'fill',
          source: MAP_SOURCE_ID,
          paint: {
            'fill-color': '#fff6dd',
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.1,
              ['boolean', ['feature-state', 'hover'], false],
              0.12,
              0,
            ],
          },
        });

        map.addLayer({
          id: MAP_HOVER_GLOW_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#231407',
            'line-blur': 6,
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              9,
              ['boolean', ['feature-state', 'hover'], false],
              7,
              0,
            ],
            'line-opacity': 0.28,
          },
        });

        map.addLayer({
          id: MAP_HOVER_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#1f140d',
              '#2f2216',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.2,
              ['boolean', ['feature-state', 'hover'], false],
              1.8,
              0,
            ],
            'line-opacity': 0.95,
          },
        });

        map.addLayer({
          id: MAP_MOVEMENT_LAYER,
          type: 'line',
          source: MAP_MOVEMENT_SOURCE,
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#553a29'],
            'line-width': ['coalesce', ['get', 'width'], 2],
            'line-opacity': ['coalesce', ['get', 'opacity'], 0.65],
            'line-dasharray': [1.4, 1.2],
          },
        });

        if (bounds) map.fitBounds(bounds, { padding: 30, duration: 550, maxZoom: 2.7 });
      });

    map.on('click', MAP_FILL_LAYER, (event) => {
      const clicked = event.features?.[0];
      const provinceId = Number(clicked?.properties?.id);
      if (!Number.isInteger(provinceId)) return;
      const latestSnapshot = snapshotRef.current;
      if (selectedArmyRef.current !== null) {
        const selected = latestSnapshot?.armies.find((army) => army.id === selectedArmyRef.current) ?? null;
        const stack = selected && latestSnapshot
          ? latestSnapshot.armies.filter((army) => !army.rebel && army.owner === selected.owner && army.location === selected.location)
          : [];
        if (stack.length > 0) {
          for (const army of stack) sendCommand({ t: 'moveArmy', army: army.id, target: provinceId });
        } else {
          sendCommand({ t: 'moveArmy', army: selectedArmyRef.current, target: provinceId });
        }
        return;
      }
      if (selectedFleetRef.current !== null) {
        const selected = latestSnapshot?.fleets.find((fleet) => fleet.id === selectedFleetRef.current) ?? null;
        const stack = selected && latestSnapshot
          ? latestSnapshot.fleets.filter((fleet) => fleet.owner === selected.owner && fleet.location === selected.location)
          : [];
        if (stack.length > 0) {
          for (const fleet of stack) sendCommand({ t: 'moveFleet', fleet: fleet.id, target: provinceId });
        } else {
          sendCommand({ t: 'moveFleet', fleet: selectedFleetRef.current, target: provinceId });
        }
        return;
      }
      selectProvince(provinceId);
    });

    map.on('click', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [MAP_FILL_LAYER] });
      if (features.length === 0) selectProvince(null);
    });

    map.on('mouseenter', MAP_FILL_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', MAP_FILL_LAYER, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredRef.current !== null) {
        map.setFeatureState({ source: MAP_SOURCE_ID, id: hoveredRef.current }, { hover: false });
        hoveredRef.current = null;
      }
      setTooltip(null);
    });

    map.on('mousemove', MAP_FILL_LAYER, (event) => {
      const id = Number(event.features?.[0]?.properties?.id);
      if (!Number.isInteger(id)) {
        setTooltip(null);
        return;
      }
      if (hoveredRef.current !== null && hoveredRef.current !== id) {
        map.setFeatureState({ source: MAP_SOURCE_ID, id: hoveredRef.current }, { hover: false });
      }
      hoveredRef.current = id;
      map.setFeatureState({ source: MAP_SOURCE_ID, id }, { hover: true });

      const latestSnapshot = snapshotRef.current;
      if (!latestSnapshot) return;
      const province = latestSnapshot.provinces[id];
      if (!province) return;
      const owner = latestSnapshot.nations.find((nation) => nation.id === province.owner)?.name ?? 'Unknown';
      setTooltip({
        x: event.point.x,
        y: event.point.y,
        provinceId: id,
        name: provinceNameById.get(id) ?? `Province ${id}`,
        owner,
        population: province.population,
      });
    });

    };

    void init();
    return () => {
      alive = false;
      const map = createdMap ?? mapRef.current;
      if (map) map.remove();
      mapRef.current = null;
      if (import.meta.env.DEV) delete (globalThis as { __grandCenturyMap?: MapLibreMap }).__grandCenturyMap;
      setMapReady(false);
    };
  }, [bounds, geojson, nationalBorders, rivers, lakes, provinceNameById, selectProvince, sendCommand]);

  useEffect(() => {
    const map = mapRef.current;
    // mapReady in the deps re-runs this once layers exist — otherwise a
    // paused game (no fresh snapshots) would leave the plate uncolored.
    if (!map || !mapReady || !map.getLayer(MAP_FILL_LAYER) || !snapshot) return;

    const nationById = new globalThis.Map(snapshot.nations.map((nation) => [nation.id, nation]));
    const economies = snapshot.provinces.map((province) => province.economyOutput);
    const econMin = Math.min(...economies);
    const econMax = Math.max(...economies);
    const econRange = Math.max(1, econMax - econMin);

    const allies = new Set<number>();
    const enemies = new Set<number>();
    const relationByNation = new globalThis.Map<number, string>();
    for (const war of snapshot.wars) {
      if (war.attackers.includes(snapshot.playerNation)) {
        war.attackers.forEach((nationId) => allies.add(nationId));
        war.defenders.forEach((nationId) => enemies.add(nationId));
      } else if (war.defenders.includes(snapshot.playerNation)) {
        war.defenders.forEach((nationId) => allies.add(nationId));
        war.attackers.forEach((nationId) => enemies.add(nationId));
      }
    }
    for (const relation of snapshot.relations) {
      if (relation.a === snapshot.playerNation) relationByNation.set(relation.b, relation.kind);
      else if (relation.b === snapshot.playerNation) relationByNation.set(relation.a, relation.kind);
    }
    const playerNation = nationById.get(snapshot.playerNation) ?? null;
    const playerCoreStates = new Set(snapshot.playerCoreStateIds ?? []);

    // Mapmode switches dissolve via the fade plate; in-mode snapshot updates
    // (game ticks) still write the base fill directly.
    const modeChanged = prevMapModeRef.current !== null && prevMapModeRef.current !== mapMode;
    prevMapModeRef.current = mapMode;
    const crossfade = modeChanged && Boolean(map.getLayer(MAP_FILL_FADE_LAYER));
    const fadeInProgress = fadeTimerRef.current !== null;
    const stagedFills = crossfade ? new globalThis.Map<number, string>() : null;

    for (const province of snapshot.provinces) {
      const ownerColor = nationColorById.get(province.owner) ?? DEFAULT_FILL;
      const controllerColor = province.controller === -1
        ? '#7a4d49'
        : (nationColorById.get(province.controller) ?? ownerColor);
      let fill = ownerColor;
      const occupied = province.controller !== province.owner;
      // Terrain is a pure geography plate — occupation stripes stay off it.
      const occupationOpacity = occupied && mapMode !== 'terrain'
        ? (mapMode === 'military' ? 0.54 : 0.24)
        : 0;
      const occupationColor = occupied ? blend(controllerColor, 0.04) : controllerColor;

      if (mapMode === 'terrain') {
        fill = TERRAIN_BIOME_COLORS[provinceTerrainById.get(province.id) ?? ''] ?? LAND_PAPER;
      } else if (mapMode === 'population') {
        const needs = clamp01(province.needsMet);
        const hunger = 1 - needs;
        const red = Math.round(164 + hunger * 58);
        const green = Math.round(92 + needs * 84);
        const blue = Math.round(78 + needs * 30);
        fill = toHexColor([red, green, blue]);
      } else if (mapMode === 'ruling_ideology') {
        const ideology = snapshot.nations.find((nation) => nation.id === province.owner)?.rulingIdeology ?? 'conservative';
        fill = blend(IDEOLOGY_COLORS[ideology] ?? IDEOLOGY_COLORS.conservative, 0.12);
      } else if (mapMode === 'unrest') {
        const unrest = clamp01(Math.max(province.unrestRisk, province.militancy / 10));
        const red = Math.round(136 + unrest * 86);
        const green = Math.round(108 - unrest * 48);
        const blue = Math.round(92 - unrest * 50);
        fill = toHexColor([red, green, blue]);
      } else if (mapMode === 'economy') {
        const econScaled = clamp01((province.economyOutput - econMin) / econRange);
        fill = blend('#5b7c72', 0.6 - econScaled * 0.5);
      } else if (mapMode === 'military') {
        fill = province.controller !== province.owner ? blend(controllerColor, 0.14) : blend(ownerColor, 0.32);
      } else if (mapMode === 'diplomatic') {
        const ownerNation = nationById.get(province.owner);
        const relation = relationByNation.get(province.owner) ?? 'neutral';
        if (province.owner === snapshot.playerNation) fill = DIPLO_COLORS.self;
        else if (enemies.has(province.owner)) fill = DIPLO_COLORS.atWar;
        else if (allies.has(province.owner)) fill = DIPLO_COLORS.ally;
        else if (relation === 'rivalry') fill = DIPLO_COLORS.rival;
        else if (relation === 'alliance') fill = DIPLO_COLORS.ally;
        else if (ownerNation && (ownerNation.spheredBy === snapshot.playerNation || playerNation?.spheredBy === ownerNation.id)) {
          fill = DIPLO_COLORS.sphere;
        }
        else fill = DIPLO_COLORS.neutral;
      } else if (mapMode === 'cores') {
        const isCore = playerCoreStates.has(province.stateId);
        if (!isCore) fill = blend(ownerColor, 0.6);
        else if (province.owner === snapshot.playerNation) fill = blend('#4e8a5e', 0.2);
        else fill = blend('#8e4d46', 0.18);
      }

      if (TERRAIN_TINTED_MODES.has(mapMode)) {
        // Terrain underpainting: a hand-tinted wash beneath the nation color
        // so continents get internal texture without breaking political reads.
        const tint = TERRAIN_TINTS[provinceTerrainById.get(province.id) ?? ''];
        if (tint) fill = mixHex(fill, tint, TERRAIN_TINT_STRENGTH);
      }

      if (stagedFills) {
        stagedFills.set(province.id, fill);
        const occKey = `${occupationColor}|${occupationOpacity}`;
        occupationRef.current.set(province.id, occKey);
        map.setFeatureState(
          { source: MAP_SOURCE_ID, id: province.id },
          { fillNext: fill, occupationColor, occupationOpacity },
        );
        continue;
      }
      const prevFill = fillRef.current.get(province.id);
      const occKey = `${occupationColor}|${occupationOpacity}`;
      const prevOcc = occupationRef.current.get(province.id);
      const fillChanged = prevFill !== fill && !fadeInProgress;
      const occChanged = prevOcc !== occKey;
      if (!fillChanged && !occChanged) continue;
      const stateUpdate: Record<string, string | number> = {};
      if (fillChanged) {
        stateUpdate.fill = fill;
        fillRef.current.set(province.id, fill);
      }
      if (occChanged) {
        stateUpdate.occupationColor = occupationColor;
        stateUpdate.occupationOpacity = occupationOpacity;
        occupationRef.current.set(province.id, occKey);
      }
      map.setFeatureState({ source: MAP_SOURCE_ID, id: province.id }, stateUpdate);
    }

    if (stagedFills) {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      if (fadeRafRef.current !== null) cancelAnimationFrame(fadeRafRef.current);
      // Snap the fade plate to invisible, then let the GPU paint transition
      // dissolve the staged colors in over the old plate.
      map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity-transition', { duration: 0, delay: 0 });
      map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity', 0);
      fadeRafRef.current = requestAnimationFrame(() => {
        fadeRafRef.current = null;
        if (mapRef.current !== map || !map.getLayer(MAP_FILL_FADE_LAYER)) return;
        map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity-transition', { duration: MODE_FADE_MS, delay: 0 });
        map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity', 0.92);
      });
      fadeTimerRef.current = window.setTimeout(() => {
        fadeTimerRef.current = null;
        if (mapRef.current !== map || !map.getLayer(MAP_FILL_FADE_LAYER)) return;
        for (const [provinceId, stagedFill] of stagedFills.entries()) {
          map.setFeatureState({ source: MAP_SOURCE_ID, id: provinceId }, { fill: stagedFill });
          fillRef.current.set(provinceId, stagedFill);
        }
        map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity-transition', { duration: 0, delay: 0 });
        map.setPaintProperty(MAP_FILL_FADE_LAYER, 'fill-opacity', 0);
      }, MODE_FADE_MS + 70);
    }
  }, [mapMode, mapReady, nationColorById, provinceTerrainById, snapshot]);

  // Player border halo: keep the glowing set in sync with ownership, and
  // only show it on the political plate — on thematic plates it would lie.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(MAP_PLAYER_HALO_LAYER) || !snapshot) return;
    const playerIds: number[] = [];
    for (const province of snapshot.provinces) {
      if (province.owner === snapshot.playerNation) playerIds.push(province.id);
    }
    const ids = playerIds.length > 0 ? playerIds : [-1];
    map.setPaintProperty(MAP_PLAYER_HALO_LAYER, 'line-opacity', [
      'case',
      ['in', ['id'], ['literal', ids]],
      mapMode === 'political' ? 0.42 : 0,
      0,
    ]);
  }, [mapMode, mapReady, snapshot]);

  // Clear any in-flight mapmode dissolve timers on unmount.
  useEffect(() => () => {
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    if (fadeRafRef.current !== null) cancelAnimationFrame(fadeRafRef.current);
    fadeTimerRef.current = null;
    fadeRafRef.current = null;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl || !mapReady) return;

    const countryMarkers = countryLabelMarkerRef.current;
    const provinceMarkers = provinceLabelMarkerRef.current;
    const offsets: Array<[number, number]> = [
      [0, 0],
      [0, -18],
      [0, 18],
      [18, -10],
      [-18, -10],
      [18, 10],
      [-18, 10],
      [0, -32],
      [0, 32],
      [30, 0],
      [-30, 0],
      [26, -22],
      [-26, 22],
    ];
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const measureEl = document.createElement('div');
    measureEl.setAttribute('aria-hidden', 'true');
    measureEl.dataset.gcMeasure = '1';
    measureEl.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;font-family:var(--gc-font-display),serif;';
    document.body.appendChild(measureEl);
    const measureLabel = (text: string, size: number, major: boolean, province = false) => {
      measureEl.style.fontSize = `${size.toFixed(1)}px`;
      measureEl.style.fontWeight = major ? '700' : province ? '500' : '600';
      measureEl.style.letterSpacing = province ? '0.02em' : `${(size * 0.05).toFixed(2)}px`;
      measureEl.style.textTransform = province ? 'none' : 'uppercase';
      measureEl.style.fontVariant = province ? 'normal' : 'small-caps';
      measureEl.textContent = text;
      // Province labels carry a settlement dot + flex gap (0.34em + 0.28em);
      // pad the measured box so the collision grid matches what renders.
      const dotPad = province ? size * 0.62 + 2 : 0;
      const width = Math.max(8, measureEl.offsetWidth + dotPad);
      const height = Math.max(8, measureEl.offsetHeight);
      measureEl.textContent = '';
      return { width, height };
    };

    const upsertCountryMarker = (label: CountryLabelSeed, size: number, opacity: number, offset: [number, number]) => {
      const shieldSize = Math.max(10, Math.round(size * 0.95));
      const shieldHtml = `<span class="nation-shield nation-shield--map">${nationShieldSvg({ tag: label.tag, color: label.color }, shieldSize)}</span>`;
      const existing = countryMarkers.get(label.tag);
      if (existing) {
        const element = existing.getElement() as HTMLDivElement;
        element.innerHTML = `${shieldHtml}<span>${label.name}</span>`;
        element.style.fontSize = `${size.toFixed(1)}px`;
        element.style.opacity = `${opacity.toFixed(3)}`;
        element.style.letterSpacing = `${(size * 0.05).toFixed(2)}px`;
        element.classList.toggle('is-major', label.major);
        element.dataset.tag = label.tag;
        element.dataset.minzoom = label.minZoom.toFixed(2);
        element.dataset.prominence = label.prominence.toFixed(3);
        existing.setLngLat([label.lon, label.lat]);
        existing.setOffset(offset);
        return;
      }
      const el = document.createElement('div');
      el.className = 'grand-map__country-label';
      if (label.major) el.classList.add('is-major');
      el.innerHTML = `${shieldHtml}<span>${label.name}</span>`;
      el.style.fontSize = `${size.toFixed(1)}px`;
      el.style.opacity = `${opacity.toFixed(3)}`;
      el.style.letterSpacing = `${(size * 0.05).toFixed(2)}px`;
      el.dataset.tag = label.tag;
      el.dataset.minzoom = label.minZoom.toFixed(2);
      el.dataset.prominence = label.prominence.toFixed(3);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([label.lon, label.lat])
        .setOffset(offset)
        .addTo(map);
      countryMarkers.set(label.tag, marker);
    };

    const upsertProvinceMarker = (province: ProvinceLabelSeed, size: number, opacity: number) => {
      const dotHtml = province.capital
        ? '<i class="grand-map__province-star" aria-hidden="true">★</i>'
        : '<i class="grand-map__province-dot" aria-hidden="true"></i>';
      const existing = provinceMarkers.get(province.id);
      if (existing) {
        const element = existing.getElement() as HTMLDivElement;
        element.innerHTML = `${dotHtml}${province.name}`;
        element.style.fontSize = `${size.toFixed(1)}px`;
        element.style.opacity = `${opacity.toFixed(3)}`;
        element.dataset.owner = province.ownerTag;
        element.dataset.minzoom = province.minZoom.toFixed(2);
        element.dataset.prominence = province.prominence.toFixed(3);
        if (province.capital) element.dataset.capital = '1';
        else delete element.dataset.capital;
        existing.setLngLat([province.lon, province.lat]);
        return;
      }
      const el = document.createElement('div');
      el.className = 'grand-map__province-label';
      el.innerHTML = `${dotHtml}${province.name}`;
      el.style.fontSize = `${size.toFixed(1)}px`;
      el.style.opacity = `${opacity.toFixed(3)}`;
      el.dataset.owner = province.ownerTag;
      el.dataset.minzoom = province.minZoom.toFixed(2);
      el.dataset.prominence = province.prominence.toFixed(3);
      if (province.capital) el.dataset.capital = '1';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([province.lon, province.lat])
        .addTo(map);
      provinceMarkers.set(province.id, marker);
    };

    const refreshLabels = () => {
      // Do NOT gate on map.isStyleLoaded() — MapLibre 5 with an inline glyph-less
      // style can leave that flag false forever, which previously rendered 0 labels.
      const zoom = map.getZoom();
      const canvas = map.getCanvas();
      const viewportWidth = canvas.clientWidth || map.getContainer().clientWidth;
      const viewportHeight = canvas.clientHeight || map.getContainer().clientHeight;
      if (viewportWidth < 8 || viewportHeight < 8) return;

      const isProjectedVisible = (point: { x: number; y: number }, padding: number) => (
        point.x >= -padding
        && point.x <= viewportWidth + padding
        && point.y >= -padding
        && point.y <= viewportHeight + padding
      );

      const occupiedBoxes: ScreenBox[] = [];
      const keepCountry = new Set<string>();
      const keepProvince = new Set<number>();
      const countryOpacity = clamp01((6.2 - zoom) / 1.15);

      if (countryOpacity > 0.01) {
        const regionFocusZoom = zoom >= 5.2;
        const countries = countryLabelSeeds
          .filter((label) => zoom >= label.minZoom - 0.4)
          .filter((label) => !regionFocusZoom || (!label.major && label.minZoom >= 3.0));
        countries.sort((a, b) => {
          if (a.major !== b.major) return a.major ? -1 : 1;
          if (a.minZoom !== b.minZoom) return a.minZoom - b.minZoom;
          return b.prominence - a.prominence;
        });
        for (const label of countries) {
          const point = map.project([label.lon, label.lat]);
          if (!isProjectedVisible(point, label.major ? 200 : 110)) continue;
          const appearOpacity = clamp01((zoom - label.minZoom + 0.45) / 0.55);
          if (!label.major && appearOpacity <= 0.01) continue;

          const zoomScale = 1 - clamp01((zoom - 1.4) / 5.2) * 0.22;
          const worldCompact = zoom <= 2 ? 0.72 : 1;
          const baseSize = (10 + Math.log(label.prominence + 1) * 1.45 + (label.major ? 1.2 : 0)) * worldCompact;
          const targetSize = Math.max(9.5, Math.min(22, baseSize * zoomScale));
          const shrinkSteps = label.major ? [1, 0.9, 0.8, 0.7, 0.6] : [1, 0.88];
          let placed: { box: ScreenBox; size: number; offset: [number, number] } | null = null;
          for (const shrink of shrinkSteps) {
            const size = targetSize * shrink;
            const measured = measureLabel(label.name, size, label.major);
            for (const offset of offsets) {
              const box = makeScreenBox(
                point.x + offset[0],
                point.y + offset[1],
                measured.width,
                measured.height,
                label.major ? 5 : 4,
              );
              if (!insideViewport(box, viewportWidth, viewportHeight, label.major ? 140 : 72)) continue;
              if (occupiedBoxes.some((other) => intersects(box, other))) continue;
              placed = { box, size, offset };
              break;
            }
            if (placed) break;
          }
          if (!placed && label.major && zoom <= 2.4) {
            const size = Math.max(8.8, targetSize * 0.55);
            const measured = measureLabel(label.name, size, true);
            for (const offset of offsets) {
              const box = makeScreenBox(point.x + offset[0], point.y + offset[1], measured.width, measured.height, 3);
              if (!insideViewport(box, viewportWidth, viewportHeight, 140)) continue;
              if (occupiedBoxes.some((other) => intersects(box, other))) continue;
              placed = { box, size, offset };
              break;
            }
          }
          if (!placed) continue;
          occupiedBoxes.push(placed.box);
          const opacity = label.major
            ? Math.min(1, Math.max(0.82, countryOpacity) * (0.9 + appearOpacity * 0.1))
            : Math.max(0.28, countryOpacity * appearOpacity * 0.95);
          if (opacity <= 0.01) continue;
          keepCountry.add(label.tag);
          upsertCountryMarker(label, placed.size, opacity, placed.offset);
        }
      }

      const provinceOpacity = clamp01((zoom - 5.05) / 0.7) * 0.96;
      const provinceCountByOwner = new globalThis.Map<string, number>();

      if (provinceOpacity > 0.01) {
        const maxLabels = zoom < 5.8 ? 100 : zoom < 6.6 ? 200 : 320;
        const candidates = provinceLabelSeeds
          .filter((province) => zoom >= province.minZoom - 0.3)
          .sort((a, b) => (b.prominence - a.prominence) || a.name.localeCompare(b.name));
        for (const province of candidates) {
          if (keepProvince.size >= maxLabels) break;
          const point = map.project([province.lon, province.lat]);
          if (!isProjectedVisible(point, 72)) continue;
          const appearOpacity = clamp01((zoom - province.minZoom + 0.35) / 0.5);
          if (appearOpacity <= 0.01) continue;
          const baseSize = 8.6
            + clamp01((zoom - 5) / 3.2) * 2.3
            + Math.min(1.4, Math.log(province.weight + 1) * 0.45)
            + Math.min(2.6, Math.log(province.area + 1) * 0.55);
          const size = Math.max(8.8, Math.min(16.5, baseSize));
          const measured = measureLabel(province.name, size, false, true);
          const box = makeScreenBox(point.x, point.y, measured.width, measured.height, 3.5);
          if (!insideViewport(box, viewportWidth, viewportHeight, 56)) continue;
          if (occupiedBoxes.some((other) => intersects(box, other))) continue;
          occupiedBoxes.push(box);
          keepProvince.add(province.id);
          provinceCountByOwner.set(province.ownerTag, (provinceCountByOwner.get(province.ownerTag) ?? 0) + 1);
          upsertProvinceMarker(province, size, Math.max(0.28, provinceOpacity * appearOpacity));
        }
      }

      if (zoom >= 5.15) {
        for (const [ownerTag, count] of provinceCountByOwner.entries()) {
          if (count < 2) continue;
          keepCountry.delete(ownerTag);
        }
      }

      for (const [tag, marker] of countryMarkers.entries()) {
        if (keepCountry.has(tag)) continue;
        marker.remove();
        countryMarkers.delete(tag);
      }

      for (const [id, marker] of provinceMarkers.entries()) {
        if (keepProvince.has(id)) continue;
        marker.remove();
        provinceMarkers.delete(id);
      }
    };

    const scheduleRefresh = (delay = LABEL_REFRESH_DEBOUNCE_MS) => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshLabels();
      }, delay);
    };

    map.on('moveend', scheduleRefresh);
    map.on('zoomend', scheduleRefresh);
    map.on('resize', scheduleRefresh);
    const onIdleOnce = () => {
      scheduleRefresh(0);
      map.off('idle', onIdleOnce);
    };
    map.on('idle', onIdleOnce);
    scheduleRefresh(0);
    // fitBounds animates after load — refresh again once it settles
    scheduleRefresh(750);

    return () => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      measureEl.remove();
      map.off('moveend', scheduleRefresh);
      map.off('zoomend', scheduleRefresh);
      map.off('resize', scheduleRefresh);
      map.off('idle', onIdleOnce);
      for (const marker of countryMarkers.values()) marker.remove();
      countryMarkers.clear();
      for (const marker of provinceMarkers.values()) marker.remove();
      provinceMarkers.clear();
    };
  }, [countryLabelSeeds, mapReady, provinceLabelSeeds]);

  // Ocean lettering + zoom band (atlas furniture; markers created once).
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    const container = containerRef.current;
    if (!map || !maplibregl || !container || !mapReady) return;

    const oceanMarkers: MapLibreMarker[] = [];
    for (const ocean of OCEAN_LABELS) {
      const el = document.createElement('div');
      el.className = 'grand-map__ocean-label';
      el.textContent = ocean.name;
      el.style.fontSize = `${(15 * ocean.size).toFixed(1)}px`;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([ocean.lon, ocean.lat])
        .addTo(map);
      oceanMarkers.push(marker);
    }

    // Cheap zoom band on the container so CSS can fade decor (compositor-only).
    const syncZoomBand = () => {
      const zoom = map.getZoom();
      const band = zoom < 3.4 ? 'far' : zoom < 5.1 ? 'mid' : 'near';
      if (container.dataset.zoomBand !== band) container.dataset.zoomBand = band;
    };
    syncZoomBand();
    map.on('zoom', syncZoomBand);

    return () => {
      map.off('zoom', syncZoomBand);
      for (const marker of oceanMarkers) marker.remove();
      delete container.dataset.zoomBand;
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !snapshot || !maplibregl) return;

    const allMarkers = markerRef.current;
    const markerSigs = markerSigRef.current;
    const keepKeys = new Set<string>();
    const movementSource = map.getSource(MAP_MOVEMENT_SOURCE) as
      | { setData: (data: object) => void }
      | undefined;

    const enemyByNation = new globalThis.Map<number, Set<number>>();
    for (const war of snapshot.wars) {
      for (const attacker of war.attackers) {
        const set = enemyByNation.get(attacker) ?? new Set<number>();
        for (const defender of war.defenders) set.add(defender);
        enemyByNation.set(attacker, set);
      }
      for (const defender of war.defenders) {
        const set = enemyByNation.get(defender) ?? new Set<number>();
        for (const attacker of war.attackers) set.add(attacker);
        enemyByNation.set(defender, set);
      }
    }

    const armiesByProvince = new globalThis.Map<number, typeof snapshot.armies>();
    for (const army of snapshot.armies) {
      const list = armiesByProvince.get(army.location) ?? [];
      list.push(army);
      armiesByProvince.set(army.location, list);
    }
    const fleetsByProvince = new globalThis.Map<number, typeof snapshot.fleets>();
    for (const fleet of snapshot.fleets) {
      const list = fleetsByProvince.get(fleet.location) ?? [];
      list.push(fleet);
      fleetsByProvince.set(fleet.location, list);
    }
    const provinceById = new globalThis.Map(snapshot.provinces.map((province) => [province.id, province]));
    const ownerColorById = new globalThis.Map(snapshot.nations.map((nation) => [nation.id, toHexColor(nation.color)]));

    const markerOffsets = (count: number): Array<[number, number]> => {
      if (count <= 1) return [[0, 0]];
      const radius = count <= 2 ? 20 : count <= 4 ? 26 : 32;
      const offsets: Array<[number, number]> = [];
      for (let index = 0; index < count; index++) {
        const angle = (Math.PI * 2 * index) / count;
        offsets.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
      }
      return offsets;
    };

    const upsertMarker = (
      key: string,
      signature: string,
      provinceId: number,
      el: HTMLElement,
      offset: [number, number],
      onClick: () => void,
      lngLat?: [number, number],
    ) => {
      keepKeys.add(key);
      const existing = allMarkers.get(key);
      if (existing && markerSigs.get(key) === signature) {
        existing.setOffset(offset);
        if (lngLat) existing.setLngLat(lngLat);
        return;
      }
      if (existing) {
        existing.remove();
        allMarkers.delete(key);
      }
      const coord = lngLat ?? (() => {
        const c = provinceCoordById.get(provinceId);
        return c ? [c.lon, c.lat] as [number, number] : null;
      })();
      if (!coord) return;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coord)
        .setOffset(offset)
        .addTo(map);
      allMarkers.set(key, marker);
      markerSigs.set(key, signature);
    };

    const armyStacksByProvince = new globalThis.Map<number, Array<{ owner: number; armies: typeof snapshot.armies; regiments: number; avgStrength: number }>>();
    for (const [provinceId, armies] of armiesByProvince.entries()) {
      const byOwner = new globalThis.Map<number, typeof snapshot.armies>();
      for (const army of armies) {
        const list = byOwner.get(army.owner) ?? [];
        list.push(army);
        byOwner.set(army.owner, list);
      }
      const stacks = Array.from(byOwner.entries())
        .map(([owner, ownerArmies]) => {
          const regiments = ownerArmies.reduce((sum, army) => sum + army.regiments.length, 0);
          const avgStrength = regiments > 0
            ? ownerArmies.reduce((sum, army) => sum + army.regiments.reduce((inner, regiment) => inner + regiment.strength, 0), 0) / regiments
            : 0;
          return { owner, armies: ownerArmies, regiments, avgStrength };
        })
        .filter((stack) => stack.regiments > 0)
        .sort((a, b) => a.owner - b.owner);
      if (stacks.length > 0) armyStacksByProvince.set(provinceId, stacks);
    }
    for (const [provinceId, stacks] of armyStacksByProvince.entries()) {
      const offsets = markerOffsets(stacks.length);
      stacks.forEach((stack, index) => {
        const friendly = stack.owner === snapshot.playerNation;
        const selected = selectedArmy !== null && stack.armies.some((army) => army.id === selectedArmy);
        const candidate = stack.armies.find((army) => army.owner === snapshot.playerNation) ?? stack.armies[0];
        const pct = Math.round((stack.avgStrength / 1000) * 100);
        const ownerName = snapshot.nations.find((nation) => nation.id === stack.owner)?.name ?? `${stack.owner}`;
        const key = `army-${provinceId}-${stack.owner}`;
        const offset = offsets[index] ?? [0, 0];
        const signature = `army|${provinceId}|${stack.owner}|${stack.regiments}|${pct}|${friendly ? 1 : 0}|${selected ? 1 : 0}|${candidate.id}|${offset[0]},${offset[1]}`;
        upsertMarker(
          key,
          signature,
          provinceId,
          createUnitCounterElement({
            kind: 'army',
            count: stack.regiments,
            strengthPct: pct,
            color: ownerColorById.get(stack.owner),
            friendly,
            selected,
            title: `${ownerName} army — ${stack.regiments} regiment${stack.regiments === 1 ? '' : 's'}, ${pct}% strength`,
          }),
          offset,
          () => {
            setSelectedArmy(candidate.id);
            openPanelId('military');
          },
        );
      });
    }

    const fleetStacksByProvince = new globalThis.Map<number, Array<{ owner: number; fleets: typeof snapshot.fleets; ships: number; avgStrength: number }>>();
    for (const [provinceId, fleets] of fleetsByProvince.entries()) {
      const byOwner = new globalThis.Map<number, typeof snapshot.fleets>();
      for (const fleet of fleets) {
        const list = byOwner.get(fleet.owner) ?? [];
        list.push(fleet);
        byOwner.set(fleet.owner, list);
      }
      const stacks = Array.from(byOwner.entries())
        .map(([owner, ownerFleets]) => {
          const ships = ownerFleets.reduce((sum, fleet) => sum + fleet.ships.length, 0);
          const avgStrength = ships > 0
            ? ownerFleets.reduce((sum, fleet) => sum + fleet.ships.reduce((inner, ship) => inner + ship.strength, 0), 0) / ships
            : 0;
          return { owner, fleets: ownerFleets, ships, avgStrength };
        })
        .filter((stack) => stack.ships > 0)
        .sort((a, b) => a.owner - b.owner);
      if (stacks.length > 0) fleetStacksByProvince.set(provinceId, stacks);
    }
    for (const [provinceId, stacks] of fleetStacksByProvince.entries()) {
      const offsets = markerOffsets(stacks.length).map(([x, y]) => [x, y + 38] as [number, number]);
      stacks.forEach((stack, index) => {
        const friendly = stack.owner === snapshot.playerNation;
        const selected = selectedFleet !== null && stack.fleets.some((fleet) => fleet.id === selectedFleet);
        const candidate = stack.fleets.find((fleet) => fleet.owner === snapshot.playerNation) ?? stack.fleets[0];
        const pct = Math.round((stack.avgStrength / 100) * 100);
        const ownerName = snapshot.nations.find((nation) => nation.id === stack.owner)?.name ?? `${stack.owner}`;
        const key = `fleet-${provinceId}-${stack.owner}`;
        const offset = offsets[index] ?? [0, 38];
        const signature = `fleet|${provinceId}|${stack.owner}|${stack.ships}|${pct}|${friendly ? 1 : 0}|${selected ? 1 : 0}|${candidate.id}|${offset[0]},${offset[1]}`;
        upsertMarker(
          key,
          signature,
          provinceId,
          createUnitCounterElement({
            kind: 'fleet',
            count: stack.ships,
            strengthPct: pct,
            color: ownerColorById.get(stack.owner),
            friendly,
            selected,
            title: `${ownerName} fleet — ${stack.ships} ship${stack.ships === 1 ? '' : 's'}, ${pct}% strength`,
          }),
          offset,
          () => {
            setSelectedFleet(candidate.id);
            openPanelId('military');
          },
        );
      });
    }

    const hasHostilePair = (owners: number[]): boolean => {
      for (let i = 0; i < owners.length; i++) {
        const enemies = enemyByNation.get(owners[i]);
        if (!enemies) continue;
        for (let j = i + 1; j < owners.length; j++) {
          if (enemies.has(owners[j])) return true;
        }
      }
      return false;
    };

    for (const [provinceId, armies] of armiesByProvince.entries()) {
      const owners = Array.from(new Set(armies.filter((army) => !army.rebel).map((army) => army.owner)));
      if (!hasHostilePair(owners)) continue;
      const key = `battle-${provinceId}`;
      upsertMarker(key, key, provinceId, createSealElement('battle', 'Battle underway'), [0, 0], () => {
        openPanelId('military');
        selectProvince(provinceId);
      });
    }

    for (const [provinceId, fleets] of fleetsByProvince.entries()) {
      const province = provinceById.get(provinceId);
      if (!province || !WORLD_SEED.provinces[provinceId]?.coastal) continue;
      const owner = province.owner;
      const ownerFleetPower = fleets
        .filter((fleet) => fleet.owner === owner)
        .reduce((sum, fleet) => sum + fleet.ships.length, 0);
      const hostileFleetPower = fleets
        .filter((fleet) => (enemyByNation.get(owner)?.has(fleet.owner) ?? false))
        .reduce((sum, fleet) => sum + fleet.ships.filter((ship) => ship.type !== 'transport').length, 0);
      if (hostileFleetPower <= ownerFleetPower) continue;
      const key = `blockade-${provinceId}`;
      upsertMarker(key, key, provinceId, createSealElement('blockade', 'Port under blockade'), [0, -20], () => {
        openPanelId('military');
        selectProvince(provinceId);
      });
    }

    for (const province of snapshot.provinces) {
      if (province.occupation <= 0 || province.controller === province.owner) continue;
      const key = `siege-${province.id}`;
      upsertMarker(key, key, province.id, createSealElement('siege', 'Under siege'), [0, -26], () => {
        openPanelId('military');
        selectProvince(province.id);
      });
    }

    for (const province of snapshot.provinces) {
      if (province.controller !== -1) continue;
      const key = `rebel-${province.id}`;
      upsertMarker(key, key, province.id, createSealElement('rebel', 'Rebel-held'), [0, -26], () => {
        openPanelId('military');
        selectProvince(province.id);
      });
    }

    const movementEntries = new globalThis.Map<string, {
      from: number;
      to: number;
      owner: number;
      width: number;
      opacity: number;
    }>();
    for (const army of snapshot.armies) {
      if (army.moveTarget < 0 || army.regiments.length === 0) continue;
      const key = `a-${army.owner}-${army.location}-${army.moveTarget}`;
      movementEntries.set(key, {
        from: army.location,
        to: army.moveTarget,
        owner: army.owner,
        width: army.owner === snapshot.playerNation ? 2.8 : 2.2,
        opacity: army.owner === snapshot.playerNation ? 0.86 : 0.62,
      });
    }
    for (const fleet of snapshot.fleets) {
      if (fleet.moveTarget < 0 || fleet.ships.length === 0) continue;
      const key = `f-${fleet.owner}-${fleet.location}-${fleet.moveTarget}`;
      movementEntries.set(key, {
        from: fleet.location,
        to: fleet.moveTarget,
        owner: fleet.owner,
        width: fleet.owner === snapshot.playerNation ? 2.6 : 2,
        opacity: fleet.owner === snapshot.playerNation ? 0.82 : 0.58,
      });
    }
    const movementFeatures = Array.from(movementEntries.values()).flatMap((entry) => {
      const from = provinceCoordById.get(entry.from);
      const to = provinceCoordById.get(entry.to);
      if (!from || !to) return [];
      const color = ownerColorById.get(entry.owner) ?? '#4f3a2b';
      const arrowKey = `arrow-${entry.owner}-${entry.from}-${entry.to}-${entry.width}`;
      const mid: [number, number] = [(from.lon + to.lon) / 2, (from.lat + to.lat) / 2];
      const el = document.createElement('div');
      el.className = 'grand-map__arrow';
      el.style.color = color;
      el.style.transform = `rotate(${bearingDegrees(from, to)}deg)`;
      upsertMarker(arrowKey, `${arrowKey}|${color}|${mid[0]},${mid[1]}`, entry.from, el, [0, 0], () => {}, mid);
      return [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
        },
        properties: {
          color,
          width: entry.width,
          opacity: entry.opacity,
        },
      }];
    });
    movementSource?.setData({
      type: 'FeatureCollection',
      features: movementFeatures,
    });

    for (const [key, marker] of allMarkers.entries()) {
      if (keepKeys.has(key)) continue;
      marker.remove();
      allMarkers.delete(key);
      markerSigs.delete(key);
    }
  }, [
    nationColorById,
    openPanelId,
    provinceCoordById,
    selectProvince,
    selectedArmy,
    selectedFleet,
    setSelectedArmy,
    setSelectedFleet,
    snapshot,
  ]);

  // Unmount-only teardown for unit/seal markers (diffing lives across snapshot updates).
  useEffect(() => () => {
    for (const marker of markerRef.current.values()) marker.remove();
    markerRef.current.clear();
    markerSigRef.current.clear();
    const map = mapRef.current;
    const movementSource = map?.getSource(MAP_MOVEMENT_SOURCE) as
      | { setData: (data: object) => void }
      | undefined;
    movementSource?.setData({ type: 'FeatureCollection', features: [] });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MAP_HOVER_LAYER)) return;
    if (selectedRef.current !== null && selectedRef.current !== selectedProvince) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: selectedRef.current }, { selected: false });
    }
    if (selectedProvince !== null) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: selectedProvince }, { selected: true });
      selectedRef.current = selectedProvince;
      return;
    }
    selectedRef.current = null;
  }, [selectedProvince]);

  return (
    <div ref={containerRef} className="grand-map" data-coach-id="world-map">
      {tooltip ? (
        <div
          className="grand-map__tooltip atlas-panel"
          style={{ left: tooltip.x + 12, top: tooltip.y + 14 }}
        >
          <strong>{tooltip.name}</strong>
          <span>{tooltip.owner}</span>
          <span>Pop {tooltip.population.toLocaleString()}</span>
        </div>
      ) : null}
    </div>
  );
}
