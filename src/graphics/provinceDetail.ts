import geometry from "../data/generated/provinces.geo.json";
import { mercator } from "./terrainData";

type Point = readonly number[];
type Polygon = Point[][];
export type DetailBounds = { x: number; y: number; ex: number; ey: number };
export type ProvinceDetail = DetailBounds & { size: number; ids: Uint16Array };
type Shape = {
  id: number;
  rings: Polygon;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Uses the same polygon authority as 2D. This improves sampling, not historical accuracy. */
export class ProvinceGeometry {
  private shapes: Shape[];
  constructor(
    features: readonly {
      id?: number;
      properties: { id: number };
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    }[],
  ) {
    this.shapes = features.flatMap((feature) => {
      const polygons =
        feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates as number[][][]]
          : (feature.geometry.coordinates as number[][][][]);
      return polygons.map((polygon) => {
        const rings = polygon.map((ring) =>
          ring.map(([lon, lat]) => mercator(lon, lat)),
        );
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const point of rings[0] ?? []) {
          minX = Math.min(minX, point[0]);
          minY = Math.min(minY, point[1]);
          maxX = Math.max(maxX, point[0]);
          maxY = Math.max(maxY, point[1]);
        }
        return {
          id: feature.id ?? feature.properties.id,
          rings,
          minX,
          minY,
          maxX,
          maxY,
        };
      });
    });
  }
  at(lon: number, lat: number): number | null {
    if (Math.abs(lon) > 180 || Math.abs(lat) > 85.05112878) return null;
    const [x, y] = mercator(lon, lat);
    // Later features win, matching the raster painter in the terrain compiler.
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY) continue;
      let inside = false;
      for (const ring of s.rings)
        for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
          const a = ring[j],
            b = ring[k];
          if (
            a[1] > y !== b[1] > y &&
            x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
          )
            inside = !inside;
        }
      if (inside) return s.id;
    }
    return null;
  }
  /** Scan conversion yields every eight rows. No canvas, network or native bridge. */
  *raster(bounds: DetailBounds, size = 1024): Generator<void, ProvinceDetail> {
    const ids = new Uint16Array(size * size);
    const left = bounds.x - bounds.ex,
      top = bounds.y - bounds.ey;
    const dx = (2 * bounds.ex) / size,
      dy = (2 * bounds.ey) / size;
    for (const s of this.shapes) {
      if (
        s.maxX < left ||
        s.minX > left + dx * size ||
        s.maxY < top ||
        s.minY > top + dy * size
      )
        continue;
      // Discard horizontal and vertically irrelevant edges before the row loop.
      const edges = s.rings.flatMap((ring) =>
        ring.flatMap((a, i) => {
          const b = ring[(i + 1) % ring.length];
          return a[1] !== b[1] &&
            Math.max(a[1], b[1]) >= top &&
            Math.min(a[1], b[1]) <= top + dy * size
            ? [[a, b]]
            : [];
        }),
      );
      const start = Math.max(0, Math.ceil((s.minY - top) / dy - 0.5));
      const end = Math.min(size, Math.ceil((s.maxY - top) / dy - 0.5));
      for (let row = start; row < end; row++) {
        if ((row - start) % 8 === 0) yield;
        const y = top + (row + 0.5) * dy;
        const crossings: number[] = [];
        for (const [a, b] of edges)
          if (a[1] > y !== b[1] > y)
            crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2) {
          const from = Math.max(
            0,
            Math.min(size, Math.ceil((crossings[i] - left) / dx - 0.5)),
          );
          const to = Math.max(
            0,
            Math.min(size, Math.ceil((crossings[i + 1] - left) / dx - 0.5)),
          );
          ids.fill(s.id + 1, row * size + from, row * size + to);
        }
      }
    }
    return { ...bounds, size, ids };
  }
}

let shared: ProvinceGeometry | undefined;
export const provinceGeometry = () =>
  (shared ??= new ProvinceGeometry(geometry.features));
