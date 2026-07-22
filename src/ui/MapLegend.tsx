import { useMemo } from 'react';
import { WORLD_SEED } from '../data/generated';
import { TERRAIN_BIOME_COLORS, TERRAIN_LEGEND_ORDER } from '../map/mapDecor';
import { useStore } from '../store';

/** Biome swatches limited to terrains that actually exist in this world. */
const TERRAIN_SWATCHES: Array<{ label: string; color: string }> = (() => {
  const present = new Set<string>(WORLD_SEED.provinces.map((province) => province.terrain));
  return TERRAIN_LEGEND_ORDER
    .filter((entry) => present.has(entry.key))
    .map((entry) => ({ label: entry.label, color: TERRAIN_BIOME_COLORS[entry.key] ?? '#b7a486' }));
})();

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
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function populationColor(needs: number): string {
  const safeNeeds = Math.max(0, Math.min(1, needs));
  const hunger = 1 - safeNeeds;
  return toHexColor([
    164 + hunger * 58,
    92 + safeNeeds * 84,
    78 + safeNeeds * 30,
  ] as [number, number, number]);
}

function unrestColor(unrest: number): string {
  const safeUnrest = Math.max(0, Math.min(1, unrest));
  return toHexColor([
    136 + safeUnrest * 86,
    108 - safeUnrest * 48,
    92 - safeUnrest * 50,
  ] as [number, number, number]);
}

function economyScaleLabel(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function MapLegend() {
  const mapMode = useStore((state) => state.mapMode);
  // Only the economy legend reads live province data. Subscribing to the 8Hz
  // snapshot solely in economy mode keeps the legend from re-rendering every
  // tick in every other mode; the min/max is memoised (and a loop, not a
  // 620-arg Math.min spread).
  const economySnapshot = useStore((state) => (state.mapMode === 'economy' ? state.snapshot : null));
  const { economyMin, economyMid, economyMax } = useMemo(() => {
    const provinces = economySnapshot?.provinces;
    if (!provinces || provinces.length === 0) return { economyMin: 0, economyMid: 0, economyMax: 0 };
    let min = provinces[0].economyOutput;
    let max = provinces[0].economyOutput;
    for (const province of provinces) {
      if (province.economyOutput < min) min = province.economyOutput;
      if (province.economyOutput > max) max = province.economyOutput;
    }
    return { economyMin: min, economyMax: max, economyMid: min + (max - min) * 0.5 };
  }, [economySnapshot]);

  const mapModeTitle = mapMode.replaceAll('_', ' ');

  const swatches = mapMode === 'terrain'
    ? TERRAIN_SWATCHES
    : mapMode === 'diplomatic'
    ? [
      { label: 'Self', color: DIPLO_COLORS.self },
      { label: 'Ally', color: DIPLO_COLORS.ally },
      { label: 'Sphere', color: DIPLO_COLORS.sphere },
      { label: 'Rival', color: DIPLO_COLORS.rival },
      { label: 'At war', color: DIPLO_COLORS.atWar },
      { label: 'Neutral', color: DIPLO_COLORS.neutral },
    ]
    : mapMode === 'ruling_ideology'
      ? Object.entries(IDEOLOGY_COLORS).map(([label, color]) => ({ label, color }))
      : mapMode === 'military'
        ? [
          { label: 'Owned control', color: '#a7b792' },
          { label: 'Occupied control', color: '#8b6d5a' },
          { label: 'Battle marker', color: '#efcfb7' },
          { label: 'Blockade marker', color: '#c0d5e4' },
        ]
        : mapMode === 'cores'
          ? [
            { label: 'Owned core', color: '#4e8a5e' },
            { label: 'Unowned core', color: '#8e4d46' },
            { label: 'Non-core', color: '#b8ab90' },
          ]
          : mapMode === 'culture'
            ? [
              { label: 'Plurality culture', color: '#9d886b' },
              { label: 'High non-accepted', color: '#8a5f46' },
              { label: 'Movement heartland', color: '#8e4d46' },
            ]
          : mapMode === 'political'
            ? [
              { label: 'Nation fill', color: '#9d886b' },
              { label: 'Province border', color: '#5b4433' },
              { label: 'National border', color: '#2f2116' },
            ]
            : [];

  const scaleStops = mapMode === 'population'
    ? [
      { label: '0% met', color: populationColor(0) },
      { label: '25%', color: populationColor(0.25) },
      { label: '50%', color: populationColor(0.5) },
      { label: '75%', color: populationColor(0.75) },
      { label: '100% met', color: populationColor(1) },
    ]
    : mapMode === 'unrest'
      ? [
        { label: '0.00', color: unrestColor(0) },
        { label: '0.25', color: unrestColor(0.25) },
        { label: '0.50', color: unrestColor(0.5) },
        { label: '0.75', color: unrestColor(0.75) },
        { label: '1.00+', color: unrestColor(1) },
      ]
      : mapMode === 'economy'
        ? [
          { label: economyScaleLabel(economyMin), color: '#d8ccaf' },
          { label: economyScaleLabel(economyMid), color: '#90a092' },
          { label: economyScaleLabel(economyMax), color: '#5b7c72' },
        ]
        : [];

  return (
    <aside className="map-legend atlas-panel">
      <h3 className="atlas-heading">Legend</h3>
      <p className="map-legend__mode">{mapModeTitle[0]?.toUpperCase()}{mapModeTitle.slice(1)}</p>
      {scaleStops.length > 0 ? (
        <div className="map-legend__scale">
          <div className="map-legend__scale-bar">
            {scaleStops.map((stop) => (
              <span key={stop.label} style={{ backgroundColor: stop.color }} />
            ))}
          </div>
          <div className="map-legend__scale-labels">
            {scaleStops.map((stop) => <span key={stop.label}>{stop.label}</span>)}
          </div>
        </div>
      ) : null}
      {swatches.length > 0 ? (
        <ul className="map-legend__swatches">
          {swatches.map((swatch) => (
            <li key={swatch.label}>
              <span style={{ backgroundColor: swatch.color }} />
              <span>{swatch.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

