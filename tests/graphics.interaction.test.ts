import { describe, expect, it, vi } from "vitest";
import { TerrainRenderer } from "../src/graphics/TerrainRenderer";
import { unpackTerrain } from "../src/graphics/terrainData";
import atlas from "./native-graphics/atlas.json";

describe("terrain interaction budget", () => {
  it("moves and zooms the camera without rebuilding or uploading terrain meshes", () => {
    let uploads = 0,
      lookups = 0;
    const gl = new Proxy(
      {
        NO_ERROR: 0,
        getParameter: () => 16384,
        getAttribLocation: () => {
          lookups++;
          return 0;
        },
        getError: () => 0,
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        bufferData: () => {
          uploads++;
        },
      },
      {
        get: (target: any, key: string) =>
          key in target
            ? target[key]
            : key.startsWith("create")
              ? () => ({})
              : /^[A-Z_0-9]+$/.test(key)
                ? 1
                : () => {},
      },
    ) as unknown as WebGLRenderingContext;
    const renderer = new TerrainRenderer(gl, unpackTerrain(atlas), "high");
    renderer.setView({ lon: 8, lat: 46, zoom: 4 }, 430, 932);
    uploads = 0;
    for (let i = 0; i < 60; i++)
      renderer.setView(
        { lon: 8 + i * 0.008, lat: 46, zoom: 4 + i * 0.016 },
        430,
        932,
      );
    expect(uploads).toBe(0);
    lookups = 0;
    renderer.render(1, false, null);
    renderer.render(2, false, null);
    expect(lookups).toBe(0);
    renderer.dispose();
  });
  it("prepares scenery between frames instead of requiring repeated full GPU draws", async () => {
    vi.useFakeTimers();
    try {
      const gl = new Proxy(
        {
          NO_ERROR: 0,
          getParameter: () => 16384,
          getError: () => 0,
          getShaderParameter: () => true,
          getProgramParameter: () => true,
        },
        {
          get: (target: any, key: string) =>
            key in target
              ? target[key]
              : key.startsWith("create")
                ? () => ({})
                : /^[A-Z_0-9]+$/.test(key)
                  ? 1
                  : () => {},
        },
      ) as unknown as WebGLRenderingContext;
      const data = unpackTerrain(atlas);
      data.provinces.fill(1);
      for (let i = 0; i < data.surface.length; i += 4)
        data.surface.set([40, 100, 30, 255], i);
      const renderer = new TerrainRenderer(gl, data, "high");
      renderer.setScenery([
        { id: 0, lon: 2, lat: 48, terrain: "forest", populationWeight: 1 },
      ]);
      // Use actual land: the physical coast mask correctly rejects Null Island.
      renderer.setView({ lon: 2, lat: 48, zoom: 4 }, 430, 932);
      await vi.runAllTimersAsync();
      renderer.render(1, false, null);
      expect(renderer.sceneryVertexCount).toBeGreaterThan(0);
      renderer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
