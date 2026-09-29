import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import highProvenance from "../src/graphics/terrain-provenance-high.json";
import provenance from "../src/graphics/terrain-provenance.json";
import { describe, expect, it } from "vitest";
import atlas from "../src/graphics/terrain-atlas.json";
import {
  elevation,
  geographic,
  mercator,
  MESH_SEGMENTS,
  HIGH_MESH_SEGMENTS,
  normalizeView,
  provinceAt,
  unpackTerrain,
} from "../src/graphics/terrainData";
import {
  TerrainAnimationClock,
  renderScale,
  shouldRenderFrame,
} from "../src/graphics/TerrainRenderer";
import { parseGraphicsMode } from "../src/graphics/preferences";

describe("offline terrain and low-power contract", () => {
  it("matches the current game geometry, so a future coastline edit cannot silently misalign 3D", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("src/data/generated/provinces.geo.json"))
        .digest("hex"),
    ).toBe(provenance.provinceGeometrySha256);
    expect(highProvenance.provinceGeometrySha256).toBe(
      provenance.provinceGeometrySha256,
    );
  });
  it("projects geographic landmarks without the old latitude stretching", () => {
    for (const point of [
      [0, 0],
      [7.5, 46.5],
      [86.9, 28],
      [151, -33],
      [-74, 41],
    ]) {
      const xy = mercator(point[0], point[1]);
      const result = geographic(...xy);
      expect(result[0]).toBeCloseTo(point[0], 6);
      expect(result[1]).toBeCloseTo(point[1], 6);
    }
  });
  it("has real elevated Himalayas, sea-level Atlantic and clickable land IDs", () => {
    const data = unpackTerrain(atlas);
    expect(data.size).toBe(2048);
    expect(data.normals.byteLength).toBe(data.size ** 2 * 2);
    expect(elevation(data, ...mercator(86.9, 28))).toBeGreaterThan(3500);
    expect(elevation(data, ...mercator(-30, 20))).toBe(0);
    expect(provinceAt(data, -30, 20)).toBeNull();
    expect(provinceAt(data, 2.35, 48.86)).not.toBeNull();
    expect(provinceAt(data, 190, 45)).toBeNull();
  });
  it("keeps the terrain within a fixed unsigned-short mesh and pixel budget", () => {
    expect(MESH_SEGMENTS ** 2 * 2).toBeLessThanOrEqual(32768);
    expect((MESH_SEGMENTS + 1) ** 2).toBeLessThan(65536);
    expect(renderScale(3)).toBe(1.5);
    expect(renderScale(3, "high")).toBe(2.5);
    expect((HIGH_MESH_SEGMENTS + 1) ** 2).toBeLessThan(65536);
    expect(HIGH_MESH_SEGMENTS ** 2 * 2).toBe(129032);
    expect(normalizeView({ lon: 999, lat: 90, zoom: 20 })).toEqual({
      lon: 179,
      lat: 78,
      zoom: 7,
    });
  });
  it("keeps water moving with native device-uptime timestamps and Reduced Motion startup", () => {
    const clock = new TerrainAnimationClock();
    expect(clock.sample(0)).toBe(0);
    const uptime = 90 * 24 * 60 * 60;
    expect(clock.sample(uptime)).toBe(0);
    expect(Math.fround(clock.sample(uptime + 1 / 30))).toBeCloseTo(1 / 30, 6);
    expect(clock.sample(0)).toBe(0);
    expect(Math.fround(clock.sample(uptime + 2 / 30))).toBeCloseTo(2 / 30, 6);
  });
  it("does no animated work in background or reduced motion and caps water at 30fps", () => {
    expect(shouldRenderFrame(100, 0, false, false, true)).toBe(false);
    expect(shouldRenderFrame(100, 0, true, true, false)).toBe(false);
    expect(shouldRenderFrame(16, 0, true, false, false)).toBe(false);
    expect(shouldRenderFrame(34, 0, true, false, false)).toBe(true);
    expect(shouldRenderFrame(33, 0, true, false, false)).toBe(true);
    expect(shouldRenderFrame(16, 0, true, true, true)).toBe(true);
    expect(parseGraphicsMode(null)).toBe("2d");
    expect(parseGraphicsMode("garbage")).toBe("2d");
    expect(parseGraphicsMode("3d")).toBe("3d");
    expect(parseGraphicsMode("high")).toBe("high");
  });
});
