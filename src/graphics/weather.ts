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
    for (const scale of [1, 0.8, 0.6]) {
      const ring = Array.from({ length: 73 }, (_, i) => {
        const angle = (i / 72) * Math.PI * 2;
        const edge =
          1 +
          Math.sin(angle * 5 + index) * 0.05 +
          Math.sin(angle * 11 + index * 2.3 + scale * 7) * 0.03 +
          Math.sin(angle * 23 + index * 5.1) * 0.012;
        return [
          system.lon + Math.cos(angle) * WEATHER_RADIUS[0] * scale * edge,
          system.lat + Math.sin(angle) * WEATHER_RADIUS[1] * scale * edge,
        ];
      });
      ring[72] = ring[0];
      clouds.features.push({
        type: "Feature",
        properties: { kind },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
    if (kind === "fog") continue;
    // Deterministic scatter, denser toward the core, so drops never form a lattice.
    let seed = (index + 1) * 2654435761;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 110; n++) {
      const r = Math.sqrt(random()) * 0.92,
        angle = random() * Math.PI * 2;
      if (random() > 1 - r * r * 0.55) continue;
      const lon = system.lon + Math.cos(angle) * r * WEATHER_RADIUS[0];
      const lat = system.lat + Math.sin(angle) * r * WEATHER_RADIUS[1];
      const length = 0.35 + random() * 0.3;
      precipitation.features.push({
        type: "Feature",
        properties: { kind },
        geometry: {
          type: "LineString",
          coordinates:
            kind === "snow"
              ? [
                  [lon, lat],
                  [lon + 0.08, lat + 0.08],
                ]
              : [
                  [lon, lat],
                  [lon + length * 0.35, lat - length],
                ],
        },
      });
    }
  }
  return { clouds, precipitation };
}

export const WEATHER_CLOUD_PAINT = {
  "fill-color": "#eef2f3",
  "fill-opacity": 0.16,
} as const;

// Engraved-plate weather: slate ink hatching for rain, cased flakes for snow.
export const WEATHER_PRECIPITATION_LAYOUT = { "line-cap": "round" } as const;
export const WEATHER_RAIN_PAINT = {
  "line-color": "#3d6078",
  "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 5, 1.6],
  "line-opacity": 0.5,
} as const;
export const WEATHER_SNOW_CASING_PAINT = {
  "line-color": "#4a6275",
  "line-width": ["interpolate", ["linear"], ["zoom"], 1, 3, 5, 5.5],
  "line-opacity": 0.35,
} as const;
export const WEATHER_SNOW_PAINT = {
  "line-color": "#fbfdff",
  "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2, 5, 4],
  "line-opacity": 0.92,
} as const;
