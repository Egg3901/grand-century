import { unzlibSync } from "fflate";
import { clamp, decode, elevation, type TerrainData } from "./terrainData";

export type HeightTile = {
  z: number;
  x: number;
  y: number;
  heights: Uint16Array;
};
export type HeightRegion = {
  z: number;
  x: number;
  y: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  heights: Uint16Array;
  loadedTiles: number;
  sourceZoom: number;
};
export type HeightPlan = Omit<
  HeightRegion,
  "heights" | "loadedTiles" | "sourceZoom"
>;
export const TILE_SIZE = 256;
export const TERRAIN_TILE_SOURCE =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const yieldThread = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Narrow decoder for the provider's 8-bit RGB/RGBA non-interlaced Terrarium PNGs. */
export async function decodeTerrarium(bytes: Uint8Array): Promise<Uint16Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 33 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a
  )
    throw new Error("Invalid terrain PNG");
  if (
    view.getUint32(16) !== 256 ||
    view.getUint32(20) !== 256 ||
    bytes[24] !== 8 ||
    ![2, 6].includes(bytes[25]) ||
    bytes[26] ||
    bytes[27] ||
    bytes[28]
  )
    throw new Error("Unsupported terrain PNG");
  const channels = bytes[25] === 2 ? 3 : 4;
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const size = view.getUint32(offset),
      type = view.getUint32(offset + 4);
    if (size > 1024 * 1024 || offset + size + 12 > bytes.length)
      throw new Error("Truncated terrain PNG");
    if (type === 0x49444154) {
      const chunk = bytes.subarray(offset + 8, offset + 8 + size);
      chunks.push(chunk);
      length += size;
    }
    offset += size + 12;
    if (type === 0x49454e44) break;
  }
  if (!length || length > 1024 * 1024)
    throw new Error("Invalid terrain payload");
  const compressed = new Uint8Array(length);
  let cursor = 0;
  for (const c of chunks) {
    compressed.set(c, cursor);
    cursor += c.length;
  }
  const stride = 256 * channels;
  const raw = unzlibSync(compressed, {
    out: new Uint8Array((stride + 1) * 256),
  });
  if (raw.length !== (stride + 1) * 256)
    throw new Error("Invalid terrain scanlines");
  const pixels = new Uint8Array(stride * 256),
    heights = new Uint16Array(256 * 256);
  for (let y = 0; y < 256; y++) {
    if (y % 16 === 0) await yieldThread();
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner =
        y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner,
          a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      pixels[y * stride + x] =
        (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
    for (let x = 0; x < 256; x++) {
      const i = y * stride + x * channels;
      heights[y * 256 + x] = Math.max(
        0,
        pixels[i] * 256 + pixels[i + 1] - 32768,
      );
    }
  }
  return heights;
}

export function tilePlan(
  x: number,
  y: number,
  ex: number,
  ey: number,
  zoom: number,
): HeightPlan {
  // At most 8x8 tiles, independent of device pixel ratio or world extent.
  let z = clamp(Math.floor(zoom) + 1, 5, 8);
  while (
    z > 0 &&
    (Math.ceil(ex * 2 * 2 ** z) + 2 > 8 || Math.ceil(ey * 2 * 2 ** z) + 2 > 8)
  )
    z--;
  const n = 2 ** z,
    left = clamp(Math.floor((x - ex) * n), 0, n - 1),
    top = clamp(Math.floor((y - ey) * n), 0, n - 1);
  const columns = Math.min(8, n - left, Math.ceil((x + ex) * n) - left + 1),
    rows = Math.min(8, n - top, Math.ceil((y + ey) * n) - top + 1);
  return {
    z,
    x: left,
    y: top,
    columns,
    rows,
    width: columns * 256,
    height: rows * 256,
  };
}
export function detailSpacingMeters(z: number, lat: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);
}
export function regionElevation(
  region: HeightRegion,
  x: number,
  y: number,
): number | null {
  const n = 2 ** region.z,
    u = (x * n - region.x) * 256 - 0.5,
    v = (y * n - region.y) * 256 - 0.5;
  if (u < 0 || v < 0 || u > region.width - 1 || v > region.height - 1)
    return null;
  const ix = Math.floor(u),
    iy = Math.floor(v),
    nx = Math.min(ix + 1, region.width - 1),
    ny = Math.min(iy + 1, region.height - 1),
    a = u - ix,
    b = v - iy,
    h = region.heights;
  return (
    (h[iy * region.width + ix] * (1 - a) + h[iy * region.width + nx] * a) *
      (1 - b) +
    (h[ny * region.width + ix] * (1 - a) + h[ny * region.width + nx] * a) * b
  );
}
export type TileResult = { heights: Uint16Array; sourceZoom: number };
export type TileLoader = (
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
) => Promise<TileResult>;
const cache = new Map<string, TileResult>();
let offline: Record<string, string> | null = null;
export function installOfflineTerrain(tiles: Record<string, string>) {
  offline = tiles;
}
let persistent: {
  read: (key: string) => Promise<Uint8Array | null>;
  write: (key: string, bytes: Uint8Array) => Promise<void>;
} | null = null;
export function installTerrainCache(value: typeof persistent) {
  persistent = value;
}
export const loadTerrainTile: TileLoader = async (z, x, y, signal) => {
  if (signal.aborted) throw new Error("Terrain request cancelled");
  const key = `${z}/${x}/${y}`,
    hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  let result: TileResult | null = null;
  // Bundled parent tiles remain available offline and report their real source
  // resolution. Upsampling never masquerades as newly acquired detail.
  for (let parent = z; parent >= 5; parent--) {
    const scale = 2 ** (z - parent),
      px = Math.floor(x / scale),
      py = Math.floor(y / scale);
    const encoded = offline?.[`${parent}/${px}/${py}`];
    if (!encoded) continue;
    const bytes = decode(encoded);
    if (bytes.byteLength !== 256 * 256 * 2)
      throw new Error("Invalid offline terrain tile");
    const original = new Uint16Array(bytes.buffer, bytes.byteOffset, 256 * 256);
    if (parent === z) result = { heights: original, sourceZoom: parent };
    else {
      const heights = new Uint16Array(256 * 256),
        ox = ((x % scale) * 256) / scale,
        oy = ((y % scale) * 256) / scale;
      for (let row = 0; row < 256; row++) {
        if (row % 16 === 0) await yieldThread();
        const v = clamp(oy + (row + 0.5) / scale - 0.5, 0, 255),
          iy = Math.floor(v),
          ny = Math.min(255, iy + 1),
          fy = v - iy;
        for (let col = 0; col < 256; col++) {
          const u = clamp(ox + (col + 0.5) / scale - 0.5, 0, 255),
            ix = Math.floor(u),
            nx = Math.min(255, ix + 1),
            fx = u - ix;
          heights[row * 256 + col] =
            (original[iy * 256 + ix] * (1 - fx) +
              original[iy * 256 + nx] * fx) *
              (1 - fy) +
            (original[ny * 256 + ix] * (1 - fx) +
              original[ny * 256 + nx] * fx) *
              fy;
        }
      }
      result = { heights, sourceZoom: parent };
    }
    break;
  }
  if (!result) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = (await persistent?.read(key)) ?? null;
    } catch {
      /* A cache failure must not hide the map. */
    }
    if (!bytes) {
      const request = new AbortController(),
        cancel = () => request.abort();
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 6000);
      try {
        if (signal.aborted) throw new Error("Terrain request cancelled");
        const response = await fetch(`${TERRAIN_TILE_SOURCE}/${key}.png`, {
          signal: request.signal,
        });
        if (!response.ok) throw new Error("Terrain detail unavailable");
        bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 1024 * 1024)
          throw new Error("Terrain tile too large");
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
    }
    result = { heights: await decodeTerrarium(bytes), sourceZoom: z };
    if (!signal.aborted) void persistent?.write(key, bytes).catch(() => {});
  }
  if (signal.aborted) throw new Error("Terrain request cancelled");
  cache.set(key, result);
  while (cache.size > 96) cache.delete(cache.keys().next().value!);
  return result;
};

/** Assemble off the gesture path. Missing tiles retain the bundled base map. */
export async function loadHeightRegion(
  plan: HeightPlan,
  base: TerrainData,
  signal: AbortSignal,
  loader: TileLoader = loadTerrainTile,
): Promise<HeightRegion> {
  const heights = new Uint16Array(plan.width * plan.height),
    n = 2 ** plan.z;
  for (let row = 0; row < plan.height; row++) {
    if (row % 8 === 0) {
      if (signal.aborted) throw new Error("Terrain request cancelled");
      await yieldThread();
    }
    for (let col = 0; col < plan.width; col++)
      heights[row * plan.width + col] = elevation(
        base,
        (plan.x + (col + 0.5) / 256) / n,
        (plan.y + (row + 0.5) / 256) / n,
      );
  }
  const jobs = Array.from({ length: plan.columns * plan.rows }, (_, i) => ({
    col: i % plan.columns,
    row: Math.floor(i / plan.columns),
  }));
  const deadline = Date.now() + 12000;
  let cursor = 0,
    loadedTiles = 0,
    sourceZoom = plan.z;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < jobs.length && !signal.aborted && Date.now() < deadline) {
        const { col, row } = jobs[cursor++];
        try {
          const tile = await loader(plan.z, plan.x + col, plan.y + row, signal);
          if (tile.heights.length !== 256 * 256)
            throw new Error("Invalid terrain tile length");
          for (let y = 0; y < 256; y++)
            heights.set(
              tile.heights.subarray(y * 256, (y + 1) * 256),
              (row * 256 + y) * plan.width + col * 256,
            );
          loadedTiles++;
          sourceZoom = Math.min(sourceZoom, tile.sourceZoom);
        } catch {
          if (signal.aborted) throw new Error("Terrain request cancelled");
          sourceZoom = Math.min(sourceZoom, Math.log2(base.size / 256));
        }
      }
    }),
  );
  if (signal.aborted) throw new Error("Terrain request cancelled");
  if (loadedTiles < jobs.length)
    sourceZoom = Math.min(sourceZoom, Math.log2(base.size / 256));
  return { ...plan, heights, loadedTiles, sourceZoom };
}

/** Pack elevation and precomputed normals once, instead of resampling relief
 * twenty times per fragment on every animation frame. */
export async function heightPixels(
  region: HeightRegion,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const { width, height, heights } = region,
    pixels = new Uint8Array(width * height * 4),
    worldTexel = 1 / (256 * 2 ** region.z);
  for (let row = 0; row < height; row++) {
    if (row % 8 === 0) {
      if (signal.aborted) throw new Error("Terrain request cancelled");
      await yieldThread();
    }
    const y = (region.y + (row + 0.5) / 256) / 2 ** region.z,
      t = Math.PI * (1 - 2 * y);
    const metres =
      worldTexel *
      40075016.686 *
      Math.max(0.12, 2 / (Math.exp(t) + Math.exp(-t)));
    for (let col = 0; col < width; col++) {
      const i = row * width + col,
        lo = Math.max(0, col - 1),
        hi = Math.min(width - 1, col + 1),
        north = Math.max(0, row - 1),
        south = Math.min(height - 1, row + 1);
      const nx =
        (-(heights[row * width + hi] - heights[row * width + lo]) * 2.3) /
        ((hi - lo || 1) * metres);
      const ny =
        (-(heights[north * width + col] - heights[south * width + col]) * 2.3) /
        ((south - north || 1) * metres);
      const sum = Math.abs(nx) + Math.abs(ny) + 1;
      pixels[i * 4] = heights[i] & 255;
      pixels[i * 4 + 3] = heights[i] >> 8;
      pixels[i * 4 + 1] = Math.round(((nx / sum) * 0.5 + 0.5) * 255);
      pixels[i * 4 + 2] = Math.round(((ny / sum) * 0.5 + 0.5) * 255);
    }
  }
  return pixels;
}
