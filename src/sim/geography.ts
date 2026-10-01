import { WORLD_SEED } from '../data/generated';
import type { World } from '../shared/types';

/**
 * Province count the per-province balance constants were tuned against (the
 * 387-province pre-v8 world). Smaller provinces represent a fraction of that
 * area and population, so per-province floors and costs scale with it.
 */
export const REFERENCE_PROVINCE_COUNT = 387;

export function provinceScale(provinceCount: number): number {
  return provinceCount > 0 ? Math.min(1, REFERENCE_PROVINCE_COUNT / provinceCount) : 1;
}

export function worldProvinceScale(world: Pick<World, 'provinces'>): number {
  return provinceScale(world.provinces.length);
}

/** Reference march for one base movement period: about 5 days per 400 km. */
export const REFERENCE_HOP_KM = 400;

let coords: Float64Array | null = null;
function provinceCoords(): Float64Array {
  if (coords) return coords;
  coords = new Float64Array(WORLD_SEED.provinces.length * 2);
  for (const province of WORLD_SEED.provinces) {
    coords[province.id * 2] = province.lon;
    coords[province.id * 2 + 1] = province.lat;
  }
  return coords;
}

/** Great-circle distance between two province label points, in km. */
export function hopKm(a: number, b: number): number {
  const c = provinceCoords();
  if (a < 0 || b < 0 || a * 2 + 1 >= c.length || b * 2 + 1 >= c.length) return REFERENCE_HOP_KM;
  const toRad = Math.PI / 180;
  const la1 = c[a * 2 + 1] * toRad, la2 = c[b * 2 + 1] * toRad;
  const dLa = la2 - la1, dLo = (c[b * 2] - c[a * 2]) * toRad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
