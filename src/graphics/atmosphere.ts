export type LightingMode = "cycle" | "day" | "night";
export type WeatherMode = "dynamic" | "clear" | "rain" | "snow" | "fog";
export interface Atmosphere {
  lighting: LightingMode;
  weather: WeatherMode;
  dayOfYear: number;
}
export const DEFAULT_ATMOSPHERE: Atmosphere = {
  lighting: "cycle",
  weather: "dynamic",
  dayOfYear: 1,
};
export const DAY_CYCLE_SECONDS = 240;
export function parseAtmosphere(text: string | null): Atmosphere {
  try {
    const v = JSON.parse(text ?? "null");
    return {
      lighting: ["cycle", "day", "night"].includes(v?.lighting)
        ? v.lighting
        : "cycle",
      weather: ["dynamic", "clear", "rain", "snow", "fog"].includes(v?.weather)
        ? v.weather
        : "dynamic",
      dayOfYear: 1,
    };
  } catch {
    return { ...DEFAULT_ATMOSPHERE };
  }
}
export function atmosphereUniforms(
  value: Atmosphere,
  seconds: number,
  longitude: number,
) {
  // Fixed modes use local midday/midnight, allowing any country to be inspected.
  const hour =
    value.lighting === "cycle"
      ? seconds / DAY_CYCLE_SECONDS
      : value.lighting === "day"
        ? -longitude / 360
        : 0.5 - longitude / 360;
  const declination =
    -0.4091 * Math.cos(((value.dayOfYear + 10) / 365.25) * Math.PI * 2);
  return {
    hour,
    declination,
    weather: ["clear", "dynamic", "rain", "snow", "fog"].indexOf(value.weather),
  };
}
export const ATMOSPHERE_KEY = "grand-century-atmosphere-v1";
export function calendarDay(date?: {
  day: number;
  month: number;
  year: number;
}) {
  return date
    ? Math.floor(
        (Date.UTC(date.year, date.month - 1, date.day) -
          Date.UTC(date.year, 0, 1)) /
          86400000,
      ) + 1
    : 1;
}
