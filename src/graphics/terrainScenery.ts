import {
  geographic,
  pixelAt,
  provinceAt,
  terrainHeight,
  type TerrainData,
} from "./terrainData";

export interface SceneryProvince {
  id: number;
  lon: number;
  lat: number;
  terrain: string;
  populationWeight: number;
}
export const SCENERY_VERTEX_BUDGET = 90000;
type Point = [number, number, number];
type Color = [number, number, number];
/** Geographic illustration only: these models do not represent simulation buildings or units. */
export function buildScenery(
  data: TerrainData,
  provinces: readonly SceneryProvince[],
  bounds: { x: number; y: number; ex: number; ey: number; zoom: number },
): Float32Array {
  if (bounds.zoom < 3.3) return new Float32Array();
  const vertices: number[] = [];
  const scale = Math.min(0.00015, 1 / 2 ** bounds.zoom / 140);
  const triangle = (a: Point, b: Point, c: Point, color: Color) => {
    if (vertices.length / 9 + 3 > SCENERY_VERTEX_BUDGET) return;
    const u = b.map((v, i) => v - a[i]),
      v = c.map((v, i) => v - a[i]);
    // Mesh y points south; lighting y points north.
    const nx = u[1] * v[2] - u[2] * v[1],
      ny = -(u[2] * v[0] - u[0] * v[2]),
      nz = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(nx, ny, nz) || 1;
    for (const p of [a, b, c])
      vertices.push(...p, nx / length, ny / length, nz / length, ...color);
  };
  const tree = (x: number, y: number, size: number, shade: number) => {
    const z = terrainHeight(data, x, y),
      tip: Point = [x, y, z + size * 3.4];
    const leaf: Color = [0.2 + shade, 0.35 + shade, 0.14 + shade * 0.6];
    for (let tier = 0; tier < 2; tier++) {
      const radius = size * (tier ? 0.72 : 1),
        base = z + size * (tier ? 1.5 : 0.45);
      const peak: Point = tier ? tip : [x, y, z + size * 2.6];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          b = ((i + 1) * Math.PI) / 3;
        triangle(
          [x + Math.cos(a) * radius, y + Math.sin(a) * radius, base],
          [x + Math.cos(b) * radius, y + Math.sin(b) * radius, base],
          peak,
          leaf,
        );
      }
    }
    const trunk = size * 0.16;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2,
        b = ((i + 1) * Math.PI) / 2;
      const p: Point = [x + Math.cos(a) * trunk, y + Math.sin(a) * trunk, z];
      const q: Point = [x + Math.cos(b) * trunk, y + Math.sin(b) * trunk, z];
      const top: Point = [p[0], p[1], z + size];
      triangle(p, q, top, [0.31, 0.23, 0.13]);
      triangle(q, [q[0], q[1], z + size], top, [0.31, 0.23, 0.13]);
    }
  };
  const house = (x: number, y: number, size: number, shade: number) => {
    const z = terrainHeight(data, x, y) + size * 0.1,
      h = size * 1.7;
    const p: Point[] = [
      [x - size, y - size, z],
      [x + size, y - size, z],
      [x + size, y + size, z],
      [x - size, y + size, z],
    ];
    const top = p.map(([a, b, c]): Point => [a, b, c + h]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      triangle(p[i], p[j], top[i], [0.75 + shade, 0.7 + shade, 0.59 + shade]);
      triangle(p[j], top[j], top[i], [
        0.65 + shade,
        0.59 + shade,
        0.45 + shade,
      ]);
      triangle(
        top[i],
        top[j],
        [x, y, z + h + size * 1.3],
        [0.51 + shade, 0.3 + shade * 0.5, 0.19],
      );
    }
  };
  // Stable spatial sampling avoids foliage rearranging when the camera moves.
  let seed = 1830;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const p of provinces) {
    const x = (p.lon + 180) / 360;
    const y = (1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2;
    if (
      Math.abs(x - bounds.x) > bounds.ex + 0.004 ||
      Math.abs(y - bounds.y) > bounds.ey + 0.004
    )
      continue;
    seed = p.id + 1830;
    const forest = p.terrain === "forest" || p.terrain === "jungle";
    const count = forest
      ? 100
      : p.terrain === "arctic"
        ? 0
        : Math.min(18, 5 + Math.round(p.populationWeight * 2));
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2,
        radius = forest
          ? Math.sqrt(-2 * Math.log(Math.max(0.001, random()))) * 0.003
          : Math.sqrt(random()) * 0.0006;
      const u = x + Math.cos(a) * radius,
        v = y + Math.sin(a) * radius;
      const [lon, lat] = geographic(u, v);
      if (
        provinceAt(data, lon, lat) !== p.id ||
        terrainHeight(data, u, v) > 0.003
      )
        continue;
      const pixel = pixelAt(data, u, v) * 4;
      const supportsTrees =
        data.surface[pixel + 1] > data.surface[pixel] * 1.04 &&
        data.surface[pixel + 1] > data.surface[pixel + 2] * 1.1;
      if (forest && supportsTrees)
        tree(u, v, scale * (0.6 + random() * 0.6), random() * 0.06);
      else if (!forest)
        house(u, v, scale * (0.7 + random() * 0.6), random() * 0.08);
    }
    if (forest && p.populationWeight > 0.5) {
      for (let i = 0; i < 8; i++) {
        const u = x + (random() - 0.5) * 0.0012,
          v = y + (random() - 0.5) * 0.0012;
        if (provinceAt(data, ...geographic(u, v)) === p.id)
          house(u, v, scale * (0.8 + random() * 0.4), random() * 0.08);
      }
    }
    if (vertices.length / 9 >= SCENERY_VERTEX_BUDGET - 40) break;
  }
  return new Float32Array(vertices);
}
