// The `with { type: 'json' }` attribute is required, not decorative: Node 22
// enforces it for JSON in ESM, and without it Playwright's loader throws while
// collecting specs — which silently took the entire e2e suite to 0 tests
// collected some time after 1.0.0. Vite/vitest/tsc all accept the attribute.
import worldSeedRaw from './generated/worldSeed.json' with { type: 'json' };
import worldSeed1700Raw from './scenarios/1700-01-01/worldSeed.json' with { type: 'json' };
import worldSeed1936Raw from './scenarios/1936-01-01/worldSeed.json' with { type: 'json' };
import scenario1700ManifestRaw from '../../content/scenarios/1700-01-01/manifest.json' with { type: 'json' };
import scenario1776ManifestRaw from '../../content/scenarios/1776-07-04/manifest.json' with { type: 'json' };
import scenario1815ManifestRaw from '../../content/scenarios/1815-06-18/manifest.json' with { type: 'json' };
import scenario1830ManifestRaw from '../../content/scenarios/1830-01-01/manifest.json' with { type: 'json' };
import scenario1914ManifestRaw from '../../content/scenarios/1914-07-28/manifest.json' with { type: 'json' };
import scenario1936ManifestRaw from '../../content/scenarios/1936-01-01/manifest.json' with { type: 'json' };
import scenario1945ManifestRaw from '../../content/scenarios/1945-09-02/manifest.json' with { type: 'json' };
import type {
  GovernmentType,
  PolityStatus,
  ScenarioId,
  ScenarioManifest,
  Terrain,
} from '../shared/types';

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
  /** Technologies held on the exact scenario start date. */
  initialTechs?: string[];
  /** Include every dated technology at or before this year when no explicit list is supplied. */
  initialTechYear?: number;
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

export interface CompiledScenarioData {
  readonly manifest: ScenarioManifest;
  readonly worldSeed: WorldSeedData;
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

function freezeScenarioManifest(raw: ScenarioManifest): ScenarioManifest {
  return Object.freeze({
    ...raw,
    startDate: Object.freeze({ ...raw.startDate }),
    seedProvenance: raw.seedProvenance ? Object.freeze({ ...raw.seedProvenance }) : undefined,
    visualPolicy: Object.freeze({ ...raw.visualPolicy }),
  }) as ScenarioManifest;
}

const scenario1700Manifest = freezeScenarioManifest(scenario1700ManifestRaw as ScenarioManifest);
const scenario1776Manifest = freezeScenarioManifest(scenario1776ManifestRaw as ScenarioManifest);
const scenario1815Manifest = freezeScenarioManifest(scenario1815ManifestRaw as ScenarioManifest);
const scenario1830Manifest = freezeScenarioManifest(scenario1830ManifestRaw as ScenarioManifest);
const scenario1914Manifest = freezeScenarioManifest(scenario1914ManifestRaw as ScenarioManifest);
const scenario1936Manifest = freezeScenarioManifest(scenario1936ManifestRaw as ScenarioManifest);
const scenario1945Manifest = freezeScenarioManifest(scenario1945ManifestRaw as ScenarioManifest);

const SCENARIO_MANIFESTS: readonly ScenarioManifest[] = Object.freeze([
  scenario1700Manifest,
  scenario1776Manifest,
  scenario1815Manifest,
  scenario1830Manifest,
  scenario1914Manifest,
  scenario1936Manifest,
  scenario1945Manifest,
]);

const SCENARIO_1830: CompiledScenarioData = Object.freeze({
  manifest: scenario1830Manifest,
  worldSeed: worldSeedRaw as WorldSeedData,
});

const SCENARIO_1700: CompiledScenarioData = Object.freeze({
  manifest: scenario1700Manifest,
  worldSeed: worldSeed1700Raw as unknown as WorldSeedData,
});

const SCENARIO_1936: CompiledScenarioData = Object.freeze({
  manifest: scenario1936Manifest,
  worldSeed: worldSeed1936Raw as unknown as WorldSeedData,
});

function derivedScenario(manifest: ScenarioManifest, source: CompiledScenarioData): CompiledScenarioData {
  const yearDelta = manifest.startDate.year - source.manifest.startDate.year;
  const populationScale = Math.exp(yearDelta * 0.004);
  return Object.freeze({
    manifest,
    worldSeed: {
      ...source.worldSeed,
      source: `${manifest.id} development seed inherited from ${source.manifest.id}`,
      provinces: source.worldSeed.provinces.map((province) => ({
        ...province,
        populationWeight: province.populationWeight * populationScale,
      })),
      states: source.worldSeed.states.map((state) => ({ ...state, provinceIds: state.provinceIds.slice() })),
      nations: source.worldSeed.nations.map((nation) => ({
        ...nation,
        coreStateIds: nation.coreStateIds?.slice(),
        initialTechYear: nation.initialTechYear === undefined
          ? undefined
          : nation.initialTechYear + yearDelta,
        eraSummary: manifest.seedProvenance?.limitations ?? nation.eraSummary,
      })),
      formables: source.worldSeed.formables?.map((formable) => ({
        ...formable,
        candidateTags: formable.candidateTags.slice(),
        coreStateIds: formable.coreStateIds.slice(),
      })),
    },
  });
}

const SCENARIO_1776 = derivedScenario(scenario1776Manifest, SCENARIO_1700);
const SCENARIO_1815 = derivedScenario(scenario1815Manifest, SCENARIO_1830);
const SCENARIO_1914 = derivedScenario(scenario1914Manifest, SCENARIO_1936);
const SCENARIO_1945 = derivedScenario(scenario1945Manifest, SCENARIO_1936);

const COMPILED_SCENARIOS: ReadonlyMap<ScenarioId, CompiledScenarioData> = new Map([
  [SCENARIO_1700.manifest.id, SCENARIO_1700],
  [SCENARIO_1776.manifest.id, SCENARIO_1776],
  [SCENARIO_1815.manifest.id, SCENARIO_1815],
  [SCENARIO_1830.manifest.id, SCENARIO_1830],
  [SCENARIO_1914.manifest.id, SCENARIO_1914],
  [SCENARIO_1936.manifest.id, SCENARIO_1936],
  [SCENARIO_1945.manifest.id, SCENARIO_1945],
]);

export const DEFAULT_SCENARIO_ID: ScenarioId = SCENARIO_1830.manifest.id;

/** List scenario metadata without exposing mutable runtime artifacts. */
export function listScenarios(): readonly ScenarioManifest[] {
  return SCENARIO_MANIFESTS;
}

/** Resolve one compiled scenario or fail before simulation bootstrap. */
export function loadScenario(id: ScenarioId): CompiledScenarioData {
  const scenario = COMPILED_SCENARIOS.get(id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}

export const DEFAULT_SCENARIO = loadScenario(DEFAULT_SCENARIO_ID);

/** Compatibility alias while callers migrate to the scenario catalog. */
export const WORLD_SEED = DEFAULT_SCENARIO.worldSeed;
export const PROVINCE_COUNT = WORLD_SEED.provinces.length;
