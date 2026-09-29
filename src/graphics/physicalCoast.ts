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
/** RGBA: political ID in R/A, physical land coverage in G. IDs are never rewritten. */
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
  return pixels;
}
