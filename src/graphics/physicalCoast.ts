import { strFromU8 } from "fflate";
import { decode } from "./terrainData";
import land from "./physical-land.json";
import lakes from "../data/generated/lakes.geo.json";
import {
  ProvinceGeometry,
  type ProvinceDetail,
  type DetailBounds,
} from "./provinceDetail";
let coast: ProvinceGeometry | undefined,
  lakeGeometry: ProvinceGeometry | undefined;
export function physicalCoast() {
  if (!coast) {
    const geometry = JSON.parse(strFromU8(decode(land.geometry))) as {
      features: ConstructorParameters<typeof ProvinceGeometry>[0];
    };
    coast = new ProvinceGeometry(geometry.features);
  }
  return coast;
}
/** RGBA: political ID in R/A, physical land coverage in G, shore proximity in B. IDs are never rewritten. */
export function* coastalDetail(
  detail: ProvinceDetail,
): Generator<void, Uint8Array> {
  const bounds: DetailBounds = detail;
  const shore = yield* physicalCoast().raster(bounds, detail.size);
  lakeGeometry ??= new ProvinceGeometry(
    lakes.features.map((f) => ({
      properties: { id: 0 },
      geometry: f.geometry,
    })),
  );
  const water = yield* lakeGeometry.raster(bounds, detail.size);
  const pixels = new Uint8Array(detail.size ** 2 * 4);
  for (let i = 0; i < detail.ids.length; i++) {
    if (i % 8192 === 0) yield;
    pixels[i * 4] = detail.ids[i] & 255;
    pixels[i * 4 + 3] = detail.ids[i] >> 8;
    pixels[i * 4 + 1] = shore.ids[i] && !water.ids[i] ? 255 : 0;
  }
  // Two bounded chamfer passes bake shore distance once for shelf color and
  // moving surf. The shader never consults political coastlines for this.
  const size = detail.size,
    distance = new Uint8Array(size * size);
  for (let i = 0; i < distance.length; i++)
    distance[i] = pixels[i * 4 + 1] ? 0 : 96;
  for (let direction = 0; direction < 2; direction++) {
    const step = direction === 0 ? 1 : -1;
    for (
      let row = direction === 0 ? 0 : size - 1;
      row >= 0 && row < size;
      row += step
    ) {
      if (row % 8 === 0) yield;
      for (
        let col = direction === 0 ? 0 : size - 1;
        col >= 0 && col < size;
        col += step
      ) {
        const i = row * size + col,
          x = col - step,
          y = row - step;
        let d = distance[i];
        if (x >= 0 && x < size) d = Math.min(d, distance[row * size + x] + 3);
        if (y >= 0 && y < size) {
          d = Math.min(d, distance[y * size + col] + 3);
          if (col > 0) d = Math.min(d, distance[y * size + col - 1] + 4);
          if (col + 1 < size) d = Math.min(d, distance[y * size + col + 1] + 4);
        }
        distance[i] = d;
      }
    }
  }
  for (let i = 0; i < distance.length; i++) {
    if (i % 8192 === 0) yield;
    pixels[i * 4 + 2] = Math.round((1 - distance[i] / 96) * 255);
  }
  return pixels;
}
