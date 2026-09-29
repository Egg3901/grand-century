import { unzlibSync } from "fflate";

export interface PackedTerrain {
  size: number;
  provinceSize: number;
  height: string;
  surface: string;
  province: string;
}
export interface TerrainData {
  size: number;
  provinceSize: number;
  heights: Uint16Array;
  surface: Uint8Array;
  provinces: Uint16Array;
}
export type View = { lon: number; lat: number; zoom: number };
export const MAX_LAT = 85.05112878;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export function mercator(lon: number, lat: number): [number, number] {
  return [
    (lon + 180) / 360,
    (1 -
      Math.asinh(Math.tan((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180)) /
        Math.PI) /
      2,
  ];
}
export function geographic(x: number, y: number): [number, number] {
  return [
    x * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  ];
}
function decode(s: string): Uint8Array {
  // Hermes and browsers share this decoder; no Node Buffer or DOM dependency.
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let acc = 0,
    bits = 0,
    cursor = 0;
  for (let i = 0; i < s.length; i++) {
    const v = table[s.charCodeAt(i)];
    if (v === undefined || v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[cursor++] = (acc >> bits) & 255;
    }
  }
  return unzlibSync(out.subarray(0, cursor));
}
export function unpackTerrain(p: PackedTerrain): TerrainData {
  const h = decode(p.height),
    surface = decode(p.surface),
    ids = decode(p.province);
  if (
    h.length !== p.size ** 2 * 2 ||
    ids.length !== p.provinceSize ** 2 * 2 ||
    surface.length !== p.size ** 2 * 4
  )
    throw new Error("Invalid terrain atlas");
  return {
    size: p.size,
    provinceSize: p.provinceSize,
    heights: new Uint16Array(h.buffer, h.byteOffset, h.byteLength / 2),
    surface,
    provinces: new Uint16Array(ids.buffer, ids.byteOffset, ids.byteLength / 2),
  };
}
export function pixelAt(data: TerrainData, x: number, y: number): number {
  return (
    clamp(Math.floor(y * data.size), 0, data.size - 1) * data.size +
    clamp(Math.floor(x * data.size), 0, data.size - 1)
  );
}
export function provinceAt(
  data: TerrainData,
  lon: number,
  lat: number,
): number | null {
  if (lon < -180 || lon > 180 || Math.abs(lat) > MAX_LAT) return null;
  const [x, y] = mercator(lon, lat);
  const id =
    data.provinces[
      clamp(Math.floor(y * data.provinceSize), 0, data.provinceSize - 1) *
        data.provinceSize +
        clamp(Math.floor(x * data.provinceSize), 0, data.provinceSize - 1)
    ];
  return id ? id - 1 : null;
}
export function elevation(data: TerrainData, x: number, y: number): number {
  const fx = clamp(x * data.size - 0.5, 0, data.size - 1),
    fy = clamp(y * data.size - 0.5, 0, data.size - 1);
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    nx = Math.min(ix + 1, data.size - 1),
    ny = Math.min(iy + 1, data.size - 1);
  const a = fx - ix,
    b = fy - iy;
  return (
    (data.heights[iy * data.size + ix] * (1 - a) +
      data.heights[iy * data.size + nx] * a) *
      (1 - b) +
    (data.heights[ny * data.size + ix] * (1 - a) +
      data.heights[ny * data.size + nx] * a) *
      b
  );
}
/** A fixed triangle budget independent of atlas size and number of provinces. */
export const MESH_SEGMENTS = 128;
export const TERRAIN_EXAGGERATION = 12;
export function terrainHeight(data: TerrainData, x: number, y: number): number {
  const lat = (geographic(x, y)[1] * Math.PI) / 180;
  return (
    (elevation(data, x, y) / (40075016.686 * Math.max(0.12, Math.cos(lat)))) *
    TERRAIN_EXAGGERATION
  );
}
export function normalizeView(v: View): View {
  return {
    lon: clamp(v.lon, -179, 179),
    lat: clamp(v.lat, -78, 78),
    zoom: clamp(v.zoom, 1.2, 6),
  };
}
