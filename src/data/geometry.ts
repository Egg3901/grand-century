import type { ProvinceId } from '../shared/types';

export interface ProvinceGeometry {
  id: ProvinceId;
  name: string;
  row: number;
  col: number;
  neighbors: ProvinceId[];
  polygon: [number, number][][];
}

const GRID_COLS = 8;
const GRID_ROWS = 6;
const LON_START = -168;
const LAT_START = 78;
const CELL_WIDTH = 42;
const CELL_HEIGHT = 24;

function provinceId(col: number, row: number): ProvinceId {
  return row * GRID_COLS + col;
}

function buildPolygon(col: number, row: number): [number, number][][] {
  const west = LON_START + col * CELL_WIDTH;
  const east = west + CELL_WIDTH;
  const north = LAT_START - row * CELL_HEIGHT;
  const south = north - CELL_HEIGHT;
  return [[
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ]];
}

function buildNeighbors(col: number, row: number): ProvinceId[] {
  const neighbors: ProvinceId[] = [];
  if (col > 0) neighbors.push(provinceId(col - 1, row));
  if (col < GRID_COLS - 1) neighbors.push(provinceId(col + 1, row));
  if (row > 0) neighbors.push(provinceId(col, row - 1));
  if (row < GRID_ROWS - 1) neighbors.push(provinceId(col, row + 1));
  return neighbors;
}

function buildProvinces(): ProvinceGeometry[] {
  const provinces: ProvinceGeometry[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const id = provinceId(col, row);
      provinces.push({
        id,
        name: `Province ${id + 1}`,
        row,
        col,
        neighbors: buildNeighbors(col, row),
        polygon: buildPolygon(col, row),
      });
    }
  }
  return provinces;
}

export const PROVINCE_GEOMETRY: ProvinceGeometry[] = buildProvinces();
export const PROVINCE_COUNT = PROVINCE_GEOMETRY.length;

export const PROVINCE_FEATURES = {
  type: 'FeatureCollection',
  features: PROVINCE_GEOMETRY.map((province) => ({
    type: 'Feature',
    id: province.id,
    properties: {
      id: province.id,
      name: province.name,
      row: province.row,
      col: province.col,
    },
    geometry: {
      type: 'Polygon',
      coordinates: province.polygon,
    },
  })),
} as const;
