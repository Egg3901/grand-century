// The `with { type: 'json' }` attribute is required, not decorative: Node 22
// enforces it for JSON in ESM, and without it Playwright's loader throws while
// collecting specs — which silently took the entire e2e suite to 0 tests
// collected some time after 1.0.0. Vite/vitest/tsc all accept the attribute.
import worldSeedRaw from './generated/worldSeed.json' with { type: 'json' };
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
  /** World v8: name of the dominant pre-v8 province, the key for region-named content. */
  legacyName?: string | null;
  /** World v8: state name of that predecessor. */
  legacyStateName?: string | null;
}

export interface SeedState {
  id: number;
  name: string;
  ownerTag: string;
  provinceIds: number[];
  /** World v8: name of the dominant pre-v8 state, the key for region-named content. */
  legacyStateName?: string | null;
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

/**
 * Every other era ships its own compiled seed as a separate chunk, loaded on
 * demand: bundling all seven would add megabytes to every first load.
 * Callers that start or restore a world await `ensureScenario` first.
 * Unlike the static imports above these carry no `type: 'json'` attribute:
 * in the dev server the browser would then demand a JSON response for what
 * Vite serves as a module. tsx, Vitest and Metro resolve them without it.
 */
const SEED_LOADERS: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {
  '1700-01-01': () => import('./scenarios/1700-01-01/worldSeed.json'),
  '1776-07-04': () => import('./scenarios/1776-07-04/worldSeed.json'),
  '1815-06-18': () => import('./scenarios/1815-06-18/worldSeed.json'),
  '1914-07-28': () => import('./scenarios/1914-07-28/worldSeed.json'),
  '1936-01-01': () => import('./scenarios/1936-01-01/worldSeed.json'),
  '1945-09-02': () => import('./scenarios/1945-09-02/worldSeed.json'),
};

function derivedScenario(id: ScenarioId, manifest: ScenarioManifest, source: CompiledScenarioData): CompiledScenarioData {
  const yearDelta = manifest.startDate.year - source.manifest.startDate.year;
  const populationScale = Math.exp(yearDelta * 0.004);
  return Object.freeze({
    manifest: Object.freeze({
      ...manifest,
      id,
      seedProvenance: Object.freeze({ kind: 'inherited_development' as const, sourceScenarioId: source.manifest.id }),
    }),
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
        eraSummary: nation.eraSummary,
      })),
      formables: source.worldSeed.formables?.map((formable) => ({
        ...formable,
        candidateTags: formable.candidateTags.slice(),
        coreStateIds: formable.coreStateIds.slice(),
      })),
    },
  });
}

/**
 * Hidden scenario ids for campaigns saved while 1914 and 1945 still borrowed
 * the 1936 world (the first world v8 release). Their saves keep loading
 * against the exact seed they were made with; they never appear in menus.
 */
export const BORROWED_1936_SCENARIOS: Readonly<Record<string, ScenarioId>> = {
  '1914-07-28': '1914-07-28@v8.0',
  '1945-09-02': '1945-09-02@v8.0',
};
const BORROWED_SOURCE: Readonly<Record<string, ScenarioManifest>> = {
  '1914-07-28@v8.0': scenario1914Manifest,
  '1945-09-02@v8.0': scenario1945Manifest,
};

const COMPILED_SCENARIOS = new Map<ScenarioId, CompiledScenarioData>([[SCENARIO_1830.manifest.id, SCENARIO_1830]]);
const MANIFEST_BY_ID = new Map<ScenarioId, ScenarioManifest>(SCENARIO_MANIFESTS.map((manifest) => [manifest.id, manifest]));
const PENDING = new Map<ScenarioId, Promise<CompiledScenarioData>>();

/** Thrown by `loadScenario` for a known era whose seed has not been fetched yet. */
export class ScenarioNotLoadedError extends Error {
  readonly scenarioId: ScenarioId;
  constructor(scenarioId: ScenarioId) {
    super(`Scenario ${scenarioId} is not loaded yet; await ensureScenario first.`);
    this.name = 'ScenarioNotLoadedError';
    this.scenarioId = scenarioId;
  }
}

export function isScenarioLoaded(id: ScenarioId): boolean {
  return COMPILED_SCENARIOS.has(id);
}

/** Fetch an era's compiled seed (once) so `loadScenario` can resolve it synchronously. */
export function ensureScenario(id: ScenarioId): Promise<CompiledScenarioData> {
  const loaded = COMPILED_SCENARIOS.get(id);
  if (loaded) return Promise.resolve(loaded);
  const pending = PENDING.get(id);
  if (pending) return pending;
  let promise: Promise<CompiledScenarioData>;
  if (BORROWED_SOURCE[id]) {
    promise = ensureScenario('1936-01-01').then((source) => derivedScenario(id, BORROWED_SOURCE[id], source));
  } else {
    const manifest = MANIFEST_BY_ID.get(id);
    const loader = SEED_LOADERS[id];
    if (!manifest || !loader) return Promise.reject(new Error(`Unknown scenario: ${id}`));
    promise = loader().then((module) => Object.freeze({ manifest, worldSeed: module.default as WorldSeedData }));
  }
  const tracked = promise.then((scenario) => {
    COMPILED_SCENARIOS.set(id, scenario);
    PENDING.delete(id);
    return scenario;
  }, (error: unknown) => {
    PENDING.delete(id);
    throw error;
  });
  PENDING.set(id, tracked);
  return tracked;
}

/** Load every era seed, including hidden compatibility worlds (server and native, where bundles are not split). */
export function preloadScenarios(): Promise<void> {
  const ids = [...SCENARIO_MANIFESTS.map((manifest) => manifest.id), ...Object.keys(BORROWED_SOURCE)];
  return Promise.all(ids.map((id) => ensureScenario(id))).then(() => undefined);
}

/** Run a synchronous step that may need era seeds, loading them as it asks. */
export async function withScenarios<T>(step: () => T): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return step();
    } catch (error) {
      if (!(error instanceof ScenarioNotLoadedError)) throw error;
      await ensureScenario(error.scenarioId);
    }
  }
  return step();
}

/** Manifest for any scenario, available without its seed. */
export function scenarioManifest(id: ScenarioId): ScenarioManifest {
  const manifest = MANIFEST_BY_ID.get(id) ?? COMPILED_SCENARIOS.get(id)?.manifest
    ?? (BORROWED_SOURCE[id] ? Object.freeze({ ...BORROWED_SOURCE[id], id }) : undefined);
  if (!manifest) throw new Error(`Unknown scenario: ${id}`);
  return manifest;
}

export const DEFAULT_SCENARIO_ID: ScenarioId = SCENARIO_1830.manifest.id;

/** List scenario metadata without exposing mutable runtime artifacts. */
export function listScenarios(): readonly ScenarioManifest[] {
  return SCENARIO_MANIFESTS;
}

/** Resolve one compiled scenario or fail before simulation bootstrap. */
export function loadScenario(id: ScenarioId): CompiledScenarioData {
  const scenario = COMPILED_SCENARIOS.get(id);
  if (scenario) return scenario;
  if (MANIFEST_BY_ID.has(id) || BORROWED_SOURCE[id]) throw new ScenarioNotLoadedError(id);
  throw new Error(`Unknown scenario: ${id}`);
}

export const DEFAULT_SCENARIO = loadScenario(DEFAULT_SCENARIO_ID);

/** Compatibility alias while callers migrate to the scenario catalog. */
export const WORLD_SEED = DEFAULT_SCENARIO.worldSeed;
export const PROVINCE_COUNT = WORLD_SEED.provinces.length;
