import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './GrandMap.css';
import { PROVINCE_FEATURES } from '../data/geometry';
import { useStore } from '../store';

const MAP_SOURCE_ID = 'provinces';
const MAP_FILL_LAYER = 'province-fill';
const MAP_LINE_LAYER = 'province-line';
const DEFAULT_FILL = '#b7a486';

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

export function GrandMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const snapshot = useStore((state) => state.snapshot);
  const mapMode = useStore((state) => state.mapMode);
  const selectProvince = useStore((state) => state.selectProvince);
  const selectedProvince = useStore((state) => state.selectedProvince);

  const nationColorById = useMemo(() => {
    const colors = new globalThis.Map<number, string>();
    if (!snapshot) return colors;
    for (const nation of snapshot.nations) colors.set(nation.id, muteColor(nation.color));
    return colors;
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
          paint: { 'background-color': '#e8dcc0' },
        }],
      },
      center: [0, 18],
      zoom: 1.05,
      attributionControl: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource(MAP_SOURCE_ID, {
        type: 'geojson',
        data: PROVINCE_FEATURES as unknown as object,
      });

      map.addLayer({
        id: MAP_FILL_LAYER,
        type: 'fill',
        source: MAP_SOURCE_ID,
        paint: {
          'fill-color': DEFAULT_FILL,
          'fill-opacity': 0.83,
        },
      });

      map.addLayer({
        id: MAP_LINE_LAYER,
        type: 'line',
        source: MAP_SOURCE_ID,
        paint: {
          'line-color': '#5b4433',
          'line-width': 0.7,
          'line-opacity': 0.7,
        },
      });
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
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [selectProvince]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MAP_FILL_LAYER) || !snapshot) return;

    const colorExpression: unknown[] = ['match', ['get', 'id']];
    for (const province of snapshot.provinces) {
      const nationColor = nationColorById.get(province.owner) ?? DEFAULT_FILL;
      const popTone = Math.max(120, Math.min(225, 225 - Math.floor(Math.log10(Math.max(1, province.population)) * 28)));
      const milTone = Math.max(60, Math.min(180, 180 - Math.floor(clamp01(province.militancy / 10) * 90)));

      let color = nationColor;
      if (mapMode === 'population') color = `rgb(${popTone}, ${popTone - 8}, ${popTone - 22})`;
      if (mapMode === 'military') color = `rgb(${milTone + 25}, ${milTone}, ${milTone - 10})`;
      if (mapMode === 'diplomatic') color = nationColorById.get(province.controller) ?? nationColor;
      if (mapMode === 'economy') {
        const key = province.rgoGood % 5;
        color = ['#b6a87f', '#a4937d', '#8f8e78', '#8ea58d', '#8a8caa'][key];
      }
      colorExpression.push(province.id, color);
    }
    colorExpression.push(DEFAULT_FILL);

    map.setPaintProperty(MAP_FILL_LAYER, 'fill-color', colorExpression);
  }, [snapshot, mapMode, nationColorById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MAP_LINE_LAYER)) return;
    if (selectedProvince === null) {
      map.setPaintProperty(MAP_LINE_LAYER, 'line-width', 0.7);
      map.setPaintProperty(MAP_LINE_LAYER, 'line-color', '#5b4433');
      return;
    }
    map.setPaintProperty(MAP_LINE_LAYER, 'line-width', [
      'match',
      ['get', 'id'],
      selectedProvince,
      2.1,
      0.7,
    ]);
    map.setPaintProperty(MAP_LINE_LAYER, 'line-color', [
      'match',
      ['get', 'id'],
      selectedProvince,
      '#21150d',
      '#5b4433',
    ]);
  }, [selectedProvince]);

  return <div ref={containerRef} className="grand-map" />;
}
