import { describe, expect, it } from "vitest";
import { cities, cityLabels } from "../src/graphics/cities";
import { cityModel, type Point } from "../src/graphics/cityModel";
import { readTerrainBinary } from "../src/graphics/terrainBinary";
describe("settlement presentation", () => {
  it("anchors London, Berlin and Parma to cities rather than provincial centroids", () => {
    for (const [name, lon, lat] of [
      ["London", -0.12, 51.5],
      ["Berlin", 13.4, 52.52],
      ["Parma", 10.32, 44.81],
    ] as const) {
      const c = cities.find((c) => c.name === name)!;
      expect(Math.abs(c.lon - lon)).toBeLessThan(0.03);
      expect(Math.abs(c.lat - lat)).toBeLessThan(0.03);
    }
  });
  it("adds bounded detailed geometry and a visible vertical skyline", () => {
    const low: Point[] = [],
      high: Point[] = [];
    cityModel((a, b, c) => low.push(a, b, c), false, 42);
    cityModel((a, b, c) => high.push(a, b, c), true, 42);
    expect(high.length).toBeGreaterThan(low.length);
    expect(high.length).toBeLessThan(14000);
    expect(Math.max(...high.map((p) => p[2]))).toBeGreaterThan(3);
    expect(high.every((p) => p.every(Number.isFinite))).toBe(true);
  });
  it("shows city names when zoomed and suppresses overlapping names", () => {
    expect(cityLabels(() => [200, 200], 3, 430, 900)).toEqual([]);
    const labels = cityLabels(() => [200, 200], 5, 430, 900);
    expect(labels).toHaveLength(1);
    expect(labels[0].city.name).toBeTruthy();
  });
});
describe("prebuilt native terrain", () => {
  it("reads zero-copy views and rejects truncated assets", () => {
    const bytes = new Uint8Array(26),
      header = new DataView(bytes.buffer);
    header.setUint32(0, 0x47435431, false);
    header.setUint32(4, 1, true);
    header.setUint32(8, 1, true);
    header.setUint16(16, 456, true);
    header.setUint16(24, 17, true);
    const data = readTerrainBinary(bytes);
    expect(data.heights[0]).toBe(456);
    expect(data.provinces[0]).toBe(17);
    expect(data.surface.buffer).toBe(bytes.buffer);
    expect(() => readTerrainBinary(bytes.subarray(0, 25))).toThrow(
      "Invalid terrain asset",
    );
  });
});
