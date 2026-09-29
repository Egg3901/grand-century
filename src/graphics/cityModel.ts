export type Point = [number, number, number];
type Color = [number, number, number];
export type Triangle = (a: Point, b: Point, c: Point, color: Color) => void;

/** Reusable settlement kit: streets, courtyard blocks, pitched roofs and a civic tower.
 * These are illustrative period buildings, not reconstructions of named monuments.
 */
export function cityModel(triangle: Triangle, detail: boolean, seed: number) {
  const quad = (a: Point, b: Point, c: Point, d: Point, color: Color) => {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    base: number,
    color: Color,
  ) => {
    const a: Point = [x - w, y - d, base],
      b: Point = [x + w, y - d, base],
      c: Point = [x + w, y + d, base],
      e: Point = [x - w, y + d, base];
    const top = (p: Point): Point => [p[0], p[1], base + h];
    quad(a, b, top(b), top(a), color);
    quad(b, c, top(c), top(b), color);
    quad(c, e, top(e), top(c), color);
    quad(e, a, top(a), top(e), color);
    quad(top(a), top(b), top(c), top(e), color);
  };
  const roof = (
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    color: Color,
  ) => {
    const a: Point = [x - w, y - d, h],
      b: Point = [x + w, y - d, h],
      c: Point = [x + w, y + d, h],
      e: Point = [x - w, y + d, h];
    const left: Point = [x - w, y, h + 0.55],
      right: Point = [x + w, y, h + 0.55];
    quad(a, b, right, left, color);
    quad(left, right, c, e, color);
    triangle(a, left, e, [0.67, 0.6, 0.48]);
    triangle(b, c, right, [0.67, 0.6, 0.48]);
  };
  // Streets belong to the same depth-tested mesh as the houses.
  quad(
    [-10, -0.36, 0.02],
    [10, -0.36, 0.02],
    [10, 0.36, 0.02],
    [-10, 0.36, 0.02],
    [0.55, 0.51, 0.43],
  );
  quad(
    [-0.36, -9, 0.025],
    [0.36, -9, 0.025],
    [0.36, 9, 0.025],
    [-0.36, 9, 0.025],
    [0.55, 0.51, 0.43],
  );
  const extent = detail ? 4 : 2;
  for (let row = -extent; row <= extent; row++)
    for (let col = -extent; col <= extent; col++) {
      if (!row || !col) continue;
      const n =
        (Math.imul(seed + row * 17 + col * 31, 1103515245) >>> 0) / 4294967296;
      if (Math.abs(row) === extent && Math.abs(col) === extent && n > 0.3)
        continue;
      const x = col * 1.8 + Math.sin(row * 0.7) * 0.35,
        y = row * 1.65 + Math.cos(col) * 0.2,
        h = 0.65 + n * 1.15;
      quad(
        [x - 0.85, y - 0.7, 0.01],
        [x + 1, y - 0.7, 0.01],
        [x + 1, y + 0.85, 0.01],
        [x - 0.85, y + 0.85, 0.01],
        [0.43, 0.43, 0.32],
      );
      box(x, y, 0.72, 0.57, h, 0, [
        0.7 + n * 0.12,
        0.64 + n * 0.1,
        0.51 + n * 0.1,
      ]);
      roof(
        x,
        y,
        0.8,
        0.64,
        h,
        n > 0.5 ? [0.37, 0.39, 0.4] : [0.52, 0.28, 0.19],
      );
      if (detail) {
        box(x + 0.35, y - 0.12, 0.09, 0.09, 0.45, h + 0.3, [0.47, 0.39, 0.31]);
        quad(
          [x - 0.1, y - 0.579, 0.02],
          [x + 0.1, y - 0.579, 0.02],
          [x + 0.1, y - 0.579, 0.34],
          [x - 0.1, y - 0.579, 0.34],
          [0.22, 0.19, 0.15],
        );
        for (let i = -1; i <= 1; i++) {
          const wx = x + i * 0.39;
          quad(
            [wx - 0.08, y - 0.575, h * 0.45],
            [wx + 0.08, y - 0.575, h * 0.45],
            [wx + 0.08, y - 0.575, h * 0.72],
            [wx - 0.08, y - 0.575, h * 0.72],
            [0.2, 0.24, 0.25],
          );
          quad(
            [wx - 0.08, y + 0.575, 0.31],
            [wx + 0.08, y + 0.575, 0.31],
            [wx + 0.08, y + 0.575, 0.58],
            [wx - 0.08, y + 0.575, 0.58],
            [0.2, 0.24, 0.25],
          );
        }
      }
    }
  if (detail)
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const y = i * 1.65 + 0.82;
      quad(
        [-8, y - 0.13, 0.025],
        [8, y - 0.13, 0.025],
        [8, y + 0.13, 0.025],
        [-8, y + 0.13, 0.025],
        [0.56, 0.53, 0.44],
      );
    }
  // Central square, hall and tiered clock/bell tower create a legible silhouette.
  quad(
    [-0.9, 0.6, 0.03],
    [0.9, 0.6, 0.03],
    [0.9, 2.5, 0.03],
    [-0.9, 2.5, 0.03],
    [0.64, 0.6, 0.49],
  );
  box(0, -1.25, 0.6, 0.75, 1.2, 0, [0.79, 0.73, 0.6]);
  roof(0, -1.25, 0.67, 0.83, 1.2, [0.31, 0.36, 0.38]);
  box(0, -1.25, 0.25, 0.25, 2.7, 0, [0.77, 0.71, 0.59]);
  box(0, -1.25, 0.31, 0.31, 0.15, 2.35, [0.88, 0.82, 0.69]);
  const peak: Point = [0, -1.25, 3.7];
  const corners: Point[] = [
    [-0.35, -1.6, 2.7],
    [0.35, -1.6, 2.7],
    [0.35, -0.9, 2.7],
    [-0.35, -0.9, 2.7],
  ];
  for (let i = 0; i < 4; i++)
    triangle(corners[i], corners[(i + 1) % 4], peak, [0.3, 0.38, 0.37]);
}
