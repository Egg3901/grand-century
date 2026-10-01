import source from "../../content/history/1830/cities.json";
export const cities = source.cities;
export type City = (typeof cities)[number];
export interface CityLabel {
  city: City;
  x: number;
  y: number;
  width: number;
}
/** Stable priority and screen-space collision rules shared by web and native. */
export function cityLabels(
  project: (lon: number, lat: number) => [number, number],
  zoom: number,
  width: number,
  height: number,
  blocked: readonly { x: number; y: number; width: number }[] = [],
): CityLabel[] {
  if (zoom < 3.4) return [];
  const placed: CityLabel[] = [];
  // Nation lettering is placed first; cities never sit on top of it.
  const occupied: { x: number; y: number; width: number }[] = [...blocked];
  for (const city of [...cities].sort(
    (a, b) => a.importance - b.importance || a.id.localeCompare(b.id),
  )) {
    if (zoom < 4.2 && city.importance > 0) continue;
    const [x, centerY] = project(city.lon, city.lat);
    const y =
      centerY + Math.max(8, height * 2 ** zoom * 0.000065 * 7 * 0.74 + 8);
    const labelWidth = Math.max(54, city.name.length * 7 + 18);
    if (
      x < labelWidth / 2 + 6 ||
      x > width - labelWidth / 2 - 6 ||
      y < 135 ||
      y > height - 155
    )
      continue;
    if (
      occupied.some(
        (p) =>
          Math.abs(p.y - y) < 30 &&
          Math.abs(p.x - x) < (p.width + labelWidth) / 2 + 8,
      )
    )
      continue;
    placed.push({ city, x, y, width: labelWidth });
    occupied.push({ x, y, width: labelWidth });
    if (placed.length === 32) break;
  }
  return placed;
}
