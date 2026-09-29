import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeTerrarium,
  detailSpacingMeters,
  tilePlan,
  loadHeightRegion,
  regionElevation,
  installOfflineTerrain,
  loadTerrainTile,
} from "../src/graphics/terrainTiles";
import {
  atmosphereUniforms,
  parseAtmosphere,
  calendarDay,
  DAY_CYCLE_SECONDS,
} from "../src/graphics/atmosphere";
import { physicalCoast } from "../src/graphics/physicalCoast";
import { mercator, type TerrainData } from "../src/graphics/terrainData";
import offline from "../src/graphics/terrain-detail.json";
const base: TerrainData = {
  size: 2,
  provinceSize: 2,
  heights: new Uint16Array(4).fill(42),
  surface: new Uint8Array(16),
  normals: new Uint8Array(8),
  provinces: new Uint16Array(4),
};
const png = new Uint8Array(
  readFileSync(new URL("./fixtures/terrain/7-68-45.png", import.meta.url)),
);
describe("real elevation detail", () => {
  it("decodes the provider PNG and rejects corrupt or unsupported input", async () => {
    const heights = await decodeTerrarium(png);
    expect(heights.length).toBe(65536);
    expect(Math.max(...heights)).toBeGreaterThan(2500);
    expect(heights[0]).toBe(2512);
    await expect(decodeTerrarium(png.subarray(0, 100))).rejects.toThrow();
    const unsupported = png.slice();
    unsupported[24] = 16;
    await expect(decodeTerrarium(unsupported)).rejects.toThrow("Unsupported");
  });
  it("bounds every regional texture and exposes actual offline precision", async () => {
    installOfflineTerrain(offline);
    for (const zoom of [1.2, 4, 6, 8, 9])
      for (const ratio of [0.3, 1, 4]) {
        const p = tilePlan(0.54, 0.35, 2 ** -zoom * ratio, 2 ** -zoom, zoom);
        expect(p.columns).toBeGreaterThan(0);
        expect(p.rows).toBeGreaterThan(0);
        expect(p.width * p.height * 2).toBeLessThanOrEqual(8 * 1024 * 1024);
      }
    const [x, y] = mercator(12, 46),
      z = 8;
    const tile = await loadTerrainTile(
      z,
      Math.floor(x * 2 ** z),
      Math.floor(y * 2 ** z),
      new AbortController().signal,
    );
    expect(tile.sourceZoom).toBe(8);
    expect(detailSpacingMeters(tile.sourceZoom, 46)).toBeLessThan(500);
    expect(Math.max(...tile.heights)).toBeGreaterThan(2000);
  });
  it("keeps base relief when offline and does not claim high resolution", async () => {
    const p = {
      z: 8,
      x: 136,
      y: 90,
      columns: 1,
      rows: 1,
      width: 256,
      height: 256,
    };
    const result = await loadHeightRegion(
      p,
      base,
      new AbortController().signal,
      async () => {
        throw new Error("offline");
      },
    );
    expect(result.loadedTiles).toBe(0);
    expect(regionElevation(result, 136.5 / 256, 90.5 / 256)).toBe(42);
    expect(regionElevation(result, 0, 0)).toBeNull();
    const controller = new AbortController();
    controller.abort();
    await expect(loadHeightRegion(p, base, controller.signal)).rejects.toThrow(
      "cancelled",
    );
  });
});
describe("presentation atmosphere", () => {
  it("persists only valid preferences and derives leap-year seasons", () => {
    expect(
      parseAtmosphere('{"lighting":"night","weather":"rain"}'),
    ).toMatchObject({ lighting: "night", weather: "rain" });
    expect(parseAtmosphere("broken")).toMatchObject({
      lighting: "cycle",
      weather: "dynamic",
    });
    expect(calendarDay({ year: 1832, month: 3, day: 1 })).toBe(61);
  });
  it("moves through a full solar day and gives local noon or midnight anywhere", () => {
    const preferences = {
      lighting: "cycle" as const,
      weather: "dynamic" as const,
      dayOfYear: 1,
    };
    expect(atmosphereUniforms(preferences, DAY_CYCLE_SECONDS, 0).hour).toBe(1);
    expect(
      atmosphereUniforms({ ...preferences, lighting: "day" }, 0, 90).hour,
    ).toBe(-0.25);
    expect(
      atmosphereUniforms({ ...preferences, lighting: "night" }, 0, 90).hour,
    ).toBe(0.25);
    expect(
      atmosphereUniforms({ ...preferences, dayOfYear: 180 }, 0, 0).declination,
    ).toBeGreaterThan(0);
    expect(atmosphereUniforms(preferences, 0, 0).declination).toBeLessThan(0);
  });
});
it("uses physical Istrian coastline independently of province ownership", () => {
  const coast = physicalCoast();
  expect(coast.at(13.85, 45.15)).toBe(0); // Istrian peninsula
  expect(coast.at(13.2, 45.1)).toBeNull(); // Adriatic west of peninsula
  expect(coast.at(12.1, 44.5)).toBe(0); // Italian mainland
});
