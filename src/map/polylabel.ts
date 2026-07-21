/**
 * Pole of inaccessibility (visual center) for a polygon ring set.
 * Adapted from Mapbox polylabel (ISC) — self-contained, no external dep.
 */

type Point = [number, number];

type Cell = {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
};

function pointToPolygonDist(x: number, y: number, polygon: Point[][]): number {
  let inside = false;
  let minDistSq = Infinity;

  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      const xi = a[0];
      const yi = a[1];
      const xj = b[0];
      const yj = b[1];

      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }

      minDistSq = Math.min(minDistSq, segmentDistSq(x, y, xi, yi, xj, yj));
    }
  }

  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function segmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x1 = x2;
      y1 = y2;
    } else if (t > 0) {
      x1 += dx * t;
      y1 += dy * t;
    }
  }
  dx = px - x1;
  dy = py - y1;
  return dx * dx + dy * dy;
}

function makeCell(x: number, y: number, h: number, polygon: Point[][]): Cell {
  const d = pointToPolygonDist(x, y, polygon);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function getCentroidCell(polygon: Point[][]): Cell {
  let area = 0;
  let x = 0;
  let y = 0;
  const ring = polygon[0] ?? [];
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (Math.abs(area) < 1e-12) {
    const fallback = ring[0] ?? [0, 0];
    return makeCell(fallback[0], fallback[1], 0, polygon);
  }
  return makeCell(x / area, y / area, 0, polygon);
}

/** Precision in geographic degrees; ~0.01° ≈ 1 km. */
export function polylabel(
  polygon: Point[][],
  precision = 0.01,
): { lon: number; lat: number; distance: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of polygon[0] ?? []) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  let h = cellSize / 2;

  if (cellSize === 0) {
    return { lon: minX, lat: minY, distance: 0 };
  }

  const cellQueue: Cell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cellQueue.push(makeCell(x + h, y + h, h, polygon));
    }
  }

  let bestCell = getCentroidCell(polygon);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > bestCell.d) bestCell = bboxCell;

  while (cellQueue.length > 0) {
    cellQueue.sort((a, b) => b.max - a.max);
    const cell = cellQueue.shift()!;
    if (cell.d > bestCell.d) bestCell = cell;
    if (cell.max - bestCell.d <= precision) continue;

    h = cell.h / 2;
    cellQueue.push(
      makeCell(cell.x - h, cell.y - h, h, polygon),
      makeCell(cell.x + h, cell.y - h, h, polygon),
      makeCell(cell.x - h, cell.y + h, h, polygon),
      makeCell(cell.x + h, cell.y + h, h, polygon),
    );
  }

  return { lon: bestCell.x, lat: bestCell.y, distance: bestCell.d };
}

/** Absolute signed area of an outer ring (holes ignored for ranking). */
export function ringArea(ring: Point[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/** Largest polygon (by outer-ring area) from a Polygon or MultiPolygon. */
export function largestPolygon(
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  },
): Point[][] | null {
  if (geometry.type === 'Polygon') {
    const polygon = geometry.coordinates as Point[][];
    return polygon.length > 0 ? polygon : null;
  }
  let best: Point[][] | null = null;
  let bestArea = -1;
  for (const polygon of geometry.coordinates as Point[][][]) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const area = ringArea(outer);
    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }
  return best;
}
