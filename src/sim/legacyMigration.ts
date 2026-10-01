/**
 * Legacy save migration: the 387-province 1830 world (pre world v8) onto the
 * shipped 2,091-province world.
 *
 * A legacy save is a whole serialized World that addresses provinces, states
 * and pops by dense array index, and nations by array index too. None of those
 * indexes mean the same thing on the new map, so a legacy World is never
 * patched in place. Instead a fresh World is bootstrapped on the new seed with
 * the save's own scenario, rng seed and map mode, and the campaign is replayed
 * onto it field by field:
 *
 *  - nations are matched by their ORIGINAL 1830 tag (old nation id i is legacy
 *    seed nation i, so a nation that formed GER is still found as PRU);
 *  - provinces/states go through the area mapping in
 *    src/data/generated/legacy-migration.json (old province -> new provinces
 *    with the share of the old province's area each one received);
 *  - pops are re-cut by those shares and re-merged per new province;
 *  - everything that cannot be expressed on the new map is dropped and counted
 *    in the report.
 *
 * Procedural map saves (procedural_real / procedural_random) cannot be matched
 * by tag: their nations were generated for the old province graph. They keep
 * their own nation list verbatim (identity nation ids) and every new province
 * takes the current owner of its dominant predecessor.
 *
 * Field table (World). copied = same value; remapped = ids translated through
 * the nation / province / state maps; rebuilt = taken from the fresh new-world
 * bootstrap; dropped = not carried, with the reason.
 *
 * | World field          | Migration |
 * |----------------------|-----------|
 * | day                  | copied |
 * | scenarioId           | copied |
 * | startDate            | copied |
 * | seed                 | copied |
 * | rngState             | copied (the campaign's rng stream continues) |
 * | speed                | copied |
 * | playerNation         | remapped by tag (vanished tag: the nation that now holds its land) |
 * | mapMode              | copied |
 * | nations              | rebuilt from the new seed, campaign state copied by tag (see Nation table) |
 * | provinces            | rebuilt; owner/controller/occupation/fort/naval from predecessors (rules below) |
 * | states               | rebuilt; owner normalized from provinces, factories and unrest moved from predecessors |
 * | pops                 | remapped: re-cut by area share, merged per province, fresh ids |
 * | market               | copied when the goods table is unchanged, else rebuilt |
 * | marketRuntime        | copied when the goods table is unchanged, else rebuilt |
 * | marketInvariants     | copied when the goods table is unchanged, else rebuilt |
 * | armies               | remapped: owner, location, moveTarget, sourcePop, hostileTo, rebel demand states |
 * | fleets               | remapped: owner, coastal location, coastal moveTarget, embarkedArmy |
 * | wars                 | remapped: participants, goal holder/target/stateId; empty side drops the war |
 * | rebellions           | remapped: targetNation, originState, demand stateIds |
 * | relations            | new-world pairs, overlaid with remapped campaign relations |
 * | pendingEvents        | remapped nationId |
 * | eventLastFired       | remapped key suffix (`event:nation`) |
 * | decisionLastTaken    | remapped key suffix (`decision:nation`) |
 * | recentBattles        | remapped province / nations (display log) |
 * | chronicle            | copied (keyed by tag, no ids) |
 * | chronicleWarIds      | copied (war ids are preserved) |
 * | nextEventInstanceId  | copied |
 * | nextArmyId           | copied (army ids are preserved) |
 * | nextFleetId          | copied (fleet ids are preserved) |
 * | nextWarId            | copied (war ids are preserved) |
 * | nextRebellionId      | copied (rebellion ids are preserved) |
 * | nextPopId            | rebuilt: pops.length after the re-cut |
 * | tension              | copied |
 * | crisis               | remapped subject/leads/backers/stateId; dropped if a lead or subject is gone |
 * | congresses           | remapped subject/winner/loser (display ledger) |
 * | nextCrisisId         | copied |
 * | crisisCooldownUntil  | copied |
 * | movements            | remapped nation, heartlandStateIds (recomputed monthly anyway) |
 * | nextMovementId       | copied |
 * | popMobilityLedger    | copied (player totals, no ids) |
 * | migrations           | appended with this migration's report |
 *
 * Save runtimes (not on World, exported beside it):
 *
 * | Runtime field                 | Migration |
 * |-------------------------------|-----------|
 * | diplomacy.pendingCbs/activeCbs| remapped holder/target/stateId |
 * | diplomacy.influence           | remapped gp/target |
 * | diplomacy.influencePool       | remapped per nation, new nations keep defaults |
 * | diplomacy.diplomaticPoints    | remapped per nation, new nations keep defaults |
 * | diplomacy.powerScores         | rebuilt (recomputed every month) |
 * | diplomacy.coalitionAgainst    | remapped |
 * | war.generalPools              | remapped nation |
 * | war.mobilizedNations          | remapped |
 * | war.mobilizedArmyIds          | remapped nation, army ids filtered to surviving armies |
 * | war.battleScoreByWar          | kept for surviving wars |
 * | war.colonialClaims            | stateId to the largest still-colonial successor, claimants remapped |
 * | war.colonialPointModifiers    | remapped nation |
 *
 * Nation fields (matched by original tag):
 *
 * | Nation field                     | Migration |
 * |----------------------------------|-----------|
 * | id                               | rebuilt (new index) |
 * | tag, name, color                 | rebuilt, unless the nation formed a new tag in the campaign: then copied |
 * | primaryCulture                   | rebuilt, unless formed: then copied |
 * | acceptedCultures                 | union of new and campaign |
 * | government, rulingParty, parties | copied |
 * | upperHouse, election*            | copied |
 * | capital                          | rebuilt if still owned, else the owned successor of the old capital |
 * | coreStateIds                     | rebuilt, plus remapped cores gained during the campaign |
 * | polityStatus, overlordNation     | rebuilt (static 1830 constitution, not mutated by the sim) |
 * | eraSummary                       | rebuilt (static copy) |
 * | treasury, prestige, infamy       | copied |
 * | literacy, nationalConsciousness  | copied |
 * | researchPoints, techs            | copied |
 * | currentResearch, researchProgress| copied |
 * | inventions                       | copied |
 * | reforms, reformFatigue           | copied |
 * | tax and tariff sliders           | copied |
 * | gpRank                           | copied (recomputed monthly) |
 * | spheredBy, sphereMembers         | remapped (vanished members dropped) |
 * | colonialPoints                   | copied |
 * | isCivilized, isBankrupt, bankruptcyMonths, constructionBlocked | copied |
 * | monthlyTariffIncome, monthlyProductionIncome, lastBudget       | copied |
 * | isPlayer                         | rebuilt from playerNation |
 * | regimentsPerSoldierPop, standingRegimentCapacity, mobilizationCapacity, armyOrganization, armyMorale | rebuilt from migrated pops and copied reforms |
 * | culturePolicy, culturePolicyChangedDay, assimilationByCulture   | copied (culture indexes are unchanged) |
 * | stockpile, stockpileOrders       | copied (good ids are unchanged) |
 * | any field not listed             | copied |
 *
 * Nations present only on the new map keep their fresh 1830 state. The four
 * 1830 tags of the old map that no longer exist (HDJ, ORA, ORI, TRN) are not
 * nations any more: their land follows the province rule, their armies and
 * fleets pass to the nation that now holds their 1830 land, and their
 * diplomatic records are dropped.
 *
 * Province rule (historical maps): for each new province take its dominant
 * legacy predecessor. If that old province's current owner is still its 1830
 * owner, the new map's own 1830 owner stands (it is more accurate); otherwise
 * the campaign's owner wins. A state is always held by one nation in this sim
 * (annexation and colonization move whole states), so each new state then
 * goes to the owner holding most of its population weight and every province
 * in it follows. Controller and occupation are carried when the province keeps
 * the campaign owner. Fort and naval levels take the largest raised
 * predecessor level.
 */
import legacySeedRaw from '../../content/world-v8/legacy/worldSeed-1830.json' with { type: 'json' };
import legacyMappingRaw from '../data/generated/legacy-migration.json' with { type: 'json' };
import { loadScenario, type WorldSeedData } from '../data/generated';
import { gameDataForScenario } from '../data/gameData';
import type {
  Army,
  CampaignMapMode,
  CasusBelli,
  DiploRelation,
  Factory,
  Fleet,
  GameData,
  Nation,
  NationId,
  Pop,
  PopId,
  ProvinceId,
  StateId,
  War,
  World,
  WorldMigrationReport,
} from '../shared/types';
import { createWorld } from './bootstrap';
import { resolveWorldSeed } from './proceduralWorld';
import { updateMilitaryDerivedForNation } from './politics';
import {
  exportDiplomacyRuntime,
  importDiplomacyRuntime,
  type DiplomacyRuntimeSnapshot,
} from './systems/diplomacy';
import { exportWarRuntime, importWarRuntime, type WarRuntimeSnapshot } from './systems/war';

/** Identity of the world the legacy saves were written against. */
export const LEGACY_WORLD_ID = 'legacy-1830-387';
export const LEGACY_PROVINCE_COUNT = 387;
/** Scenarios whose legacy saves can be migrated (they ran on the 387 seed directly). */
export const LEGACY_MIGRATABLE_SCENARIOS: readonly string[] = ['1830-01-01'];

export const LEGACY_WORLD_SEED = legacySeedRaw as unknown as WorldSeedData;

interface LegacyMappingFile {
  from: string;
  to: string;
  provinces: Record<string, [number, number][]>;
  states: Record<string, number[]>;
}
const LEGACY_MAPPING = legacyMappingRaw as unknown as LegacyMappingFile;

/**
 * Nine old island groups sat at placeholder coordinates that overlap no new
 * province, so the area mapping has no successor for them. They are pinned by
 * hand to the new-map provinces that represent the same islands (or, for the
 * South Atlantic group the new map does not carry, the nearest South Atlantic
 * land). Shares are split by new population weight.
 */
const UNMAPPED_LEGACY_PROVINCES: Readonly<Record<number, readonly number[]>> = {
  32: [2078], // Bonin Islands -> Ogasawara
  80: [2071], // Eastern Polynesia -> Easter Island
  92: [1424, 2063, 2079], // Fiji -> Suva, Lau, Rotuma
  113: [1487], // Hawaiian Islands -> Hilo
  130: [2023, 2067, 2073, 2080, 2069], // Indian Ocean Territory -> Mascarenes and Seychelles
  155: [2074, 2049, 2087], // Kiribati -> Gilbert, Line, Phoenix islands
  181: [2021, 2050, 1987], // Macaronesia -> Azores, Madeira, Cape Verde
  190: [2037, 2051, 2077, 2045, 2090], // Micronesia -> Guam, Pohnpei, Chuuk, Palau, Woleai
  307: [1619], // South Atlantic Islands -> Falklands
};

const PLACEHOLDER_TAGS = new Set(['COL', 'UNC', 'UNA']);
/** Below this many people a re-cut pop fragment folds into its largest sibling. */
const MIN_POP_FRAGMENT = 10;

export interface LegacySaveRuntimes {
  diplomacy?: DiplomacyRuntimeSnapshot | null;
  war?: WarRuntimeSnapshot | null;
}

export interface LegacyMigrationResult {
  world: World;
  runtimes: { diplomacy: DiplomacyRuntimeSnapshot; war: WarRuntimeSnapshot };
  report: WorldMigrationReport;
}

interface Share {
  id: number;
  share: number;
}

function sortShares(list: Share[]): Share[] {
  return list.sort((a, b) => b.share - a.share || a.id - b.id);
}

function normalize(list: Share[]): Share[] {
  const total = list.reduce((sum, item) => sum + item.share, 0);
  if (total <= 0) return list.map((item) => ({ id: item.id, share: 1 / Math.max(1, list.length) }));
  return list.map((item) => ({ id: item.id, share: item.share / total }));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Old start-of-campaign fort level (the bootstrap formula that built the legacy world). */
function legacyStartFort(terrain: string): number {
  return terrain === 'mountains' || terrain === 'hills' ? 1 : 0;
}

function legacyStartNaval(coastal: boolean, ownerTag: string): number {
  return coastal && (ownerTag === 'ENG' || ownerTag === 'USA' || ownerTag === 'NLD') ? 1 : 0;
}

function gameDataForMigration(scenarioId: string, mapMode: CampaignMapMode, seed: number): GameData {
  const scenarioData = gameDataForScenario(scenarioId);
  if (mapMode === 'historical') return scenarioData;
  const worldSeed = resolveWorldSeed(loadScenario(scenarioId).worldSeed, seed, mapMode);
  return {
    ...scenarioData,
    formables: [],
    nationCores: Object.fromEntries(
      worldSeed.nations.map((nation) => [nation.tag, (nation.coreStateIds ?? []).slice()]),
    ),
  };
}

class Report {
  readonly carried: Record<string, number> = {};
  readonly dropped: Record<string, number> = {};
  carry(key: string, amount = 1): void {
    this.carried[key] = (this.carried[key] ?? 0) + amount;
  }
  drop(reason: string, amount = 1): void {
    this.dropped[reason] = (this.dropped[reason] ?? 0) + amount;
  }
}

/** Static province/state correspondence between the legacy and the new map. */
interface MapCorrespondence {
  /** old province -> new provinces (normalized shares, largest first). */
  succ: Share[][];
  /** new province -> old provinces with the share of the OLD province's area it took. */
  pred: Share[][];
  /** new province -> dominant legacy predecessor, -1 when none. */
  domPred: number[];
  /** old state -> new states weighted by migrated population weight, largest first. */
  stateSucc: Share[][];
  /** new state -> old states with that same weight. */
  statePred: Share[][];
}

function buildCorrespondence(newSeed: WorldSeedData): MapCorrespondence {
  const oldCount = LEGACY_WORLD_SEED.provinces.length;
  const newCount = newSeed.provinces.length;
  const succ: Share[][] = Array.from({ length: oldCount }, () => []);
  for (let o = 0; o < oldCount; o++) {
    const mapped = LEGACY_MAPPING.provinces[String(o)];
    if (mapped && mapped.length > 0) {
      succ[o] = mapped
        .filter(([p]) => p >= 0 && p < newCount)
        .map(([p, share]) => ({ id: p, share: Math.max(0, share) }));
    } else if (UNMAPPED_LEGACY_PROVINCES[o]) {
      succ[o] = UNMAPPED_LEGACY_PROVINCES[o]
        .filter((p) => p < newCount)
        .map((p) => ({ id: p, share: Math.max(0.01, newSeed.provinces[p]?.populationWeight ?? 0) }));
    }
    succ[o] = sortShares(normalize(succ[o]));
  }
  const pred: Share[][] = Array.from({ length: newCount }, () => []);
  succ.forEach((list, o) => list.forEach(({ id, share }) => pred[id].push({ id: o, share })));
  for (const list of pred) sortShares(list);

  const oldIdsByName = new Map<string, number[]>();
  LEGACY_WORLD_SEED.provinces.forEach((province) => {
    const ids = oldIdsByName.get(province.name) ?? [];
    ids.push(province.id);
    oldIdsByName.set(province.name, ids);
  });
  const domPred = pred.map((list, p) => {
    if (list.length === 0) return -1;
    // The world v8 pipeline names each new province's dominant predecessor by
    // area overlap; prefer it so the migration agrees with region-keyed content.
    const legacyName = newSeed.provinces[p]?.legacyName;
    const named = legacyName ? (oldIdsByName.get(legacyName) ?? []) : [];
    const hit = list.find((item) => named.includes(item.id));
    return (hit ?? list[0]).id;
  });

  const oldStateCount = LEGACY_WORLD_SEED.states.length;
  const stateWeights: Map<number, number>[] = Array.from({ length: oldStateCount }, () => new Map());
  LEGACY_WORLD_SEED.provinces.forEach((province) => {
    const weight = Math.max(0.05, province.populationWeight);
    for (const { id, share } of succ[province.id]) {
      const newState = newSeed.provinces[id]?.stateId;
      if (newState === undefined) continue;
      const map = stateWeights[province.stateId];
      map.set(newState, (map.get(newState) ?? 0) + share * weight);
    }
  });
  const stateSucc = stateWeights.map((map, oldState) => {
    const list: Share[] = Array.from(map.entries()).map(([id, share]) => ({ id, share }));
    // The pipeline's state list is authoritative for membership; add any it names
    // that the province shares missed with a negligible weight.
    for (const id of LEGACY_MAPPING.states[String(oldState)] ?? []) {
      if (!map.has(id) && id < newSeed.states.length) list.push({ id, share: 1e-9 });
    }
    return sortShares(list);
  });
  const statePred: Share[][] = Array.from({ length: newSeed.states.length }, () => []);
  stateSucc.forEach((list, oldState) => list.forEach(({ id, share }) => statePred[id].push({ id: oldState, share })));
  for (const list of statePred) sortShares(list);
  return { succ, pred, domPred, stateSucc, statePred };
}

interface NationPlan {
  /** 'tag': matched onto the new seed's nations. 'identity': the save keeps its own nations. */
  mode: 'tag' | 'identity';
  /** old nation -> new nation for diplomatic records, -1 when the nation no longer exists. */
  strict: (oldId: number) => NationId;
  /** old nation -> new nation for land and forces: a vanished tag resolves to the holder of its land. */
  land: (oldId: number) => NationId;
  /** old nation ids whose tag changed during the campaign (formables). */
  formed: Set<number>;
}

function mapSet<T>(values: readonly T[] | undefined, fn: (value: T) => number): number[] {
  if (!values) return [];
  const out = new Set<number>();
  for (const value of values) {
    const mapped = fn(value);
    if (mapped >= 0) out.add(mapped);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * Migrate a legacy (387-province) save to the shipped world. Pure: the input is
 * not mutated. Returns the new World, its save runtimes and a report.
 */
export function migrateLegacySave(oldInput: World, oldRuntimes: LegacySaveRuntimes = {}): LegacyMigrationResult {
  const old = clone(oldInput);
  const report = new Report();
  const scenarioId = old.scenarioId ?? LEGACY_MIGRATABLE_SCENARIOS[0];
  if (!LEGACY_MIGRATABLE_SCENARIOS.includes(scenarioId)) {
    throw new Error(`Legacy migration does not support scenario ${scenarioId}.`);
  }
  const mapMode: CampaignMapMode = old.mapMode ?? 'historical';
  const data = gameDataForMigration(scenarioId, mapMode, old.seed);
  const world = createWorld(data, old.seed, mapMode);
  const newSeed = loadScenario(scenarioId).worldSeed;
  const corr = buildCorrespondence(newSeed);
  const bootstrapOwner = world.provinces.map((province) => province.owner);
  const bootstrapStateOwner = world.states.map((state) => state.owner);
  const oldProvinceCount = old.provinces.length;
  const oldProvince = (id: number) => (id >= 0 && id < oldProvinceCount ? old.provinces[id] : undefined);

  // ---------------------------------------------------------------------------
  // Nations
  // ---------------------------------------------------------------------------
  const plan = buildNationPlan(old, world, corr, mapMode, report);
  if (plan.mode === 'identity') {
    world.nations = clone(old.nations).map((nation, id) => ({ ...nation, id }));
  }
  const nationCount = () => world.nations.length;
  const validNation = (id: number) => id >= 0 && id < nationCount();

  // ---------------------------------------------------------------------------
  // Provinces: owner, controller, occupation, forts
  // ---------------------------------------------------------------------------
  const legacyStartOwnerOldId = new Map<number, number>();
  if (plan.mode === 'tag') {
    const oldIdByTag = new Map(LEGACY_WORLD_SEED.nations.map((nation, id) => [nation.tag, id]));
    LEGACY_WORLD_SEED.provinces.forEach((province) => {
      legacyStartOwnerOldId.set(province.id, oldIdByTag.get(province.ownerTag) ?? -1);
    });
  }
  const candidateOwner = world.provinces.map((_province, p) => {
    const o = corr.domPred[p];
    const source = oldProvince(o);
    if (!source) return plan.mode === 'tag' ? bootstrapOwner[p] : -1;
    if (plan.mode === 'tag' && source.owner === legacyStartOwnerOldId.get(o)) return bootstrapOwner[p];
    const mapped = plan.land(source.owner);
    if (mapped >= 0) return mapped;
    report.drop('province_owner_unmapped_kept_1830');
    return plan.mode === 'tag' ? bootstrapOwner[p] : -1;
  });
  if (plan.mode === 'identity') fillFromNeighbors(world, candidateOwner);

  // One owner per state: the owner with the most population weight in it.
  let normalizedProvinces = 0;
  for (const state of world.states) {
    const tally = new Map<number, number>();
    for (const p of state.provinceIds) {
      const owner = candidateOwner[p];
      if (owner < 0) continue;
      const weight = Math.max(0.01, newSeed.provinces[p]?.populationWeight ?? 0);
      tally.set(owner, (tally.get(owner) ?? 0) + weight);
    }
    let best = plan.mode === 'tag' ? bootstrapStateOwner[state.id] : (candidateOwner[state.provinceIds[0]] ?? 0);
    let bestWeight = tally.get(best) ?? -1;
    // Ties keep the starting candidate (the new map's 1830 owner on historical maps).
    for (const [owner, weight] of tally) {
      if (weight > bestWeight + 1e-12) {
        best = owner;
        bestWeight = weight;
      }
    }
    if (!validNation(best)) best = 0;
    state.owner = best;
    for (const p of state.provinceIds) {
      if (candidateOwner[p] !== best) normalizedProvinces += 1;
      const province = world.provinces[p];
      province.owner = best;
      province.controller = best;
      province.occupationProgress = 0;
    }
  }
  report.carry('provinces_owner_normalized_to_state', normalizedProvinces);

  let occupied = 0;
  let changedHands = 0;
  for (const province of world.provinces) {
    const p = province.id;
    const owner = world.nations[province.owner];
    province.colonial = PLACEHOLDER_TAGS.has(owner?.tag ?? '');
    if (province.owner !== bootstrapOwner[p]) changedHands += 1;
    const o = corr.domPred[p];
    const source = oldProvince(o);
    if (source && source.controller !== source.owner && plan.land(source.owner) === province.owner) {
      const controller = plan.land(source.controller);
      if (validNation(controller) && controller !== province.owner) {
        province.controller = controller;
        province.occupationProgress = source.occupationProgress;
        occupied += 1;
      } else {
        report.drop('occupation_controller_unmapped');
      }
    }
    // Forts and naval bases: the largest level any predecessor raised above its start.
    for (const { id } of corr.pred[p]) {
      const before = oldProvince(id);
      const seed = LEGACY_WORLD_SEED.provinces[id];
      if (!before || !seed) continue;
      if (before.fortLevel > legacyStartFort(seed.terrain)) {
        province.fortLevel = Math.max(province.fortLevel, before.fortLevel);
      }
      if (province.coastal && before.navalBaseLevel > legacyStartNaval(seed.coastal, seed.ownerTag)) {
        province.navalBaseLevel = Math.max(province.navalBaseLevel, before.navalBaseLevel);
      }
    }
  }
  report.carry('provinces', world.provinces.length);
  report.carry('provinces_owner_differs_from_1830', changedHands);
  report.carry('provinces_occupied', occupied);

  // Province and state pickers used by every remap below.
  const ownerOf = (p: number) => world.provinces[p]?.owner ?? -1;
  const pickProvince = (oldP: number, prefer: (p: number) => number): number => {
    const list = corr.succ[oldP] ?? [];
    if (list.length === 0) return -1;
    let best = list[0].id;
    let bestRank = prefer(best);
    for (const { id } of list) {
      const rank = prefer(id);
      if (rank > bestRank) {
        best = id;
        bestRank = rank;
      }
    }
    return best;
  };
  const pickState = (oldS: number, preferOwner: number): StateId => {
    if (oldS < 0) return -1;
    const list = corr.stateSucc[oldS] ?? [];
    if (list.length === 0) return -1;
    const owned = list.find(({ id }) => world.states[id]?.owner === preferOwner);
    return (owned ?? list[0]).id;
  };
  const allStates = (oldStates: readonly number[] | undefined): StateId[] => {
    const out = new Set<number>();
    for (const s of oldStates ?? []) for (const { id } of corr.stateSucc[s] ?? []) out.add(id);
    return Array.from(out).sort((a, b) => a - b);
  };

  // ---------------------------------------------------------------------------
  // Pops
  // ---------------------------------------------------------------------------
  const oldPopToNew = migratePops(old, world, corr, report);

  // ---------------------------------------------------------------------------
  // States: factories and unrest
  // ---------------------------------------------------------------------------
  const stateHasPred = world.states.map((state) => (corr.statePred[state.id]?.length ?? 0) > 0);
  let freshFactoryLevels = 0;
  for (const state of world.states) {
    if (stateHasPred[state.id]) state.factories = [];
    else freshFactoryLevels += state.factories.reduce((sum, factory) => sum + factory.level, 0);
  }
  report.carry('factory_levels_fresh_on_new_land', freshFactoryLevels);
  let factories = 0;
  for (const oldState of old.states) {
    if (oldState.factories.length === 0) continue;
    const owner = plan.land(oldState.owner);
    const target = pickState(oldState.id, owner);
    if (target < 0) {
      report.drop('factory_state_unmapped', oldState.factories.length);
      continue;
    }
    for (const factory of oldState.factories) {
      mergeFactory(world.states[target].factories, factory);
      factories += 1;
    }
  }
  report.carry('factories', factories);
  for (const state of world.states) {
    const preds = corr.statePred[state.id] ?? [];
    if (preds.length === 0) continue;
    let weight = 0;
    let risk = 0;
    let months = 0;
    let lastRebellion = state.lastRebellionDay;
    for (const { id, share } of preds) {
      const source = old.states[id];
      if (!source) continue;
      weight += share;
      risk += share * (source.unrestRisk ?? 0);
      months += share * (source.unrestMonths ?? 0);
      lastRebellion = Math.max(lastRebellion, source.lastRebellionDay ?? lastRebellion);
    }
    if (weight > 0) {
      state.unrestRisk = risk / weight;
      state.unrestMonths = Math.round(months / weight);
    }
    state.lastRebellionDay = lastRebellion;
  }

  // ---------------------------------------------------------------------------
  // Nation state (needs final ownership)
  // ---------------------------------------------------------------------------
  migrateNations(old, world, plan, pickProvince, allStates, report);

  // ---------------------------------------------------------------------------
  // World scalars
  // ---------------------------------------------------------------------------
  world.day = old.day;
  world.scenarioId = scenarioId;
  world.startDate = old.startDate ? { ...old.startDate } : world.startDate;
  world.seed = old.seed;
  world.rngState = old.rngState;
  world.speed = old.speed;
  world.mapMode = mapMode;
  const goodsMatch = old.market?.length === world.market.length
    && old.market.every((good, index) => good.good === world.market[index].good);
  if (goodsMatch) {
    world.market = old.market;
    if (old.marketRuntime?.length === world.marketRuntime.length) world.marketRuntime = old.marketRuntime;
    if (old.marketInvariants?.length === world.marketInvariants.length) world.marketInvariants = old.marketInvariants;
  } else {
    report.drop('market_goods_table_changed');
  }
  world.nextEventInstanceId = old.nextEventInstanceId;
  world.nextArmyId = old.nextArmyId;
  world.nextFleetId = old.nextFleetId;
  world.nextWarId = old.nextWarId;
  world.nextRebellionId = old.nextRebellionId;
  world.tension = old.tension;
  world.nextCrisisId = old.nextCrisisId;
  world.crisisCooldownUntil = old.crisisCooldownUntil;
  world.nextMovementId = old.nextMovementId;
  world.chronicle = old.chronicle;
  world.chronicleWarIds = old.chronicleWarIds;
  world.popMobilityLedger = old.popMobilityLedger;

  const player = plan.land(old.playerNation);
  if (validNation(player)) {
    world.playerNation = player;
    if (plan.strict(old.playerNation) < 0) report.drop('player_tag_vanished_moved_to_land_holder');
  } else {
    report.drop('player_nation_unmapped');
  }
  for (const nation of world.nations) nation.isPlayer = nation.id === world.playerNation;

  // ---------------------------------------------------------------------------
  // Relations
  // ---------------------------------------------------------------------------
  const relationKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const relations = new Map<string, DiploRelation>();
  if (plan.mode === 'tag') for (const relation of world.relations) relations.set(relationKey(relation.a, relation.b), relation);
  let relationsCarried = 0;
  for (const relation of old.relations ?? []) {
    const a = plan.strict(relation.a);
    const b = plan.strict(relation.b);
    if (a < 0 || b < 0 || a === b) {
      report.drop('relation_nation_vanished');
      continue;
    }
    relations.set(relationKey(a, b), {
      ...relation,
      a: Math.min(a, b),
      b: Math.max(a, b),
    });
    relationsCarried += 1;
  }
  world.relations = Array.from(relations.values()).sort((x, y) => x.a - y.a || x.b - y.b);
  report.carry('relations', relationsCarried);

  // ---------------------------------------------------------------------------
  // Wars, rebellions, crisis, movements, events
  // ---------------------------------------------------------------------------
  const wars: War[] = [];
  for (const war of old.wars ?? []) {
    const attackers = mapSet(war.attackers, plan.strict);
    const defenders = mapSet(war.defenders, plan.strict).filter((id) => !attackers.includes(id));
    if (attackers.length < war.attackers.length || defenders.length < war.defenders.length) {
      report.drop('war_participant_vanished', war.attackers.length + war.defenders.length - attackers.length - defenders.length);
    }
    if (attackers.length === 0 || defenders.length === 0) {
      report.drop('war_side_empty');
      continue;
    }
    const goals = [];
    for (const goal of war.goals) {
      const holder = plan.strict(goal.holder);
      const target = plan.strict(goal.target);
      if (holder < 0 || target < 0) {
        report.drop('war_goal_nation_vanished');
        continue;
      }
      const stateId = goal.stateId >= 0 ? pickState(goal.stateId, target) : -1;
      if (goal.stateId >= 0 && stateId < 0) {
        report.drop('war_goal_state_unmapped');
        continue;
      }
      goals.push({ ...goal, holder, target, stateId });
    }
    wars.push({ ...war, attackers, defenders, goals });
  }
  world.wars = wars;
  report.carry('wars', wars.length);
  const warIds = new Set(wars.map((war) => war.id));

  const rebellionIds = new Set<number>();
  world.rebellions = [];
  for (const rebellion of old.rebellions ?? []) {
    const target = plan.strict(rebellion.targetNation);
    if (target < 0) {
      report.drop('rebellion_target_vanished');
      continue;
    }
    const originState = pickState(rebellion.originState, target);
    if (originState < 0) {
      report.drop('rebellion_state_unmapped');
      continue;
    }
    rebellionIds.add(rebellion.id);
    world.rebellions.push({
      ...rebellion,
      targetNation: target,
      originState,
      demand: { ...rebellion.demand, ...(rebellion.demand.stateIds ? { stateIds: allStates(rebellion.demand.stateIds) } : {}) },
    });
  }
  report.carry('rebellions', world.rebellions.length);

  if (old.crisis) {
    const crisis = old.crisis;
    const subject = plan.strict(crisis.subject);
    const attackerLead = plan.strict(crisis.attackerLead);
    const defenderLead = plan.strict(crisis.defenderLead);
    if (subject < 0 || attackerLead < 0 || defenderLead < 0) {
      report.drop('crisis_party_vanished');
      world.crisis = null;
    } else {
      world.crisis = {
        ...crisis,
        subject,
        attackerLead,
        defenderLead,
        attackerBackers: mapSet(crisis.attackerBackers, plan.strict),
        defenderBackers: mapSet(crisis.defenderBackers, plan.strict),
        pressedBy: mapSet(crisis.pressedBy, plan.strict),
        stateId: crisis.stateId >= 0 ? pickState(crisis.stateId, subject) : -1,
      };
    }
  } else {
    world.crisis = old.crisis ?? null;
  }
  world.congresses = [];
  for (const record of old.congresses ?? []) {
    const subject = plan.strict(record.subject);
    if (subject < 0) {
      report.drop('congress_subject_vanished');
      continue;
    }
    world.congresses.push({
      ...record,
      subject,
      winnerLead: record.winnerLead >= 0 ? plan.strict(record.winnerLead) : -1,
      loserLead: record.loserLead >= 0 ? plan.strict(record.loserLead) : -1,
    });
  }

  world.movements = [];
  for (const movement of old.movements ?? []) {
    const nation = plan.strict(movement.nation);
    if (nation < 0) {
      report.drop('movement_nation_vanished');
      continue;
    }
    world.movements.push({
      ...movement,
      nation,
      heartlandStateIds: allStates(movement.heartlandStateIds).filter((id) => world.states[id]?.owner === nation),
    });
  }
  report.carry('movements', world.movements.length);

  world.pendingEvents = [];
  for (const event of old.pendingEvents ?? []) {
    const nationId = plan.strict(event.nationId);
    if (nationId < 0) {
      report.drop('pending_event_nation_vanished');
      continue;
    }
    world.pendingEvents.push({ ...event, nationId });
  }
  world.eventLastFired = remapNationKeyed(old.eventLastFired, plan, report, 'event_cooldown_nation_vanished');
  world.decisionLastTaken = remapNationKeyed(old.decisionLastTaken, plan, report, 'decision_record_nation_vanished');

  world.recentBattles = [];
  for (const battle of old.recentBattles ?? []) {
    const attackerNation = plan.strict(battle.attackerNation);
    const defenderNation = plan.strict(battle.defenderNation);
    const provinceId = pickProvince(battle.provinceId, () => 0);
    if (attackerNation < 0 || defenderNation < 0 || provinceId < 0) {
      report.drop('battle_log_entry_unmapped');
      continue;
    }
    world.recentBattles.push({ ...battle, attackerNation, defenderNation, provinceId });
  }

  // ---------------------------------------------------------------------------
  // Armies and fleets
  // ---------------------------------------------------------------------------
  const armies: Army[] = [];
  for (const army of old.armies ?? []) {
    const owner = army.rebel && army.owner < 0 ? -1 : plan.land(army.owner);
    if (!army.rebel && owner < 0) {
      report.drop('army_owner_unmapped');
      continue;
    }
    const hostileTo = army.hostileTo >= 0 ? plan.strict(army.hostileTo) : -1;
    if (army.rebel && army.hostileTo >= 0 && hostileTo < 0) {
      report.drop('rebel_army_target_vanished');
      continue;
    }
    const location = pickProvince(army.location, (p) => (ownerOf(p) === owner ? 2 : world.provinces[p]?.controller === owner ? 1 : 0));
    if (location < 0) {
      report.drop('army_location_unmapped');
      continue;
    }
    let moveTarget: ProvinceId = -1;
    let moveProgress = 0;
    if (army.moveTarget >= 0) {
      const neighbors = world.provinces[location].neighbors;
      const step = (corr.succ[army.moveTarget] ?? []).find(({ id }) => neighbors.includes(id));
      if (step) {
        moveTarget = step.id;
        moveProgress = army.moveProgress;
      } else {
        report.drop('army_move_order_unresolvable');
      }
    }
    const migrated: Army = {
      ...army,
      owner,
      hostileTo,
      location,
      moveTarget,
      moveProgress,
      regiments: army.regiments.map((regiment) => ({
        ...regiment,
        sourcePop: oldPopToNew.get(regiment.sourcePop) ?? world.provinces[location].popIds[0] ?? 0,
      })),
    };
    if (army.rebelDemand?.stateIds) {
      migrated.rebelDemand = { ...army.rebelDemand, stateIds: allStates(army.rebelDemand.stateIds) };
    }
    if (migrated.rebellionId !== undefined && !rebellionIds.has(migrated.rebellionId)) {
      delete migrated.rebellionId;
    }
    armies.push(migrated);
  }
  world.armies = armies;
  report.carry('armies', armies.length);
  const armyById = new Map(armies.map((army) => [army.id, army]));

  const fleets: Fleet[] = [];
  for (const fleet of old.fleets ?? []) {
    const owner = plan.land(fleet.owner);
    if (owner < 0) {
      report.drop('fleet_owner_unmapped');
      continue;
    }
    const location = coastalSuccessor(world, corr, fleet.location, owner);
    if (location < 0) {
      report.drop('fleet_no_coastal_province');
      continue;
    }
    let moveTarget = fleet.moveTarget >= 0 ? coastalSuccessor(world, corr, fleet.moveTarget, owner) : -1;
    if (fleet.moveTarget >= 0 && (moveTarget < 0 || moveTarget === location)) {
      if (moveTarget < 0) report.drop('fleet_move_order_unresolvable');
      moveTarget = -1;
    }
    const embarked = fleet.embarkedArmy >= 0 ? armyById.get(fleet.embarkedArmy) : undefined;
    if (fleet.embarkedArmy >= 0 && !embarked) report.drop('fleet_embarked_army_missing');
    if (embarked) embarked.location = location;
    fleets.push({
      ...fleet,
      owner,
      location,
      moveTarget,
      moveProgress: moveTarget >= 0 ? fleet.moveProgress : 0,
      embarkedArmy: embarked ? embarked.id : -1,
    });
  }
  world.fleets = fleets;
  report.carry('fleets', fleets.length);

  for (const nation of world.nations) updateMilitaryDerivedForNation(world, nation.id);

  // ---------------------------------------------------------------------------
  // Runtimes
  // ---------------------------------------------------------------------------
  const runtimes = migrateRuntimes(world, oldRuntimes, plan, corr, pickState, warIds, armyById, report);

  const finalReport: WorldMigrationReport = {
    from: LEGACY_WORLD_ID,
    to: LEGACY_MAPPING.to,
    day: world.day,
    carried: report.carried,
    dropped: report.dropped,
  };
  world.migrations = [...(old.migrations ?? []), finalReport];
  return { world, runtimes, report: finalReport };
}

/**
 * Convenience wrapper: migrate and install the migrated runtimes on the world
 * (diplomacy and war keep theirs in per-world side tables).
 */
export function migrateLegacyWorld(old: World, runtimes: LegacySaveRuntimes = {}): World {
  const result = migrateLegacySave(old, runtimes);
  importDiplomacyRuntime(result.world, result.runtimes.diplomacy);
  importWarRuntime(result.world, result.runtimes.war);
  return result.world;
}

function buildNationPlan(old: World, world: World, corr: MapCorrespondence, mapMode: CampaignMapMode, report: Report): NationPlan {
  const formed = new Set<number>();
  if (mapMode !== 'historical') {
    const count = old.nations.length;
    const identity = (id: number) => (id >= 0 && id < count ? id : -1);
    return { mode: 'identity', strict: identity, land: identity, formed };
  }
  const newIdByTag = new Map(world.nations.map((nation) => [nation.tag, nation.id]));
  const strictMap = old.nations.map((nation, id) => {
    const originalTag = LEGACY_WORLD_SEED.nations[id]?.tag ?? nation.tag;
    if (originalTag !== nation.tag) formed.add(id);
    return newIdByTag.get(originalTag) ?? -1;
  });
  // Vanished 1830 tags: their land and forces go to whoever holds that land on the new map.
  const landMap = strictMap.slice();
  strictMap.forEach((mapped, id) => {
    if (mapped >= 0) return;
    const originalTag = LEGACY_WORLD_SEED.nations[id]?.tag ?? old.nations[id]?.tag;
    const tally = new Map<number, number>();
    const add = (oldProvinceId: number, weight: number) => {
      for (const { id: p, share } of corr.succ[oldProvinceId] ?? []) {
        const owner = world.provinces[p]?.owner ?? -1;
        if (owner >= 0) tally.set(owner, (tally.get(owner) ?? 0) + share * weight);
      }
    };
    LEGACY_WORLD_SEED.provinces.forEach((province) => {
      if (province.ownerTag === originalTag) add(province.id, Math.max(0.05, province.populationWeight));
    });
    if (tally.size === 0) {
      old.provinces.forEach((province) => {
        if (province.owner === id) add(province.id, 1);
      });
    }
    let best = -1;
    let bestWeight = -1;
    for (const [owner, weight] of tally) {
      if (weight > bestWeight || (weight === bestWeight && owner < best)) {
        best = owner;
        bestWeight = weight;
      }
    }
    landMap[id] = best;
    report.drop('nation_tag_vanished');
  });
  report.carry('nations_matched_by_tag', strictMap.filter((id) => id >= 0).length);
  report.carry('nations_new_on_map', world.nations.length - strictMap.filter((id) => id >= 0).length);
  return {
    mode: 'tag',
    strict: (id) => (id >= 0 && id < strictMap.length ? strictMap[id] : -1),
    land: (id) => (id >= 0 && id < landMap.length ? landMap[id] : -1),
    formed,
  };
}

/** Procedural saves: new provinces with no predecessor take a neighbouring owner. */
function fillFromNeighbors(world: World, owners: number[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const province of world.provinces) {
      if (owners[province.id] >= 0) continue;
      const neighbor = province.neighbors.find((n) => owners[n] >= 0);
      if (neighbor !== undefined) {
        owners[province.id] = owners[neighbor];
        changed = true;
      }
    }
  }
  for (let p = 0; p < owners.length; p++) if (owners[p] < 0) owners[p] = 0;
}

function coastalSuccessor(world: World, corr: MapCorrespondence, oldP: number, owner: number): ProvinceId {
  const list = corr.succ[oldP] ?? [];
  if (list.length === 0) return -1;
  const coastal = list.filter(({ id }) => world.provinces[id]?.coastal);
  const owned = coastal.find(({ id }) => world.provinces[id].owner === owner);
  if (owned) return owned.id;
  if (coastal.length > 0) return coastal[0].id;
  // No coastal successor: walk the new graph from the dominant successor.
  const start = list[0].id;
  const seen = new Set<number>([start]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: number[] = [];
    let fallback = -1;
    for (const p of frontier) {
      for (const n of world.provinces[p]?.neighbors ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        const province = world.provinces[n];
        if (!province) continue;
        if (province.coastal) {
          if (province.owner === owner) return n;
          if (fallback < 0) fallback = n;
        }
        next.push(n);
      }
    }
    if (fallback >= 0) return fallback;
    frontier = next;
  }
  return -1;
}

function mergeFactory(target: Factory[], factory: Factory): void {
  const existing = target.find((item) => item.recipe === factory.recipe);
  if (!existing) {
    target.push({ ...factory });
    return;
  }
  const a = Math.max(1e-9, existing.level);
  const b = Math.max(1e-9, factory.level);
  const avg = (x: number, y: number) => (x * a + y * b) / (a + b);
  existing.profitableWeeks = Math.round(avg(existing.profitableWeeks, factory.profitableWeeks));
  existing.lossWeeks = Math.round(avg(existing.lossWeeks, factory.lossWeeks));
  existing.lastInputFill = avg(existing.lastInputFill, factory.lastInputFill);
  existing.level += factory.level;
  existing.employed += factory.employed;
  existing.stockpileIn += factory.stockpileIn;
  existing.profitTrend += factory.profitTrend;
  existing.weeklyProfit += factory.weeklyProfit;
  existing.cashReserve += factory.cashReserve;
  existing.workerShare += factory.workerShare;
  existing.clerkShare += factory.clerkShare;
  existing.lastOutput += factory.lastOutput;
  existing.lastInputCost += factory.lastInputCost;
  existing.lastWages += factory.lastWages;
  existing.lastOperating += factory.lastOperating;
  existing.lastCapacity += factory.lastCapacity;
}

function popKey(pop: Pop): string {
  return `${pop.type}|${pop.culture}|${pop.religion}|${pop.ideology}`;
}

interface PopAccumulator {
  province: number;
  type: Pop['type'];
  culture: number;
  religion: number;
  ideology: number;
  size: number;
  money: number;
  lastGrowth: number;
  militancy: number;
  consciousness: number;
  needsMet: number;
  life: number;
  lifeWeight: number;
  everyday: number;
  everydayWeight: number;
  luxury: number;
  luxuryWeight: number;
  scarce: Pop['scarceGoods'];
  scarceWeight: number;
}

/**
 * Re-cut every old province's pops onto its successors by area share and merge
 * same (type, culture, religion, ideology) groups inside each new province.
 * Extensive quantities (size, money, lastGrowth) are split; intensive ones are
 * size-weighted averages. New provinces with no predecessor keep their fresh
 * bootstrap pops. Returns old pop id -> new pop id that received most of it.
 */
function migratePops(old: World, world: World, corr: MapCorrespondence, report: Report): Map<PopId, PopId> {
  const bootstrapPops = world.pops;
  const accumulators: Map<string, PopAccumulator>[] = world.provinces.map(() => new Map());
  const bestTarget = new Map<PopId, { key: string; province: number; amount: number }>();

  const popsByProvince = new Map<number, Pop[]>();
  let droppedSize = 0;
  for (const pop of old.pops ?? []) {
    if (!pop || !(pop.size > 0)) continue;
    if ((corr.succ[pop.provinceId]?.length ?? 0) === 0) {
      droppedSize += pop.size;
      report.drop('pop_province_unmapped');
      continue;
    }
    const list = popsByProvince.get(pop.provinceId) ?? [];
    list.push(pop);
    popsByProvince.set(pop.provinceId, list);
  }
  if (droppedSize > 0) report.drop('pop_size_in_unmapped_provinces', Math.round(droppedSize));

  const add = (province: number, pop: Pop, amount: number, fraction: number) => {
    const key = popKey(pop);
    const map = accumulators[province];
    let acc = map.get(key);
    if (!acc) {
      acc = {
        province,
        type: pop.type,
        culture: pop.culture,
        religion: pop.religion,
        ideology: pop.ideology,
        size: 0,
        money: 0,
        lastGrowth: 0,
        militancy: 0,
        consciousness: 0,
        needsMet: 0,
        life: 0,
        lifeWeight: 0,
        everyday: 0,
        everydayWeight: 0,
        luxury: 0,
        luxuryWeight: 0,
        scarce: undefined,
        scarceWeight: 0,
      };
      map.set(key, acc);
    }
    acc.size += amount;
    acc.money += (pop.money ?? 0) * fraction;
    acc.lastGrowth += (pop.lastGrowth ?? 0) * fraction;
    acc.militancy += (pop.militancy ?? 0) * amount;
    acc.consciousness += (pop.consciousness ?? 0) * amount;
    acc.needsMet += (pop.needsMet ?? 0) * amount;
    if (Number.isFinite(pop.lifeNeedsFrac)) {
      acc.life += pop.lifeNeedsFrac! * amount;
      acc.lifeWeight += amount;
    }
    if (Number.isFinite(pop.everydayNeedsFrac)) {
      acc.everyday += pop.everydayNeedsFrac! * amount;
      acc.everydayWeight += amount;
    }
    if (Number.isFinite(pop.luxuryNeedsFrac)) {
      acc.luxury += pop.luxuryNeedsFrac! * amount;
      acc.luxuryWeight += amount;
    }
    if (pop.scarceGoods && amount > acc.scarceWeight) {
      acc.scarce = pop.scarceGoods.map((item) => ({ ...item }));
      acc.scarceWeight = amount;
    }
    const best = bestTarget.get(pop.id);
    if (!best || amount > best.amount) bestTarget.set(pop.id, { key, province, amount });
  };

  for (const [oldProvince, pops] of popsByProvince) {
    const total = pops.reduce((sum, pop) => sum + pop.size, 0);
    // Slivers that would hold under one person fold into the dominant successor.
    const allocations = (corr.succ[oldProvince] ?? []).map((item) => ({ ...item }));
    const dominant = allocations[0];
    for (let i = allocations.length - 1; i >= 1; i--) {
      if (allocations[i].share * total < 1) {
        dominant.share += allocations[i].share;
        allocations.splice(i, 1);
      }
    }
    for (const { id: province, share } of allocations) {
      const largest = pops.reduce((best, pop) => (pop.size > best.size ? pop : best), pops[0]);
      let folded = 0;
      let foldedMoney = 0;
      for (const pop of pops) {
        const amount = pop.size * share;
        if (amount < MIN_POP_FRAGMENT && pop !== largest) {
          // Fragment too small to be its own pop: its people join the largest group.
          folded += amount;
          foldedMoney += share * (pop.money ?? 0);
          const best = bestTarget.get(pop.id);
          if (!best || amount > best.amount) {
            bestTarget.set(pop.id, { key: popKey(largest), province, amount });
          }
          continue;
        }
        add(province, pop, amount, share);
      }
      if (folded > 0) {
        const acc = accumulators[province].get(popKey(largest))!;
        const avgMil = acc.size > 0 ? acc.militancy / acc.size : largest.militancy;
        const avgCon = acc.size > 0 ? acc.consciousness / acc.size : largest.consciousness;
        const avgNeeds = acc.size > 0 ? acc.needsMet / acc.size : largest.needsMet;
        acc.size += folded;
        acc.money += foldedMoney;
        acc.militancy += avgMil * folded;
        acc.consciousness += avgCon * folded;
        acc.needsMet += avgNeeds * folded;
        if (acc.lifeWeight > 0) {
          acc.life += (acc.life / acc.lifeWeight) * folded;
          acc.lifeWeight += folded;
        }
        if (acc.everydayWeight > 0) {
          acc.everyday += (acc.everyday / acc.everydayWeight) * folded;
          acc.everydayWeight += folded;
        }
        if (acc.luxuryWeight > 0) {
          acc.luxury += (acc.luxury / acc.luxuryWeight) * folded;
          acc.luxuryWeight += folded;
        }
      }
    }
  }

  const pops: Pop[] = [];
  const idByKey: Map<string, PopId>[] = world.provinces.map(() => new Map());
  let keptBootstrap = 0;
  for (const province of world.provinces) {
    const previous = province.popIds;
    province.popIds = [];
    if ((corr.pred[province.id]?.length ?? 0) === 0) {
      // No legacy land here (islands the old map did not have): keep the fresh pops.
      for (const popId of previous) {
        const pop = bootstrapPops[popId];
        if (!pop) continue;
        const id = pops.length;
        pops.push({ ...pop, id, provinceId: province.id });
        province.popIds.push(id);
        keptBootstrap += pop.size;
      }
      continue;
    }
    for (const [key, acc] of accumulators[province.id]) {
      if (!(acc.size > 0)) continue;
      const id = pops.length;
      const pop: Pop = {
        id,
        type: acc.type,
        provinceId: province.id,
        size: acc.size,
        culture: acc.culture,
        religion: acc.religion,
        money: acc.money,
        militancy: acc.militancy / acc.size,
        consciousness: acc.consciousness / acc.size,
        needsMet: acc.needsMet / acc.size,
        lastGrowth: acc.lastGrowth,
        ideology: acc.ideology,
      };
      if (acc.lifeWeight > 0) pop.lifeNeedsFrac = acc.life / acc.lifeWeight;
      if (acc.everydayWeight > 0) pop.everydayNeedsFrac = acc.everyday / acc.everydayWeight;
      if (acc.luxuryWeight > 0) pop.luxuryNeedsFrac = acc.luxury / acc.luxuryWeight;
      if (acc.scarce) pop.scarceGoods = acc.scarce;
      pops.push(pop);
      province.popIds.push(id);
      idByKey[province.id].set(key, id);
    }
  }
  world.pops = pops;
  world.nextPopId = pops.length;
  report.carry('pops_before', old.pops?.length ?? 0);
  report.carry('pops_after', pops.length);
  report.carry('pop_size_fresh_on_new_land', Math.round(keptBootstrap));

  const oldToNew = new Map<PopId, PopId>();
  for (const [oldId, target] of bestTarget) {
    const id = idByKey[target.province].get(target.key);
    if (id !== undefined) oldToNew.set(oldId, id);
  }
  return oldToNew;
}

function migrateNations(
  old: World,
  world: World,
  plan: NationPlan,
  pickProvince: (oldP: number, prefer: (p: number) => number) => number,
  allStates: (oldStates: readonly number[] | undefined) => StateId[],
  report: Report,
): void {
  const ownedStates = new Map<number, number[]>();
  for (const state of world.states) {
    const list = ownedStates.get(state.owner) ?? [];
    list.push(state.id);
    ownedStates.set(state.owner, list);
  }
  const firstOwnedProvince = (nationId: number) => world.provinces.find((province) => province.owner === nationId)?.id ?? -1;
  const legacyStartCores = (oldId: number): Set<number> => {
    const seedNation = LEGACY_WORLD_SEED.nations[oldId];
    const cores = new Set<number>(seedNation?.coreStateIds ?? []);
    for (const state of LEGACY_WORLD_SEED.states) if (state.ownerTag === seedNation?.tag) cores.add(state.id);
    return cores;
  };

  // Fields handled explicitly below; every other field is copied verbatim.
  const REBUILT = new Set<keyof Nation>([
    'id', 'tag', 'name', 'color', 'primaryCulture', 'acceptedCultures', 'capital', 'coreStateIds',
    'polityStatus', 'overlordNation', 'eraSummary', 'spheredBy', 'sphereMembers', 'isPlayer',
    'regimentsPerSoldierPop', 'standingRegimentCapacity', 'mobilizationCapacity', 'armyOrganization', 'armyMorale',
  ]);

  old.nations.forEach((before, oldId) => {
    const newId = plan.strict(oldId);
    if (newId < 0) return;
    const nation = world.nations[newId];
    if (plan.mode === 'tag') {
      for (const key of Object.keys(before) as (keyof Nation)[]) {
        if (REBUILT.has(key)) continue;
        (nation as unknown as Record<string, unknown>)[key] = clone(before[key]);
      }
      if (plan.formed.has(oldId)) {
        nation.tag = before.tag;
        nation.name = before.name;
        nation.color = before.color;
        nation.primaryCulture = before.primaryCulture;
      }
      nation.acceptedCultures = Array.from(new Set([...nation.acceptedCultures, ...before.acceptedCultures]));
      const startCores = legacyStartCores(oldId);
      const gained = (before.coreStateIds ?? []).filter((id) => !startCores.has(id));
      nation.coreStateIds = Array.from(new Set([...(nation.coreStateIds ?? []), ...allStates(gained)])).sort((a, b) => a - b);
    } else {
      nation.coreStateIds = Array.from(new Set([...allStates(before.coreStateIds), ...(ownedStates.get(newId) ?? [])])).sort((a, b) => a - b);
      nation.overlordNation = before.overlordNation !== undefined && before.overlordNation >= 0 ? plan.strict(before.overlordNation) : before.overlordNation;
    }
    nation.spheredBy = before.spheredBy >= 0 ? plan.strict(before.spheredBy) : -1;
    nation.sphereMembers = mapSet(before.sphereMembers, plan.strict);
    if (before.sphereMembers.length > nation.sphereMembers.length) {
      report.drop('sphere_member_vanished', before.sphereMembers.length - nation.sphereMembers.length);
    }
  });

  // Capitals: keep the new map's capital while it is still owned, else follow the old one.
  for (const nation of world.nations) {
    if (world.provinces[nation.capital]?.owner === nation.id) continue;
    const oldId = old.nations.findIndex((_n, id) => plan.strict(id) === nation.id);
    const before = oldId >= 0 ? old.nations[oldId] : undefined;
    let capital = -1;
    if (before) {
      const candidate = pickProvince(before.capital, (p) => (world.provinces[p]?.owner === nation.id ? 1 : 0));
      if (candidate >= 0 && world.provinces[candidate].owner === nation.id) capital = candidate;
    }
    if (capital < 0) capital = firstOwnedProvince(nation.id);
    if (capital < 0 && before && plan.mode === 'identity') capital = pickProvince(before.capital, () => 0);
    if (capital >= 0) nation.capital = capital;
    if (!world.provinces[nation.capital]) nation.capital = 0;
  }
  // Sphere symmetry after the remap.
  for (const nation of world.nations) {
    nation.sphereMembers = nation.sphereMembers.filter((member) => world.nations[member]?.spheredBy === nation.id);
  }
  for (const nation of world.nations) {
    const lead = world.nations[nation.spheredBy];
    if (nation.spheredBy >= 0 && (!lead || !lead.sphereMembers.includes(nation.id))) nation.spheredBy = -1;
  }
}

function remapNationKeyed(
  record: Record<string, number> | undefined,
  plan: NationPlan,
  report: Report,
  reason: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    const split = key.lastIndexOf(':');
    const nation = split >= 0 ? Number(key.slice(split + 1)) : Number.NaN;
    const mapped = Number.isInteger(nation) ? plan.strict(nation) : -1;
    if (mapped < 0) {
      report.drop(reason);
      continue;
    }
    out[`${key.slice(0, split)}:${mapped}`] = value;
  }
  return out;
}

function migrateRuntimes(
  world: World,
  oldRuntimes: LegacySaveRuntimes,
  plan: NationPlan,
  corr: MapCorrespondence,
  pickState: (oldS: number, preferOwner: number) => StateId,
  warIds: Set<number>,
  armyById: Map<number, Army>,
  report: Report,
): { diplomacy: DiplomacyRuntimeSnapshot; war: WarRuntimeSnapshot } {
  const freshDiplomacy = exportDiplomacyRuntime(world);
  const nationCount = world.nations.length;
  const diplomacy: DiplomacyRuntimeSnapshot = {
    pendingCbs: [],
    activeCbs: [],
    influence: [],
    influencePool: Array.from({ length: nationCount }, (_unused, id) => freshDiplomacy.influencePool[id] ?? 0),
    diplomaticPoints: Array.from({ length: nationCount }, (_unused, id) => freshDiplomacy.diplomaticPoints[id] ?? 24),
    powerScores: freshDiplomacy.powerScores,
    coalitionAgainst: [],
  };
  const oldDiplomacy = oldRuntimes.diplomacy;
  const mapCb = (cb: CasusBelli): CasusBelli | null => {
    const holder = plan.strict(cb.holder);
    const target = plan.strict(cb.target);
    if (holder < 0 || target < 0) {
      report.drop('cb_nation_vanished');
      return null;
    }
    const stateId = cb.stateId >= 0 ? pickState(cb.stateId, target) : -1;
    if (cb.stateId >= 0 && stateId < 0) {
      report.drop('cb_state_unmapped');
      return null;
    }
    return { ...cb, holder, target, stateId };
  };
  if (oldDiplomacy) {
    diplomacy.pendingCbs = (oldDiplomacy.pendingCbs ?? []).map(mapCb).filter((cb): cb is CasusBelli => cb !== null);
    diplomacy.activeCbs = (oldDiplomacy.activeCbs ?? []).map(mapCb).filter((cb): cb is CasusBelli => cb !== null);
    for (const entry of oldDiplomacy.influence ?? []) {
      const gp = plan.strict(entry.gp);
      const target = plan.strict(entry.target);
      if (gp < 0 || target < 0) {
        report.drop('influence_nation_vanished');
        continue;
      }
      diplomacy.influence.push({ ...entry, gp, target });
    }
    (oldDiplomacy.influencePool ?? []).forEach((value, oldId) => {
      const id = plan.strict(oldId);
      if (id >= 0) diplomacy.influencePool[id] = value;
    });
    (oldDiplomacy.diplomaticPoints ?? []).forEach((value, oldId) => {
      const id = plan.strict(oldId);
      if (id >= 0) diplomacy.diplomaticPoints[id] = value;
    });
    for (const entry of oldDiplomacy.coalitionAgainst ?? []) {
      const nation = plan.strict(entry.nation);
      if (nation < 0) {
        report.drop('coalition_target_vanished');
        continue;
      }
      const members = mapSet(entry.members, plan.strict).filter((id) => id !== nation);
      if (members.length > 0) diplomacy.coalitionAgainst.push({ nation, members });
    }
    report.carry('casus_belli', diplomacy.pendingCbs.length + diplomacy.activeCbs.length);
  }

  const freshWar = exportWarRuntime(world);
  const war: WarRuntimeSnapshot = {
    generalPools: freshWar.generalPools,
    mobilizedNations: [],
    mobilizedArmyIds: [],
    battleScoreByWar: [],
    colonialClaims: [],
    colonialPointModifiers: [],
  };
  const oldWar = oldRuntimes.war;
  if (oldWar) {
    const pools = new Map<number, WarRuntimeSnapshot['generalPools'][number]['leaders']>();
    for (const entry of oldWar.generalPools ?? []) {
      const nation = plan.strict(entry.nation);
      if (nation >= 0) pools.set(nation, entry.leaders.map((leader) => ({ ...leader })));
    }
    war.generalPools = Array.from(pools.entries()).map(([nation, leaders]) => ({ nation, leaders })).sort((a, b) => a.nation - b.nation);
    war.mobilizedNations = mapSet(oldWar.mobilizedNations, plan.strict);
    for (const entry of oldWar.mobilizedArmyIds ?? []) {
      const nation = plan.strict(entry.nation);
      if (nation < 0) continue;
      war.mobilizedArmyIds.push({ nation, armyIds: entry.armyIds.filter((id) => armyById.has(id)) });
    }
    war.battleScoreByWar = (oldWar.battleScoreByWar ?? []).filter((entry) => warIds.has(entry.war));
    const claims = new Map<number, WarRuntimeSnapshot['colonialClaims'][number]>();
    for (const claim of oldWar.colonialClaims ?? []) {
      const target = (corr.stateSucc[claim.stateId] ?? []).find(({ id }) => {
        const state = world.states[id];
        return state && state.provinceIds.length > 0 && state.provinceIds.every((p) => world.provinces[p]?.colonial);
      });
      if (!target) {
        report.drop('colonial_claim_land_no_longer_colonial');
        continue;
      }
      const merged = claims.get(target.id) ?? { stateId: target.id, claimants: [], tension: 0 };
      merged.tension = Math.max(merged.tension, claim.tension);
      for (const claimant of claim.claimants) {
        const nation = plan.strict(claimant.nation);
        if (nation < 0) continue;
        const existing = merged.claimants.find((item) => item.nation === nation);
        if (existing) existing.progress = Math.max(existing.progress, claimant.progress);
        else merged.claimants.push({ nation, progress: claimant.progress });
      }
      merged.claimants.sort((a, b) => a.nation - b.nation);
      if (merged.claimants.length > 0) claims.set(target.id, merged);
    }
    war.colonialClaims = Array.from(claims.values()).sort((a, b) => a.stateId - b.stateId);
    const modifiers = new Map<number, number>();
    for (const entry of oldWar.colonialPointModifiers ?? []) {
      const nation = plan.strict(entry.nation);
      if (nation >= 0) modifiers.set(nation, (modifiers.get(nation) ?? 0) + entry.amount);
    }
    war.colonialPointModifiers = Array.from(modifiers.entries()).map(([nation, amount]) => ({ nation, amount })).sort((a, b) => a.nation - b.nation);
    report.carry('colonial_claims', war.colonialClaims.length);
  }
  return { diplomacy, war };
}

// ---------------------------------------------------------------------------
// Reference audit: every id field in a World (and its save runtimes) must
// resolve. Used by the migration tests and available as a load-time check.
// ---------------------------------------------------------------------------

export function auditWorldReferences(
  world: World,
  runtimes?: { diplomacy?: DiplomacyRuntimeSnapshot; war?: WarRuntimeSnapshot },
  limit = 50,
): string[] {
  const issues: string[] = [];
  const push = (message: string) => {
    if (issues.length < limit) issues.push(message);
  };
  const nations = world.nations.length;
  const provinces = world.provinces.length;
  const states = world.states.length;
  const pops = world.pops.length;
  const nation = (id: number) => Number.isInteger(id) && id >= 0 && id < nations;
  const nationOrNone = (id: number | undefined) => id === undefined || id === -1 || nation(id);
  const province = (id: number) => Number.isInteger(id) && id >= 0 && id < provinces;
  const state = (id: number) => Number.isInteger(id) && id >= 0 && id < states;
  const stateOrNone = (id: number) => id === -1 || state(id);
  const pop = (id: number) => Number.isInteger(id) && id >= 0 && id < pops;

  if (!nation(world.playerNation)) push(`playerNation ${world.playerNation}`);
  if (world.nextPopId !== pops) push(`nextPopId ${world.nextPopId} != pops ${pops}`);
  world.nations.forEach((n, i) => {
    if (n.id !== i) push(`nation[${i}].id ${n.id}`);
    if (!province(n.capital)) push(`nation ${n.tag} capital ${n.capital}`);
    for (const s of n.coreStateIds ?? []) if (!state(s)) push(`nation ${n.tag} core ${s}`);
    if (!nationOrNone(n.spheredBy)) push(`nation ${n.tag} spheredBy ${n.spheredBy}`);
    for (const m of n.sphereMembers) if (!nation(m)) push(`nation ${n.tag} sphereMember ${m}`);
    if (!nationOrNone(n.overlordNation)) push(`nation ${n.tag} overlord ${n.overlordNation}`);
  });
  const popSeen = new Uint8Array(pops);
  world.provinces.forEach((p, i) => {
    if (p.id !== i) push(`province[${i}].id ${p.id}`);
    if (!nation(p.owner)) push(`province ${i} owner ${p.owner}`);
    if (!nation(p.controller)) push(`province ${i} controller ${p.controller}`);
    if (!state(p.stateId)) push(`province ${i} state ${p.stateId}`);
    else if (!world.states[p.stateId].provinceIds.includes(i)) push(`province ${i} missing from state ${p.stateId}`);
    for (const n of p.neighbors) if (!province(n)) push(`province ${i} neighbor ${n}`);
    for (const id of p.popIds) {
      if (!pop(id)) push(`province ${i} pop ${id}`);
      else {
        if (world.pops[id].provinceId !== i) push(`pop ${id} province ${world.pops[id].provinceId} listed in ${i}`);
        if (popSeen[id]) push(`pop ${id} listed twice`);
        popSeen[id] = 1;
      }
    }
  });
  world.pops.forEach((p, i) => {
    if (p.id !== i) push(`pop[${i}].id ${p.id}`);
    if (!province(p.provinceId)) push(`pop ${i} province ${p.provinceId}`);
    if (!popSeen[i]) push(`pop ${i} not listed by any province`);
    if (!Number.isFinite(p.size) || p.size < 0) push(`pop ${i} size ${p.size}`);
  });
  world.states.forEach((s, i) => {
    if (s.id !== i) push(`state[${i}].id ${s.id}`);
    if (!nation(s.owner)) push(`state ${i} owner ${s.owner}`);
    for (const p of s.provinceIds) if (!province(p)) push(`state ${i} province ${p}`);
  });
  const armyIds = new Set<number>();
  for (const a of world.armies) {
    armyIds.add(a.id);
    if (!(a.rebel ? nationOrNone(a.owner) : nation(a.owner))) push(`army ${a.id} owner ${a.owner}`);
    if (!province(a.location)) push(`army ${a.id} location ${a.location}`);
    if (a.moveTarget !== -1 && !province(a.moveTarget)) push(`army ${a.id} moveTarget ${a.moveTarget}`);
    if (!nationOrNone(a.hostileTo)) push(`army ${a.id} hostileTo ${a.hostileTo}`);
    for (const r of a.regiments) if (!pop(r.sourcePop)) push(`army ${a.id} sourcePop ${r.sourcePop}`);
    for (const s of a.rebelDemand?.stateIds ?? []) if (!state(s)) push(`army ${a.id} demand state ${s}`);
  }
  for (const f of world.fleets) {
    if (!nation(f.owner)) push(`fleet ${f.id} owner ${f.owner}`);
    if (!province(f.location)) push(`fleet ${f.id} location ${f.location}`);
    else if (!world.provinces[f.location].coastal) push(`fleet ${f.id} on inland province ${f.location}`);
    if (f.moveTarget !== -1 && !province(f.moveTarget)) push(`fleet ${f.id} moveTarget ${f.moveTarget}`);
    if (f.embarkedArmy !== -1 && !armyIds.has(f.embarkedArmy)) push(`fleet ${f.id} embarkedArmy ${f.embarkedArmy}`);
  }
  for (const w of world.wars) {
    for (const id of [...w.attackers, ...w.defenders]) if (!nation(id)) push(`war ${w.id} participant ${id}`);
    for (const g of w.goals) {
      if (!nation(g.holder) || !nation(g.target)) push(`war ${w.id} goal nations ${g.holder}/${g.target}`);
      if (!stateOrNone(g.stateId)) push(`war ${w.id} goal state ${g.stateId}`);
    }
  }
  for (const r of world.rebellions) {
    if (!nation(r.targetNation)) push(`rebellion ${r.id} target ${r.targetNation}`);
    if (!state(r.originState)) push(`rebellion ${r.id} origin ${r.originState}`);
    for (const s of r.demand.stateIds ?? []) if (!state(s)) push(`rebellion ${r.id} demand state ${s}`);
  }
  for (const rel of world.relations) {
    if (!nation(rel.a) || !nation(rel.b) || rel.a >= rel.b) push(`relation ${rel.a}/${rel.b}`);
  }
  for (const e of world.pendingEvents) if (!nation(e.nationId)) push(`pending event ${e.instanceId} nation ${e.nationId}`);
  for (const [label, record] of [['eventLastFired', world.eventLastFired], ['decisionLastTaken', world.decisionLastTaken]] as const) {
    for (const key of Object.keys(record ?? {})) {
      const id = Number(key.slice(key.lastIndexOf(':') + 1));
      if (!nation(id)) push(`${label} key ${key}`);
    }
  }
  if (world.crisis) {
    const c = world.crisis;
    for (const id of [c.subject, c.attackerLead, c.defenderLead, ...c.attackerBackers, ...c.defenderBackers, ...c.pressedBy]) {
      if (!nation(id)) push(`crisis nation ${id}`);
    }
    if (!stateOrNone(c.stateId)) push(`crisis state ${c.stateId}`);
  }
  for (const c of world.congresses ?? []) {
    if (!nation(c.subject) || !nationOrNone(c.winnerLead) || !nationOrNone(c.loserLead)) push(`congress ${c.id}`);
  }
  for (const m of world.movements ?? []) {
    if (!nation(m.nation)) push(`movement ${m.id} nation ${m.nation}`);
    for (const s of m.heartlandStateIds) if (!state(s)) push(`movement ${m.id} heartland ${s}`);
  }
  for (const b of world.recentBattles ?? []) {
    if (!province(b.provinceId) || !nation(b.attackerNation) || !nation(b.defenderNation)) push(`battle report day ${b.day}`);
  }
  if (runtimes?.diplomacy) {
    const d = runtimes.diplomacy;
    for (const cb of [...d.pendingCbs, ...d.activeCbs]) {
      if (!nation(cb.holder) || !nation(cb.target) || !stateOrNone(cb.stateId)) push(`cb ${cb.holder}->${cb.target} ${cb.stateId}`);
    }
    for (const entry of d.influence) if (!nation(entry.gp) || !nation(entry.target)) push(`influence ${entry.gp}->${entry.target}`);
    if (d.influencePool.length > nations) push(`influencePool length ${d.influencePool.length}`);
    if (d.diplomaticPoints.length > nations) push(`diplomaticPoints length ${d.diplomaticPoints.length}`);
    for (const entry of d.coalitionAgainst) {
      if (!nation(entry.nation)) push(`coalition against ${entry.nation}`);
      for (const m of entry.members) if (!nation(m)) push(`coalition member ${m}`);
    }
  }
  if (runtimes?.war) {
    const w = runtimes.war;
    for (const entry of w.generalPools) if (!nation(entry.nation)) push(`general pool ${entry.nation}`);
    for (const id of w.mobilizedNations) if (!nation(id)) push(`mobilized ${id}`);
    for (const entry of w.mobilizedArmyIds) {
      if (!nation(entry.nation)) push(`mobilized armies nation ${entry.nation}`);
      for (const id of entry.armyIds) if (!armyIds.has(id)) push(`mobilized army ${id}`);
    }
    for (const claim of w.colonialClaims) {
      if (!state(claim.stateId)) push(`colonial claim state ${claim.stateId}`);
      for (const c of claim.claimants) if (!nation(c.nation)) push(`colonial claimant ${c.nation}`);
    }
    for (const entry of w.colonialPointModifiers ?? []) if (!nation(entry.nation)) push(`colonial modifier ${entry.nation}`);
  }
  return issues;
}

/** Dominant legacy predecessor of every new province (-1 when none); for tests and tooling. */
export function legacyDominantPredecessors(scenarioId: string = LEGACY_MIGRATABLE_SCENARIOS[0]): readonly number[] {
  return buildCorrespondence(loadScenario(scenarioId).worldSeed).domPred;
}
