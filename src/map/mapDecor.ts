/**
 * mapDecor — procedural visual assets + palettes for the 0.5.1 atlas overhaul.
 *
 * Everything here is generated at runtime (no network, no bundled binaries) and
 * is purely visual: the engraved-sea tile, terrain hachure/stipple tiles, the
 * sea graticule, ocean lettering seeds, and the shared antique-atlas palette.
 *
 * Design rule: every effect must read as *printed* — engraving strokes, plate
 * shadows, aquatint washes — never as a "web glow".
 */

/** Sea ground: deeper than the land paper so continents lift off the page. */
export const SEA_BASE = '#cdbc95';
/** Opaque paper under province fills — masks all sea decor beneath land. */
export const LAND_PAPER = '#ecdfbc';
/** Plate shadow the landmass casts onto the sea (offset SE). */
export const LAND_SHADOW = '#402f1c';
/** Soft aquatint ink hugging the coasts (blurred, sea side only). */
export const COAST_GLOW = '#5d4530';
/** Crisp coastline stroke. */
export const COAST_INK = '#4c3826';
/** Waterline rings (classic engraved coastal ripples). */
export const WATERLINE_INK = '#6e553c';
/** Sea graticule rules. */
export const GRATICULE_INK = '#5d4732';

/** National border inks. */
export const NATION_BORDER_INK = '#2c1e12';
export const NATION_BORDER_BAND = '#2a1b0e';
/** Province border ink (fine, warm sepia). */
export const PROVINCE_BORDER_INK = '#6a4e36';

/** Hand-tint wash per terrain class — desaturated so nation colors dominate. */
export const TERRAIN_TINTS: Record<string, string> = {
  farmland: '#a2ad72',
  plains: '#b1a572',
  forest: '#71875e',
  jungle: '#5c8257',
  desert: '#d1b47c',
  mountains: '#8b8076',
  arctic: '#ded9c9',
};

/** How strongly terrain bleeds into political/military fills (0..1). */
export const TERRAIN_TINT_STRENGTH = 0.2;

/**
 * Full-strength biome pigments for the Terrain mapmode — a hand-tinted
 * physical plate. Richer than TERRAIN_TINTS (which only underpaints political
 * fills) but still mixed toward parchment so the sheet reads as printed.
 */
export const TERRAIN_BIOME_COLORS: Record<string, string> = {
  farmland: '#a3aa68',
  plains: '#c2ae74',
  forest: '#67865a',
  jungle: '#49764e',
  hills: '#ab9a70',
  mountains: '#8b7f72',
  desert: '#dcc088',
  marsh: '#84957a',
  arctic: '#e9e4d3',
  coast: '#c8c393',
  ocean: '#cdbc95',
};

/** Display order + labels for the Terrain-mapmode legend. */
export const TERRAIN_LEGEND_ORDER: Array<{ key: string; label: string }> = [
  { key: 'farmland', label: 'Farmland' },
  { key: 'plains', label: 'Plains' },
  { key: 'forest', label: 'Forest' },
  { key: 'jungle', label: 'Jungle' },
  { key: 'hills', label: 'Hills' },
  { key: 'desert', label: 'Desert' },
  { key: 'marsh', label: 'Marsh' },
  { key: 'mountains', label: 'Mountains' },
  { key: 'arctic', label: 'Arctic' },
];

/** Ocean lettering — spaced italic caps, the classic atlas convention. */
export const OCEAN_LABELS: Array<{ name: string; lon: number; lat: number; size: number }> = [
  { name: 'Pacific Ocean', lon: -145, lat: 12, size: 1 },
  { name: 'Atlantic Ocean', lon: -38, lat: 30, size: 1 },
  { name: 'Indian Ocean', lon: 79, lat: -23, size: 1 },
  { name: 'South Atlantic', lon: -16, lat: -33, size: 0.82 },
  { name: 'South Pacific', lon: -118, lat: -30, size: 0.82 },
];

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

/** Mix two #rrggbb colors; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  let out = '#';
  for (let i = 0; i < 3; i += 1) {
    const value = Math.round(channel(a, i) * (1 - clamped) + channel(b, i) * clamped);
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}

/** Tiny deterministic PRNG so pattern tiles are stable across sessions. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeTileContext(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  return { canvas, ctx };
}

/**
 * Engraved-sea tile: fine staggered wave strokes in sepia ink on a transparent
 * ground — the 19th-century "engraved water" convention. Tiled by MapLibre as
 * a `background-pattern` over the flat sea ground.
 */
export function createSeaEngravingTile(size = 256): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rows = 13;
  const rowGap = size / rows;
  for (let row = 0; row < rows; row += 1) {
    // Stagger phase + amplitude per row so tiling never reads as a grid.
    const phase = (row % 2 === 0 ? 0 : Math.PI) + row * 1.7;
    const baseY = rowGap * (row + 0.5);
    const amplitude = 1.0 + (row % 3) * 0.4;
    const alpha = 0.26 + (row % 4) * 0.04;
    ctx.strokeStyle = `rgba(84, 62, 38, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 2) {
      // Whole wavelengths per tile in x keep the pattern seamless.
      const y = baseY + Math.sin((x / size) * Math.PI * 6 + phase) * amplitude;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Mountain hachure tile: short diagonal engraving strokes, drawn with 3x3
 * wrap copies so the tile is seamless. Painted at low opacity over fills so
 * ranges read as relief in every mapmode.
 */
export function createHachureTile(size = 72): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rng = makeRng(0x5eed);
  ctx.lineCap = 'round';
  const strokes = 18;
  for (let i = 0; i < strokes; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const length = 6 + rng() * 8;
    const angle = -Math.PI / 4 + (rng() - 0.5) * 0.5;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    ctx.strokeStyle = `rgba(60, 44, 28, ${(0.55 + rng() * 0.25).toFixed(3)})`;
    ctx.lineWidth = 1.0 + rng() * 0.6;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - dx / 2, y + oy - dy / 2);
        ctx.lineTo(x + ox + dx / 2, y + oy + dy / 2);
        ctx.stroke();
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Desert stipple tile: sparse aquatint dots, seamless via 3x3 wrap copies. */
export function createStippleTile(size = 72): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rng = makeRng(0xd07);
  const dots = 34;
  for (let i = 0; i < dots; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 0.7 + rng() * 0.8;
    ctx.fillStyle = `rgba(106, 78, 44, ${(0.42 + rng() * 0.24).toFixed(3)})`;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Forest foliage tile: small engraved dabs (dot-pair clusters), seamless via
 * 3x3 wrap copies. Reads as woodland shading under the political wash.
 */
export function createFoliageTile(size = 72): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rng = makeRng(0xf057);
  const clusters = 14;
  ctx.lineCap = 'round';
  for (let i = 0; i < clusters; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 1.1 + rng() * 0.9;
    const alpha = 0.34 + rng() * 0.2;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        // A dab: small arc + a tick beneath — reads as an engraved tree tuft.
        ctx.strokeStyle = `rgba(52, 62, 36, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, radius, Math.PI * 0.95, Math.PI * 2.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy + radius * 0.4);
        ctx.lineTo(x + ox, y + oy + radius * 1.5);
        ctx.stroke();
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Relief tile: classic "mountain profile" marks — a peaked ridge line with
 * fine shade hachures filling the SE flank while the NW flank stays paper.
 * Tiled over mountain provinces it reads as an engraved hillshade: light from
 * the upper-left, shadow falling to the lower-right. Seamless via 3x3 wrap.
 */
export function createReliefTile(size = 96): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rng = makeRng(0x0e11ef);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const peaks = 6;
  for (let i = 0; i < peaks; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const width = 11 + rng() * 9;
    const height = 6.5 + rng() * 6;
    const lean = (rng() - 0.5) * 3;
    const ridgeAlpha = 0.5 + rng() * 0.2;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const baseLeftX = x + ox - width / 2;
        const baseRightX = x + ox + width / 2;
        const baseY = y + oy;
        const apexX = x + ox + lean;
        const apexY = baseY - height;
        // Ridge profile stroke.
        ctx.strokeStyle = `rgba(62, 46, 29, ${ridgeAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(baseLeftX, baseY);
        ctx.lineTo(apexX, apexY);
        ctx.lineTo(baseRightX, baseY);
        ctx.stroke();
        // Shade hachures on the SE flank only — the hillshade impression.
        const shades = 4;
        for (let s = 1; s <= shades; s += 1) {
          const t = s / (shades + 1);
          const startX = apexX + (baseRightX - apexX) * t;
          const startY = apexY + (baseY - apexY) * t;
          ctx.strokeStyle = `rgba(50, 36, 22, ${(0.42 - t * 0.18).toFixed(3)})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(startX - width * 0.14, startY + (baseY - startY) * 0.72 + 0.6);
          ctx.stroke();
        }
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Aquatint tile: ultra-fine engraving noise (short dashed strokes at random
 * angles) that breaks up flat vector fills. Invisible at world zoom; at
 * regional zoom it reads as the plate's tooth.
 */
export function createAquatintTile(size = 128): ImageData | null {
  const tile = makeTileContext(size);
  if (!tile) return null;
  const { ctx } = tile;
  const rng = makeRng(0xa47);
  ctx.lineCap = 'round';
  const strokes = 260;
  for (let i = 0; i < strokes; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const length = 0.8 + rng() * 2.4;
    const angle = rng() * Math.PI * 2;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    ctx.strokeStyle = `rgba(72, 52, 34, ${(0.10 + rng() * 0.14).toFixed(3)})`;
    ctx.lineWidth = 0.55 + rng() * 0.35;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - dx / 2, y + oy - dy / 2);
        ctx.lineTo(x + ox + dx / 2, y + oy + dy / 2);
        ctx.stroke();
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

type GraticuleGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'LineString'; coordinates: number[][] };
  }>;
};

/** Faint lat/lon rules over the sea — pure atlas furniture. */
export function createGraticule(stepDegrees = 15): GraticuleGeoJson {
  const features: GraticuleGeoJson['features'] = [];
  for (let lon = -180; lon <= 180; lon += stepDegrees) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[lon, -80], [lon, 84]] },
    });
  }
  for (let lat = -75; lat <= 80; lat += stepDegrees) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] },
    });
  }
  return { type: 'FeatureCollection', features };
}
