import worldSeedRaw from './generated/worldSeed.json';
import provincesGeoRaw from './generated/provinces.geo.json';
import nationalBordersRaw from './generated/nationalBorders.geo.json';
import type { GovernmentType, Terrain } from '../shared/types';

export interface SeedNation {
  tag: string;
  name: string;
  color: [number, number, number];
  government: GovernmentType;
  capitalProvinceId: number;
  primaryCulture: string;
  coreStateIds?: number[];
}

export interface SeedFormable {
  key: string;
  resultTag: string;
  resultName: string;
  resultColor: [number, number, number];
  resultPrimaryCulture?: string;
  candidateTags: string[];
  coreStateIds: number[];
  requiredCoreShare: number;
  requireIndependent: boolean;
  requireGreatPower: boolean;
  prestigeReward: number;
}

export interface SeedProvince {
  id: number;
  name: string;
  ownerTag: string;
  stateId: number;
  stateName: string;
  terrain: Terrain;
  coastal: boolean;
  rgoGood: string;
  neighbors: number[];
  lon: number;
  lat: number;
  populationWeight: number;
}

export interface SeedState {
  id: number;
  name: string;
  ownerTag: string;
  provinceIds: number[];
}

export interface WorldSeedData {
  source: string;
  generatedAt: string;
  provinceCount: number;
  provinces: SeedProvince[];
  states: SeedState[];
  nations: SeedNation[];
  formables?: SeedFormable[];
}

export interface CompactProvinceFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    properties: { id: number; n: string };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export interface NationalBorderFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { id: number };
    geometry: {
      type: 'MultiLineString';
      coordinates: number[][][];
    };
  }>;
}

export const WORLD_SEED = worldSeedRaw as WorldSeedData;
export const PROVINCES_GEOJSON = provincesGeoRaw as CompactProvinceFeatureCollection;
export const NATIONAL_BORDERS_GEOJSON = nationalBordersRaw as NationalBorderFeatureCollection;
export const PROVINCE_COUNT = WORLD_SEED.provinces.length;
