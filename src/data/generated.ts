// The `with { type: 'json' }` attribute is required, not decorative: Node 22
// enforces it for JSON in ESM, and without it Playwright's loader throws while
// collecting specs — which silently took the entire e2e suite to 0 tests
// collected some time after 1.0.0. Vite/vitest/tsc all accept the attribute.
import worldSeedRaw from './generated/worldSeed.json' with { type: 'json' };
import type { GovernmentType, PolityStatus, Terrain } from '../shared/types';

export interface SeedNation {
  tag: string;
  name: string;
  color: [number, number, number];
  government: GovernmentType;
  capitalProvinceId: number;
  primaryCulture: string;
  /** Primary religion at the exact historical start date. */
  religion?: string;
  coreStateIds?: number[];
  /** Optional 1–8 rank for procedural maps (overrides historical GP tag list). */
  greatPowerRank?: number;
  /** Political relationship at the exact historical start date. */
  polityStatus?: PolityStatus;
  /** Stable tag of the polity exercising suzerainty or imperial authority. */
  overlordTag?: string;
  /** Short 1830-specific description for the nation browser. */
  eraSummary?: string;
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
  /** Optional initial military controller when sovereignty and ground control differ. */
  controllerTag?: string;
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
