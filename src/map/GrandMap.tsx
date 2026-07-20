import { useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './GrandMap.css';
import { NATIONAL_BORDERS_GEOJSON, WORLD_SEED } from '../data/generated';
import { useStore } from '../store';

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
type PointLabelGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number | string;
    properties: Record<string, string | number>;
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
  }>;
};

const FALLBACK_GEOJSON_URL = new URL('../data/generated/provinces.geo.json', import.meta.url).toString();

const MAP_SOURCE_ID = 'provinces';
const MAP_NATIONAL_SOURCE_ID = 'national-borders';
const MAP_COUNTRY_LABEL_SOURCE_ID = 'country-labels';
const MAP_PROVINCE_LABEL_SOURCE_ID = 'province-labels';
const MAP_FILL_LAYER = 'province-fill';
const MAP_PROVINCE_LINE_LAYER = 'province-line';
const MAP_NATIONAL_LINE_LAYER = 'nation-line';
const MAP_HOVER_LAYER = 'province-hover';
const MAP_COUNTRY_LABEL_LAYER = 'country-label';
const MAP_PROVINCE_LABEL_LAYER = 'province-label';
const DEFAULT_FILL = '#b7a486';
const MAJOR_LABEL_TAGS = new Set(['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'QNG', 'OTT']);
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
  const markerRef = useRef<Map<string, MapLibreMarker>>(new globalThis.Map());
  const [geojson, setGeojson] = useState<ProvinceGeoJson | null>(null);
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
  const countryLabelGeojson = useMemo<PointLabelGeoJson>(() => {
    const provincesByOwner = new globalThis.Map<string, typeof WORLD_SEED.provinces>();
    for (const province of WORLD_SEED.provinces) {
      const list = provincesByOwner.get(province.ownerTag) ?? [];
      list.push(province);
      provincesByOwner.set(province.ownerTag, list);
    }
    const features: PointLabelGeoJson['features'] = [];
    for (const nation of WORLD_SEED.nations) {
      const owned = provincesByOwner.get(nation.tag) ?? [];
      if (owned.length === 0) continue;
      const sortedOwned = owned.slice().sort((a, b) => b.populationWeight - a.populationWeight || a.id - b.id);
      const anchor = sortedOwned.find((province) => province.id === nation.capitalProvinceId) ?? sortedOwned[0];
      const prominence = sortedOwned.reduce((sum, province) => sum + province.populationWeight, 0);
      features.push({
        type: 'Feature',
        id: nation.tag,
        properties: {
          name: nation.name,
          provinceCount: owned.length,
          prominence: Number(prominence.toFixed(3)),
          major: MAJOR_LABEL_TAGS.has(nation.tag) ? 1 : 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [anchor.lon, anchor.lat],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, []);
  const provinceLabelGeojson = useMemo<PointLabelGeoJson>(() => ({
    type: 'FeatureCollection',
    features: WORLD_SEED.provinces.map((province) => ({
      type: 'Feature',
      id: province.id,
      properties: {
        name: province.name,
        weight: province.populationWeight,
      },
      geometry: {
        type: 'Point',
        coordinates: [province.lon, province.lat] as [number, number],
      },
    })),
  }), []);

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
    const loadGeo = async () => {
      const candidates = [
        `${import.meta.env.BASE_URL}generated/provinces.geo.json`,
        '/generated/provinces.geo.json',
        FALLBACK_GEOJSON_URL,
      ];
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const parsed = await response.json() as ProvinceGeoJson;
          if (!alive) return;
          setGeojson(parsed);
          return;
        } catch {
          // continue to next candidate
        }
      }
    };
    void loadGeo();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !geojson) return;
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
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
        dragPan: true,
        touchZoomRotate: true,
        cooperativeGestures: false,
      });
      createdMap = map;
      mapRef.current = map;
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-right');

      map.on('load', () => {
        map.addSource(MAP_SOURCE_ID, {
          type: 'geojson',
          data: geojson as unknown as object,
        });
        map.addSource(MAP_NATIONAL_SOURCE_ID, {
          type: 'geojson',
          data: NATIONAL_BORDERS_GEOJSON as unknown as object,
        });
        map.addSource(MAP_COUNTRY_LABEL_SOURCE_ID, {
          type: 'geojson',
          data: countryLabelGeojson as unknown as object,
        });
        map.addSource(MAP_PROVINCE_LABEL_SOURCE_ID, {
          type: 'geojson',
          data: provinceLabelGeojson as unknown as object,
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
          id: MAP_NATIONAL_LINE_LAYER,
          type: 'line',
          source: MAP_NATIONAL_SOURCE_ID,
          paint: {
            'line-color': '#3d281a',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.95,
              3.5,
              1.25,
              6,
              1.7,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.83,
              3.5,
              0.92,
              7,
              0.72,
            ],
          },
        });

        map.addLayer({
          id: MAP_PROVINCE_LINE_LAYER,
          type: 'line',
          source: MAP_SOURCE_ID,
          paint: {
            'line-color': '#5b4433',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.5,
              0.2,
              5,
              0.55,
              7,
              0.9,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.4,
              0,
              4.2,
              0.22,
              5.0,
              0.66,
              7.0,
              0.82,
            ],
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

        map.addLayer({
          id: MAP_COUNTRY_LABEL_LAYER,
          type: 'symbol',
          source: MAP_COUNTRY_LABEL_SOURCE_ID,
          maxzoom: 6.2,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Serif Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              ['interpolate', ['linear'], ['get', 'provinceCount'], 1, 9, 12, 13, 24, 17],
              4.7,
              ['interpolate', ['linear'], ['get', 'provinceCount'], 1, 10, 12, 14, 24, 19],
              6.2,
              11,
            ],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.06,
            'text-max-width': 7.5,
            'text-optional': true,
          },
          paint: {
            'text-color': '#322317',
            'text-halo-color': 'rgba(238, 226, 200, 0.95)',
            'text-halo-width': 1.35,
            'text-halo-blur': 0.35,
            'text-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.9,
              4.9,
              0.88,
              5.8,
              0.24,
              6.2,
              0,
            ],
          },
        });

        map.addLayer({
          id: MAP_PROVINCE_LABEL_LAYER,
          type: 'symbol',
          source: MAP_PROVINCE_LABEL_SOURCE_ID,
          minzoom: 5.0,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Serif Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 7, 11.8, 9, 12.8],
            'text-max-width': 7,
            'text-optional': true,
          },
          paint: {
            'text-color': '#403024',
            'text-halo-color': 'rgba(242, 232, 208, 0.92)',
            'text-halo-width': 1.2,
            'text-halo-blur': 0.2,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.9, 0, 5.4, 0.65, 8.2, 0.9],
          },
        });

        if (bounds) map.fitBounds(bounds, { padding: 30, duration: 550, maxZoom: 2.7 });
      });

    map.on('click', MAP_FILL_LAYER, (event) => {
      const clicked = event.features?.[0];
      const provinceId = Number(clicked?.properties?.id);
      if (!Number.isInteger(provinceId)) return;
      if (selectedArmyRef.current !== null) {
        sendCommand({ t: 'moveArmy', army: selectedArmyRef.current, target: provinceId });
        return;
      }
      if (selectedFleetRef.current !== null) {
        sendCommand({ t: 'moveFleet', fleet: selectedFleetRef.current, target: provinceId });
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
    };
  }, [bounds, countryLabelGeojson, geojson, provinceLabelGeojson, provinceNameById, selectProvince, sendCommand]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MAP_FILL_LAYER) || !snapshot) return;

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
      }

      const prevFill = fillRef.current.get(province.id);
      if (prevFill !== fill) {
        map.setFeatureState({ source: MAP_SOURCE_ID, id: province.id }, { fill });
        fillRef.current.set(province.id, fill);
      }
    }
  }, [mapMode, nationColorById, snapshot]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !snapshot || !maplibregl) return;

    const allMarkers = markerRef.current;
    for (const marker of allMarkers.values()) marker.remove();
    allMarkers.clear();

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

    const addMarker = (key: string, provinceId: number, text: string, className: string, onClick: () => void) => {
      const coord = provinceCoordById.get(provinceId);
      if (!coord) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `grand-map__counter ${className}`;
      el.textContent = text;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coord.lon, coord.lat])
        .addTo(map);
      allMarkers.set(key, marker);
    };

    for (const [provinceId, armies] of armiesByProvince.entries()) {
      const friendly = armies.some((army) => army.owner === snapshot.playerNation);
      const selected = selectedArmy !== null && armies.some((army) => army.id === selectedArmy);
      addMarker(
        `army-${provinceId}`,
        provinceId,
        `A${armies.length}`,
        `${friendly ? 'is-friendly' : 'is-hostile'} ${selected ? 'is-selected' : ''}`.trim(),
        () => {
          const candidate = armies.find((army) => army.owner === snapshot.playerNation) ?? armies[0];
          setSelectedArmy(candidate.id);
          openPanelId('military');
        },
      );
    }

    for (const [provinceId, fleets] of fleetsByProvince.entries()) {
      const friendly = fleets.some((fleet) => fleet.owner === snapshot.playerNation);
      const selected = selectedFleet !== null && fleets.some((fleet) => fleet.id === selectedFleet);
      addMarker(
        `fleet-${provinceId}`,
        provinceId,
        `F${fleets.length}`,
        `${friendly ? 'is-friendly' : 'is-hostile'} ${selected ? 'is-selected' : ''}`.trim(),
        () => {
          const candidate = fleets.find((fleet) => fleet.owner === snapshot.playerNation) ?? fleets[0];
          setSelectedFleet(candidate.id);
          openPanelId('military');
        },
      );
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
      addMarker(`battle-${provinceId}`, provinceId, '⚔', 'is-battle', () => {
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
      addMarker(`blockade-${provinceId}`, provinceId, '⛵', 'is-blockade', () => {
        openPanelId('military');
        selectProvince(provinceId);
      });
    }

    for (const province of snapshot.provinces) {
      if (province.occupation <= 0 || province.controller === province.owner) continue;
      addMarker(`siege-${province.id}`, province.id, '🏰', 'is-siege', () => {
        openPanelId('military');
        selectProvince(province.id);
      });
    }

    return () => {
      for (const marker of allMarkers.values()) marker.remove();
      allMarkers.clear();
    };
  }, [
    openPanelId,
    provinceCoordById,
    selectProvince,
    selectedArmy,
    selectedFleet,
    setSelectedArmy,
    setSelectedFleet,
    snapshot,
  ]);

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
