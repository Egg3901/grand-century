import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './GrandMap.css';
import { PROVINCES_GEOJSON, WORLD_SEED } from '../data/generated';
import { useStore } from '../store';

const MAP_SOURCE_ID = 'provinces';
const MAP_FILL_LAYER = 'province-fill';
const MAP_PROVINCE_LINE_LAYER = 'province-line';
const MAP_NATIONAL_LINE_LAYER = 'nation-line';
const MAP_HOVER_LAYER = 'province-hover';
const DEFAULT_FILL = '#b7a486';
const DIPLO_COLORS = {
  self: '#6f879f',
  ally: '#7c9472',
  atWar: '#8e5a52',
  neutral: '#b5a27f',
};

function toHexColor(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((value) => Math.max(0, Math.min(255, Math.round(value)))) as [number, number, number];
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function muteColor(rgb: [number, number, number]): string {
  const parchment: [number, number, number] = [232, 220, 192];
  const mixed: [number, number, number] = [
    parchment[0] * 0.5 + rgb[0] * 0.5,
    parchment[1] * 0.5 + rgb[1] * 0.5,
    parchment[2] * 0.5 + rgb[2] * 0.5,
  ];
  return toHexColor(mixed);
}

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

function computeBounds() {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const feature of PROVINCES_GEOJSON.features) {
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
  return [[minLon, minLat], [maxLon, maxLat]] as [[number, number], [number, number]];
}

export function GrandMap() {
  const snapshot = useStore((state) => state.snapshot);
  const mapMode = useStore((state) => state.mapMode);
  const selectProvince = useStore((state) => state.selectProvince);
  const selectedProvince = useStore((state) => state.selectedProvince);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const fillRef = useRef<Map<number, string>>(new globalThis.Map());
  const frontierRef = useRef<Map<number, number>>(new globalThis.Map());
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

  const provinceSeedById = useMemo(() => (
    new globalThis.Map<number, { neighbors: number[] }>(WORLD_SEED.provinces.map((province) => [province.id, { neighbors: province.neighbors }]))
  ), []);

  const bounds = useMemo(() => computeBounds(), []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{
          id: 'paper-background',
          type: 'background',
          paint: { 'background-color': '#ddcfb1' },
        }],
      },
      center: [0, 18],
      zoom: 1.3,
      attributionControl: false,
      maxPitch: 0,
      renderWorldCopies: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource(MAP_SOURCE_ID, {
        type: 'geojson',
        data: PROVINCES_GEOJSON as unknown as object,
      });

      map.addLayer({
        id: MAP_FILL_LAYER,
        type: 'fill',
        source: MAP_SOURCE_ID,
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'fill'], DEFAULT_FILL],
          'fill-opacity': 0.83,
        },
      });

      map.addLayer({
        id: MAP_PROVINCE_LINE_LAYER,
        type: 'line',
        source: MAP_SOURCE_ID,
        paint: {
          'line-color': '#5b4433',
          'line-width': 0.5,
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: MAP_NATIONAL_LINE_LAYER,
        type: 'line',
        source: MAP_SOURCE_ID,
        paint: {
          'line-color': '#4b3324',
          'line-width': [
            'case',
            ['==', ['feature-state', 'nationalBorder'], 1],
            1.2,
            0,
          ],
          'line-opacity': 0.88,
        },
      });

      map.addLayer({
        id: MAP_HOVER_LAYER,
        type: 'line',
        source: MAP_SOURCE_ID,
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
            2.1,
            ['boolean', ['feature-state', 'hover'], false],
            1.8,
            0,
          ],
          'line-opacity': 0.95,
        },
      });

      map.fitBounds(bounds, { padding: 30, duration: 550, maxZoom: 2.7 });
    });

    map.on('click', MAP_FILL_LAYER, (event) => {
      const clicked = event.features?.[0];
      const provinceId = Number(clicked?.properties?.id);
      if (Number.isInteger(provinceId)) selectProvince(provinceId);
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

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bounds, provinceNameById, selectProvince]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MAP_FILL_LAYER) || !snapshot) return;

    const provinceById = new globalThis.Map(snapshot.provinces.map((province) => [province.id, province]));
    const economies = snapshot.provinces.map((province) => province.economyOutput);
    const econMin = Math.min(...economies);
    const econMax = Math.max(...economies);
    const econRange = Math.max(1, econMax - econMin);

    const allies = new Set<number>();
    const enemies = new Set<number>();
    for (const war of snapshot.wars) {
      if (war.attackers.includes(snapshot.playerNation)) {
        war.attackers.forEach((nationId) => allies.add(nationId));
        war.defenders.forEach((nationId) => enemies.add(nationId));
      } else if (war.defenders.includes(snapshot.playerNation)) {
        war.defenders.forEach((nationId) => allies.add(nationId));
        war.attackers.forEach((nationId) => enemies.add(nationId));
      }
    }

    for (const province of snapshot.provinces) {
      const ownerColor = nationColorById.get(province.owner) ?? DEFAULT_FILL;
      const controllerColor = nationColorById.get(province.controller) ?? ownerColor;
      let fill = ownerColor;

      if (mapMode === 'population') {
        const needs = clamp01(province.needsMet);
        const hunger = 1 - needs;
        const red = Math.round(164 + hunger * 58);
        const green = Math.round(92 + needs * 84);
        const blue = Math.round(78 + needs * 30);
        fill = toHexColor([red, green, blue]);
      } else if (mapMode === 'economy') {
        const econScaled = clamp01((province.economyOutput - econMin) / econRange);
        fill = blend('#5b7c72', 0.6 - econScaled * 0.5);
      } else if (mapMode === 'military') {
        fill = province.controller !== province.owner ? blend(controllerColor, 0.14) : blend(ownerColor, 0.32);
      } else if (mapMode === 'diplomatic') {
        if (province.owner === snapshot.playerNation) fill = DIPLO_COLORS.self;
        else if (enemies.has(province.owner)) fill = DIPLO_COLORS.atWar;
        else if (allies.has(province.owner)) fill = DIPLO_COLORS.ally;
        else fill = DIPLO_COLORS.neutral;
      }

      const prevFill = fillRef.current.get(province.id);
      if (prevFill !== fill) {
        map.setFeatureState({ source: MAP_SOURCE_ID, id: province.id }, { fill });
        fillRef.current.set(province.id, fill);
      }

      const seed = provinceSeedById.get(province.id);
      const isNationalBorder = seed?.neighbors.some((neighborId) => {
        const neighbor = provinceById.get(neighborId);
        return neighbor && neighbor.owner !== province.owner;
      }) ? 1 : 0;
      const prevFrontier = frontierRef.current.get(province.id);
      if (prevFrontier !== isNationalBorder) {
        map.setFeatureState({ source: MAP_SOURCE_ID, id: province.id }, { nationalBorder: isNationalBorder });
        frontierRef.current.set(province.id, isNationalBorder);
      }
    }
  }, [mapMode, nationColorById, provinceSeedById, snapshot]);

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
    <div ref={containerRef} className="grand-map">
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
