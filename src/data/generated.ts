import worldSeedRaw from './generated/worldSeed.json';
import type { GovernmentType, Terrain } from '../shared/types';

export interface SeedNation {
  tag: string;
  name: string;
  color: [number, number, number];
  government: GovernmentType;
  capitalProvinceId: number;
  primaryCulture: string;
  coreStateIds?: number[];
  /** Optional 1–8 rank for procedural maps (overrides historical GP tag list). */
  greatPowerRank?: number;
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

/** Static world seed (nations/provinces metadata). Map geometry is fetched at runtime. */
export const WORLD_SEED = worldSeedRaw as WorldSeedData;
export const PROVINCE_COUNT = WORLD_SEED.provinces.length;
