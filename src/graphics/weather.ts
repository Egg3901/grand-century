import type { Atmosphere, WeatherMode } from "./atmosphere";
import type { FeatureCollection, Polygon, LineString } from "geojson";

// Synoptic cloud banks belong to the map, rather than following the camera.
// This visual field never reads or mutates simulation state.
const centers = [
  [0, 48],
  [80, 48],
  [-110, 48],
  [155, 12],
  [25, 0],
  [-60, -30],
  [120, -35],
] as const;
export const WEATHER_RADIUS = [24, 11] as const;
export const WEATHER_FIELD_GLSL = `
float weatherBank(vec2 geo,vec2 center){
 vec2 d=(geo-center)/vec2(${WEATHER_RADIUS.join(",")});
 return 1.0-smoothstep(.2,1.0,dot(d,d));
}
float weatherCoverage(vec2 geo){
 float bank=0.0;
 ${centers.map(([lon, lat]) => `bank=max(bank,weatherBank(geo,vec2(${lon.toFixed(1)},${lat.toFixed(1)})));`).join("\n ")}
 return bank;
}
`;
export function weatherSystems(dayOfYear: number) {
  const declination =
    -0.4091 * Math.cos(((dayOfYear + 10) / 365.25) * Math.PI * 2);
  return centers.map(([lon, lat]) => ({
    lon: lon + declination * 15,
    lat,
    kind:
      Math.abs(lat) +
        Math.max(0, -Math.sin((lat * Math.PI) / 180) * Math.sin(declination)) *
          35 >
      56
        ? ("snow" as const)
        : ("rain" as const),
  }));
}
const smooth = (v: number) => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
export function weatherAtLocation(
  lon: number,
  lat: number,
  atmosphere: Atmosphere,
) {
  if (atmosphere.weather === "clear")
    return { kind: "clear" as WeatherMode, intensity: 0 };
  let intensity = 0,
    kind: WeatherMode = "clear";
  for (const system of weatherSystems(atmosphere.dayOfYear)) {
    const dx = (lon - system.lon) / WEATHER_RADIUS[0],
      dy = (lat - system.lat) / WEATHER_RADIUS[1];
    const weight = 1 - smooth((dx * dx + dy * dy - 0.2) / 0.8);
    if (weight > intensity) {
      intensity = weight;
      kind =
        atmosphere.weather === "dynamic" ? system.kind : atmosphere.weather;
    }
  }
  return {
    kind: intensity > 0.08 ? kind : ("clear" as WeatherMode),
    intensity,
  };
}
export function weatherMapData(atmosphere: Atmosphere) {
  const clouds: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [],
  };
  const precipitation: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: [],
  };
  if (atmosphere.weather === "clear") return { clouds, precipitation };
  for (const [index, system] of weatherSystems(
    atmosphere.dayOfYear,
  ).entries()) {
    const kind =
      atmosphere.weather === "dynamic" ? system.kind : atmosphere.weather;
    // Nested banks soften the silhouette without a fullscreen haze.
    for (const scale of [1, 0.82, 0.64]) {
      const ring = Array.from({ length: 49 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        const edge = 1 + Math.sin(angle * 5 + index) * 0.055;
        return [
          system.lon + Math.cos(angle) * WEATHER_RADIUS[0] * scale * edge,
          system.lat + Math.sin(angle) * WEATHER_RADIUS[1] * scale * edge,
        ];
      });
      ring[48] = ring[0];
      clouds.features.push({
        type: "Feature",
        properties: { kind },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
    if (kind === "fog") continue;
    for (let x = -8; x <= 8; x++)
      for (let y = -5; y <= 5; y++) {
        if ((x / 8) ** 2 + (y / 5) ** 2 > 0.8) continue;
        const lon = system.lon + x * 2.5 + Math.sin(x * 17 + y) * 0.6;
        const lat = system.lat + y * 1.8 + Math.cos(y * 13 + x) * 0.4;
        precipitation.features.push({
          type: "Feature",
          properties: { kind },
          geometry: {
            type: "LineString",
            coordinates:
              kind === "snow"
                ? [
                    [lon, lat],
                    [lon + 0.09, lat + 0.09],
                  ]
                : [
                    [lon, lat],
                    [lon + 0.24, lat - 0.5],
                  ],
          },
        });
      }
  }
  return { clouds, precipitation };
}

export const WEATHER_CLOUD_PAINT = {
  "fill-color": "#ced9dc",
  "fill-opacity": 0.12,
} as const;
