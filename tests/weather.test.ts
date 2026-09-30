import { describe, expect, it } from "vitest";
import {
  weatherAtLocation,
  weatherMapData,
  weatherSystems,
} from "../src/graphics/weather";
import { DEFAULT_ATMOSPHERE } from "../src/graphics/atmosphere";

describe("visual regional weather", () => {
  it("leaves clear areas between banks, and follows geography instead of the camera", () => {
    const system = weatherSystems(1)[0];
    expect(
      weatherAtLocation(system.lon, system.lat, DEFAULT_ATMOSPHERE).intensity,
    ).toBe(1);
    expect(weatherAtLocation(45, -60, DEFAULT_ATMOSPHERE)).toEqual({
      kind: "clear",
      intensity: 0,
    });
    expect(
      weatherAtLocation(system.lon, system.lat, {
        ...DEFAULT_ATMOSPHERE,
        weather: "clear",
      }).intensity,
    ).toBe(0);
  });
  it("seasons move banks and change precipitation without touching campaign state", () => {
    expect(weatherSystems(1)[0].kind).toBe("snow");
    expect(weatherSystems(180)[0].kind).toBe("rain");
    expect(weatherSystems(1)[0].lon).not.toBe(weatherSystems(180)[0].lon);
  });
  it("2D includes bounded cloud banks and visible precipitation, with a clear switch", () => {
    const rainy = weatherMapData({ ...DEFAULT_ATMOSPHERE, weather: "rain" });
    expect(rainy.clouds.features.length).toBe(21);
    expect(rainy.precipitation.features.length).toBeGreaterThan(100);
    expect(rainy.precipitation.features.length).toBeLessThan(1000);
    for (const cloud of rainy.clouds.features)
      expect(cloud.geometry.coordinates[0][0]).toEqual(
        cloud.geometry.coordinates[0].at(-1),
      );
    expect(
      weatherMapData({ ...DEFAULT_ATMOSPHERE, weather: "clear" }).clouds
        .features,
    ).toEqual([]);
    expect(
      weatherMapData({ ...DEFAULT_ATMOSPHERE, weather: "fog" }).precipitation
        .features,
    ).toEqual([]);
  });
});
