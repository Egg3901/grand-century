import { describe, expect, it } from "vitest";
import {
  ProvinceGeometry,
  provinceGeometry,
} from "../src/graphics/provinceDetail";
import { geographic, mercator } from "../src/graphics/terrainData";

const square = (x: number, y: number, size: number) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

describe("close-zoom province geometry", () => {
  it("keeps holes, tiny islands and shared edges consistent between fills and picking", () => {
    const shapes = new ProvinceGeometry([
      {
        properties: { id: 0 },
        geometry: {
          type: "Polygon",
          coordinates: [square(0, 0, 2), square(0.5, 0.5, 0.25)],
        },
      },
      {
        properties: { id: 1 },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[square(2, 0, 2)], [square(-0.08, 0.3, 0.02)]],
        },
      },
    ]);
    expect(shapes.at(0.6, 0.6)).toBeNull();
    expect(shapes.at(-0.07, 0.31)).toBe(1);
    expect(shapes.at(1.999, 1)).toBe(0);
    expect(shapes.at(2.001, 1)).toBe(1);
    const [x, y] = mercator(1, 1);
    const raster = shapes.raster({ x, y, ex: 0.01, ey: 0.01 }, 256);
    let next = raster.next(),
      batches = 0;
    while (!next.done) {
      batches++;
      next = raster.next();
    }
    expect(batches).toBeGreaterThan(10);
    const tile = next.value;
    for (let row = 0; row < tile.size; row += 3)
      for (let col = 0; col < tile.size; col += 3) {
        const [lon, lat] = geographic(
          x - tile.ex + ((col + 0.5) * tile.ex * 2) / tile.size,
          y - tile.ey + ((row + 0.5) * tile.ey * 2) / tile.size,
        );
        expect(tile.ids[row * tile.size + col]).toBe(
          (shapes.at(lon, lat) ?? -1) + 1,
        );
      }
  });
  it("uses the shipped polygons consistently in Britain, Canada, Germany and Italy", () => {
    const shapes = provinceGeometry();
    for (const [lon, lat] of [
      [-3, 54],
      [-73, 46],
      [10, 51],
      [10, 45],
    ]) {
      const [x, y] = mercator(lon, lat);
      const work = shapes.raster({ x, y, ex: 0.012, ey: 0.012 }, 128);
      let next = work.next();
      while (!next.done) next = work.next();
      const tile = next.value;
      for (let row = 0; row < 128; row += 5)
        for (let col = 0; col < 128; col += 5) {
          const p = geographic(
            x - 0.012 + ((col + 0.5) * 0.024) / 128,
            y - 0.012 + ((row + 0.5) * 0.024) / 128,
          );
          expect(tile.ids[row * 128 + col]).toBe((shapes.at(...p) ?? -1) + 1);
        }
    }
    expect(shapes.at(190, 45)).toBeNull();
    expect(shapes.at(0, 90)).toBeNull();
  });
});
