import type {
  BattleReport,
  Army,
  ArmyId,
  Fleet,
  FleetId,
  GameData,
  Leader,
  NationId,
  Pop,
  Province,
  ProvinceId,
  Rebellion,
  Ship,
  StateId,
  War,
  WarId,
  WarGoal,
  World,
} from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { GAME_DATA } from '../../data/gameData';
import { getOrCreateRelation, setTruce } from './diplomacy';
import { createNationParties, defaultRulingParty, defaultUpperHouse, updateMilitaryDerivedForNation } from '../politics';
import { techModifiersFor } from './research';

const MAX_REGIMENT_STRENGTH = 1000;
const MAX_SHIP_STRENGTH = 100;
const BASE_ARMY_MOVE_DAYS = 5;
const BASE_FLEET_MOVE_DAYS = 4;
const MOBILIZED_UPKEEP_DAILY = 0.16;
const COLONIAL_CLAIM_COST = 32;
const REBELLION_PROGRESS_TO_ENFORCE = 85;
const REBEL_SIEGE_BASE_DAILY = 0.022;
/** White peace is free when |score| is within this band (stalemate). */
const WHITE_PEACE_SCORE_BAND = 10;
/** Both sides at/above this exhaustion → free white peace. */
const WHITE_PEACE_MUTUAL_EXHAUSTION = 75;
/** Prestige paid by the offering nation when white-peacing outside free conditions. */
const WHITE_PEACE_PRESTIGE_FEE = 6;

const REGIMENT_ROLE: Record<Army['regiments'][number]['type'], {
  offense: number;
  defense: number;
  siege: number;
  mobility: number;
  pursuit: number;
}> = {
  infantry: { offense: 1, defense: 1.05, siege: 1, mobility: 1, pursuit: 0.9 },
  cavalry: { offense: 0.92, defense: 0.82, siege: 0.5, mobility: 1.24, pursuit: 1.45 },
  artillery: { offense: 1.42, defense: 0.64, siege: 1.9, mobility: 0.76, pursuit: 0.72 },
  guard: { offense: 1.25, defense: 1.26, siege: 1.12, mobility: 0.95, pursuit: 1.02 },
};

interface ColonialClaim {
  stateId: StateId;
  claimants: Map<NationId, number>;
  tension: number;
}

interface WarRuntime {
  generalPools: Map<NationId, Leader[]>;
  mobilizedNations: Set<NationId>;
  mobilizedArmyIds: Map<NationId, Set<ArmyId>>;
  battleScoreByWar: Map<WarId, number>;
  colonialClaims: Map<StateId, ColonialClaim>;
}

export interface WarRuntimeSnapshot {
  generalPools: Array<{ nation: NationId; leaders: Leader[] }>;
  mobilizedNations: NationId[];
  mobilizedArmyIds: Array<{ nation: NationId; armyIds: ArmyId[] }>;
  battleScoreByWar: Array<{ war: WarId; score: number }>;
  colonialClaims: Array<{
    stateId: StateId;
    claimants: Array<{ nation: NationId; progress: number }>;
    tension: number;
  }>;
}

const RUNTIME_BY_WORLD = new WeakMap<World, WarRuntime>();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function terrainMoveCost(terrain: Province['terrain']): number {
  switch (terrain) {
    case 'mountains': return 2.3;
    case 'hills': return 1.5;
    case 'forest': return 1.35;
    case 'jungle': return 1.6;
    case 'desert': return 1.3;
    case 'marsh': return 1.5;
    case 'arctic': return 1.45;
    default: return 1;
  }
}

function terrainDefenseBonus(terrain: Province['terrain']): number {
  switch (terrain) {
    case 'mountains': return 0.24;
    case 'hills': return 0.15;
    case 'forest': return 0.1;
    case 'jungle': return 0.12;
    case 'marsh': return 0.08;
    default: return 0;
  }
}

function ensureRuntime(world: World): WarRuntime {
  const existing = RUNTIME_BY_WORLD.get(world);
  if (existing) return existing;
  const created: WarRuntime = {
    generalPools: new Map<NationId, Leader[]>(),
    mobilizedNations: new Set<NationId>(),
    mobilizedArmyIds: new Map<NationId, Set<ArmyId>>(),
    battleScoreByWar: new Map<WarId, number>(),
    colonialClaims: new Map<StateId, ColonialClaim>(),
  };
  RUNTIME_BY_WORLD.set(world, created);
  return created;
}

export function exportWarRuntime(world: World): WarRuntimeSnapshot {
  const runtime = ensureRuntime(world);
  return {
    generalPools: Array.from(runtime.generalPools.entries())
      .map(([nation, leaders]) => ({ nation, leaders: leaders.map((leader) => ({ ...leader })) }))
      .sort((a, b) => a.nation - b.nation),
    mobilizedNations: Array.from(runtime.mobilizedNations).sort((a, b) => a - b),
    mobilizedArmyIds: Array.from(runtime.mobilizedArmyIds.entries())
      .map(([nation, armyIds]) => ({ nation, armyIds: Array.from(armyIds).sort((a, b) => a - b) }))
      .sort((a, b) => a.nation - b.nation),
    battleScoreByWar: Array.from(runtime.battleScoreByWar.entries())
      .map(([war, score]) => ({ war, score }))
      .sort((a, b) => a.war - b.war),
    colonialClaims: Array.from(runtime.colonialClaims.entries())
      .map(([stateId, claim]) => ({
        stateId,
        claimants: Array.from(claim.claimants.entries())
          .map(([nation, progress]) => ({ nation, progress }))
          .sort((a, b) => a.nation - b.nation),
        tension: claim.tension,
      }))
      .sort((a, b) => a.stateId - b.stateId),
  };
}

export function importWarRuntime(world: World, snapshot: WarRuntimeSnapshot | null | undefined): void {
  if (!snapshot) {
    ensureRuntime(world);
    return;
  }
  const runtime: WarRuntime = {
    generalPools: new Map(snapshot.generalPools.map((entry) => [entry.nation, entry.leaders.map((leader) => ({ ...leader }))])),
    mobilizedNations: new Set(snapshot.mobilizedNations),
    mobilizedArmyIds: new Map(snapshot.mobilizedArmyIds.map((entry) => [entry.nation, new Set(entry.armyIds)])),
    battleScoreByWar: new Map(snapshot.battleScoreByWar.map((entry) => [entry.war, entry.score])),
    colonialClaims: new Map(snapshot.colonialClaims.map((entry) => [entry.stateId, {
      stateId: entry.stateId,
      claimants: new Map(entry.claimants.map((claimant) => [claimant.nation, claimant.progress])),
      tension: entry.tension,
    }])),
  };
  RUNTIME_BY_WORLD.set(world, runtime);
}

function shipPower(ship: Ship): number {
  const str = clamp(ship.strength / MAX_SHIP_STRENGTH, 0, 1.6);
  switch (ship.type) {
    case 'transport': return 0.5 * str;
    case 'frigate': return 1.1 * str;
    case 'manofwar': return 1.55 * str;
    case 'ironclad': return 2.2 * str;
    default: return 1 * str;
  }
}

function fleetCombatPower(fleet: Fleet): number {
  return fleet.ships.reduce((sum, ship) => sum + shipPower(ship), 0);
}

function fleetTransportCapacity(fleet: Fleet): number {
  return fleet.ships.reduce((sum, ship) => sum + (ship.type === 'transport' ? 2 : 0), 0);
}

function nationArmyTech(world: World, nationId: NationId): number {
  const nation = world.nations[nationId];
  if (!nation) return 0;
  let score = 0;
  for (const tech of nation.techs) {
    if (tech.includes('army') || tech.includes('military') || tech.includes('small_arms')) score++;
  }
  return score;
}

function nationNavyTech(world: World, nationId: NationId): number {
  const nation = world.nations[nationId];
  if (!nation) return 0;
  let score = 0;
  for (const tech of nation.techs) {
    if (tech.includes('navy') || tech.includes('ship') || tech.includes('ironclad')) score++;
  }
  return score;
}

function deterministicLeaderValue(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
}

function generateLeaderPool(nationId: NationId): Leader[] {
  const traits = ['offensive_doctrine', 'defensive_doctrine', 'logistics', 'siegecraft', 'reckless', 'cautious'];
  const prefixes = ['Arthur', 'Frederick', 'Henri', 'Ivan', 'Charles', 'Otto', 'Louis', 'Nikolai', 'Edward', 'Armand'];
  const surnames = ['Hawke', 'Moltke', 'Dupont', 'Petrov', 'Wright', 'Barker', 'Sokolov', 'Lefevre', 'Bauer', 'Keller'];
  const poolSize = 5;
  const leaders: Leader[] = [];
  for (let i = 0; i < poolSize; i++) {
    const root = nationId * 131 + (i + 1) * 977;
    const atk = Math.floor(deterministicLeaderValue(root + 17) * 4);
    const def = Math.floor(deterministicLeaderValue(root + 31) * 4);
    const trait = traits[Math.floor(deterministicLeaderValue(root + 53) * traits.length)] ?? 'logistics';
    const name = `${prefixes[Math.floor(deterministicLeaderValue(root + 71) * prefixes.length)]} ${surnames[Math.floor(deterministicLeaderValue(root + 89) * surnames.length)]}`;
    leaders.push({
      name,
      attack: atk,
      defense: def,
      trait,
    });
  }
  return leaders;
}

export function getGeneralPool(world: World, nationId: NationId): Leader[] {
  const runtime = ensureRuntime(world);
  const existing = runtime.generalPools.get(nationId);
  if (existing) return existing.map((leader) => ({ ...leader }));
  const created = generateLeaderPool(nationId);
  runtime.generalPools.set(nationId, created);
  return created.map((leader) => ({ ...leader }));
}

export function assignGeneralToArmy(world: World, nationId: NationId, armyId: ArmyId): { ok: boolean; reason: string } {
  const army = armiesByIdMap(world).get(armyId);
  if (!army || army.owner !== nationId || army.rebel) return { ok: false, reason: 'Army unavailable for general assignment.' };
  const pool = getGeneralPool(world, nationId);
  if (pool.length === 0) return { ok: false, reason: 'No generals available.' };
  const scoreLeader = (leader: Leader): number => leader.attack * 1.2 + leader.defense + (leader.trait === 'offensive_doctrine' ? 0.8 : 0);
  const selected = pool.slice().sort((a, b) => scoreLeader(b) - scoreLeader(a) || a.name.localeCompare(b.name))[0];
  army.leader = { ...selected };
  return { ok: true, reason: `${selected.name} assigned to army ${armyId}.` };
}

function warEnemyMap(world: World): Map<NationId, Set<NationId>> {
  const result = new Map<NationId, Set<NationId>>();
  for (const war of world.wars) {
    for (const attacker of war.attackers) {
      const set = result.get(attacker) ?? new Set<NationId>();
      for (const defender of war.defenders) set.add(defender);
      result.set(attacker, set);
    }
    for (const defender of war.defenders) {
      const set = result.get(defender) ?? new Set<NationId>();
      for (const attacker of war.attackers) set.add(attacker);
      result.set(defender, set);
    }
  }
  return result;
}

function armiesByProvince(world: World): Map<ProvinceId, Army[]> {
  const byProvince = new Map<ProvinceId, Army[]>();
  for (const army of world.armies) {
    const list = byProvince.get(army.location) ?? [];
    list.push(army);
    byProvince.set(army.location, list);
  }
  return byProvince;
}

function fleetsByProvince(world: World): Map<ProvinceId, Fleet[]> {
  const byProvince = new Map<ProvinceId, Fleet[]>();
  for (const fleet of world.fleets) {
    const list = byProvince.get(fleet.location) ?? [];
    list.push(fleet);
    byProvince.set(fleet.location, list);
  }
  return byProvince;
}

function armiesByIdMap(world: World): Map<ArmyId, Army> {
  const byId = new Map<ArmyId, Army>();
  for (const army of world.armies) byId.set(army.id, army);
  return byId;
}

function embarkedArmyIdSet(world: World): Set<ArmyId> {
  const embarked = new Set<ArmyId>();
  for (const fleet of world.fleets) {
    if (fleet.embarkedArmy >= 0) embarked.add(fleet.embarkedArmy);
  }
  return embarked;
}

function isArmyEmbarked(world: World, armyId: ArmyId, embarkedIds?: Set<ArmyId>): boolean {
  if (embarkedIds) return embarkedIds.has(armyId);
  return world.fleets.some((fleet) => fleet.embarkedArmy === armyId);
}

function movementDaysForArmy(world: World, army: Army, target: Province): number {
  const source = world.provinces[army.location];
  if (!source) return BASE_ARMY_MOVE_DAYS;
  const leaderMove = army.leader?.trait === 'logistics' ? -0.7 : 0;
  const fortPenalty = target.fortLevel * 0.4;
  const terrainPenalty = terrainMoveCost(target.terrain);
  const composition = sideTypePower([army]);
  const cavalrySpeed = composition.cavalryShare * 0.32;
  const artilleryDrag = composition.artilleryShare * 0.34;
  const guardDrill = composition.guardShare * 0.08;
  const compositionFactor = clamp(1 - cavalrySpeed + artilleryDrag - guardDrill, 0.72, 1.4);
  // 0.7.0: railroad / logistics tech shortens army marches.
  const nation = world.nations[army.owner];
  const moveBonus = nation ? Math.max(0, techModifiersFor(nation, GAME_DATA).armyMovement ?? 0) : 0;
  const techFactor = clamp(1 - Math.min(0.35, moveBonus), 0.65, 1);
  return clamp(BASE_ARMY_MOVE_DAYS * terrainPenalty * compositionFactor * techFactor + fortPenalty + leaderMove, 2, 15);
}

function movementDaysForFleet(world: World, fleet: Fleet, target: Province): number {
  const source = world.provinces[fleet.location];
  if (!source) return BASE_FLEET_MOVE_DAYS;
  const hostilePenalty = source.owner !== target.owner ? 1 : 0;
  return clamp(BASE_FLEET_MOVE_DAYS + hostilePenalty + terrainMoveCost(target.terrain) * 0.3, 2, 10);
}

function isFriendlyControlled(world: World, nationId: NationId, provinceId: ProvinceId): boolean {
  const province = world.provinces[provinceId];
  if (!province) return false;
  return province.controller === nationId || province.owner === nationId;
}

function isSupplied(world: World, nationId: NationId, provinceId: ProvinceId): boolean {
  const nation = world.nations[nationId];
  if (!nation) return false;
  // 0.7.0: railroad / logistics tech extends friendly-control supply reach.
  const supplyBonus = Math.max(0, techModifiersFor(nation, GAME_DATA).supplyRange ?? 0);
  const range = 2 + Math.floor(nation.armyOrganization) + Math.floor(supplyBonus);
  const visited = new Set<ProvinceId>([provinceId]);
  const queue: Array<{ id: ProvinceId; depth: number }> = [{ id: provinceId, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift() as { id: ProvinceId; depth: number };
    if (isFriendlyControlled(world, nationId, current.id)) return true;
    if (current.depth >= range) continue;
    const province = world.provinces[current.id];
    if (!province) continue;
    for (const neighborId of province.neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = world.provinces[neighborId];
      if (!neighbor) continue;
      if (current.depth > 0 && !isFriendlyControlled(world, nationId, neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }
  return false;
}

function reinforceArmy(world: World, army: Army, supplied: boolean): void {
  if (army.rebel || army.regiments.length === 0) return;
  if (!supplied) return;
  const province = world.provinces[army.location];
  if (!province || province.controller !== army.owner) return;
  const nation = world.nations[army.owner];
  if (!nation) return;
  for (const regiment of army.regiments) {
    const sourcePop = world.pops[regiment.sourcePop];
    if (!sourcePop || sourcePop.size <= 50) continue;
    if (regiment.strength < MAX_REGIMENT_STRENGTH) {
      const needed = MAX_REGIMENT_STRENGTH - regiment.strength;
      const reinforcement = Math.min(18, needed, sourcePop.size * 0.05);
      regiment.strength = clamp(regiment.strength + reinforcement, 0, MAX_REGIMENT_STRENGTH);
      sourcePop.size = Math.max(0, sourcePop.size - reinforcement * 0.45);
    }
    regiment.organization = clamp(regiment.organization + 1.4 * nation.armyMorale, 0, 100);
  }
}

function applyUnsuppliedAttrition(army: Army): void {
  for (const regiment of army.regiments) {
    regiment.organization = clamp(regiment.organization - 1.7, 0, 100);
    regiment.strength = clamp(regiment.strength - 4.4, 0, MAX_REGIMENT_STRENGTH);
  }
}

function cleanupArmy(army: Army): void {
  army.regiments = army.regiments.filter((regiment) => regiment.strength > 0.001);
}

function popById(world: World, popId: number): Pop | null {
  const pop = world.pops[popId];
  return pop ?? null;
}

function findRetreatProvince(world: World, army: Army, enemySet: Set<NationId>): ProvinceId {
  const province = world.provinces[army.location];
  if (!province) return -1;
  const candidates = province.neighbors
    .map((id) => world.provinces[id])
    .filter((candidate): candidate is Province => Boolean(candidate))
    .filter((candidate) => candidate.owner === army.owner || candidate.controller === army.owner)
    .sort((a, b) => {
      const aEnemy = enemySet.has(a.owner) ? 1 : 0;
      const bEnemy = enemySet.has(b.owner) ? 1 : 0;
      return aEnemy - bEnemy || a.id - b.id;
    });
  return candidates[0]?.id ?? -1;
}

function sideLeader(armies: Army[], preferAttack: boolean): { attack: number; defense: number; trait: string } {
  if (armies.length === 0) return { attack: 0, defense: 0, trait: '' };
  const sorted = armies
    .filter((army) => army.leader)
    .map((army) => army.leader as Leader)
    .sort((a, b) => {
      const aScore = preferAttack ? a.attack * 1.2 + a.defense : a.defense * 1.2 + a.attack;
      const bScore = preferAttack ? b.attack * 1.2 + b.defense : b.defense * 1.2 + b.attack;
      return bScore - aScore;
    });
  const top = sorted[0];
  if (!top) return { attack: 0, defense: 0, trait: '' };
  return { attack: top.attack, defense: top.defense, trait: top.trait };
}

function sideRegiments(armies: Army[]): number {
  return armies.reduce((sum, army) => sum + army.regiments.length, 0);
}

function sideAvgOrg(armies: Army[]): number {
  const regiments = sideRegiments(armies);
  if (regiments <= 0) return 0;
  let total = 0;
  for (const army of armies) {
    for (const regiment of army.regiments) total += clamp(regiment.organization, 0, 100);
  }
  return total / regiments;
}

function sideTypePower(armies: Army[]): {
  offense: number;
  defense: number;
  siege: number;
  mobility: number;
  pursuit: number;
  total: number;
  infantryShare: number;
  cavalryShare: number;
  artilleryShare: number;
  guardShare: number;
} {
  const weights: Record<Army['regiments'][number]['type'], number> = {
    infantry: 0,
    cavalry: 0,
    artillery: 0,
    guard: 0,
  };
  let offense = 0;
  let defense = 0;
  let siege = 0;
  let mobility = 0;
  let pursuit = 0;
  for (const army of armies) {
    for (const regiment of army.regiments) {
      const weight = clamp(regiment.strength / MAX_REGIMENT_STRENGTH, 0, 1.3) * clamp(regiment.organization / 100 + 0.2, 0.2, 1.2);
      const role = REGIMENT_ROLE[regiment.type];
      weights[regiment.type] += weight;
      offense += role.offense * weight;
      defense += role.defense * weight;
      siege += role.siege * weight;
      mobility += role.mobility * weight;
      pursuit += role.pursuit * weight;
    }
  }
  const total = Math.max(0.001, weights.infantry + weights.cavalry + weights.artillery + weights.guard);
  const infantryShare = weights.infantry / total;
  const cavalryShare = weights.cavalry / total;
  const artilleryShare = weights.artillery / total;
  const guardShare = weights.guard / total;
  let adjustedOffense = offense;
  let adjustedDefense = defense;
  if (artilleryShare > 0.45 && infantryShare < 0.25) {
    // Artillery-heavy forces without an infantry line collapse quickly in field battles.
    adjustedOffense *= 0.82;
    adjustedDefense *= 0.72;
  }
  if (guardShare > 0.18) {
    adjustedOffense *= 1 + Math.min(0.12, guardShare * 0.18);
    adjustedDefense *= 1 + Math.min(0.14, guardShare * 0.2);
  }
  return {
    offense: adjustedOffense,
    defense: adjustedDefense,
    siege,
    mobility,
    pursuit,
    total,
    infantryShare,
    cavalryShare,
    artilleryShare,
    guardShare,
  };
}

function nationArmySpecializationTech(world: World, nationId: NationId): { cavalry: number; artillery: number; guard: number } {
  const nation = world.nations[nationId];
  if (!nation) return { cavalry: 0, artillery: 0, guard: 0 };
  let cavalry = 0;
  let artillery = 0;
  let guard = 0;
  for (const tech of nation.techs) {
    if (tech.includes('cavalry') || tech.includes('mobility')) cavalry++;
    if (tech.includes('artillery') || tech.includes('cannon') || tech.includes('siege')) artillery++;
    if (tech.includes('guard') || tech.includes('staff') || tech.includes('professional')) guard++;
  }
  return { cavalry, artillery, guard };
}

function damageArmies(
  armies: Army[],
  orgDamage: number,
  strengthDamage: number,
): number {
  let totalStrengthLoss = 0;
  const regimentCount = Math.max(1, sideRegiments(armies));
  const orgEach = orgDamage / regimentCount;
  const strEach = strengthDamage / regimentCount;
  for (const army of armies) {
    for (const regiment of army.regiments) {
      const oldOrg = regiment.organization;
      regiment.organization = clamp(regiment.organization - orgEach, 0, 100);
      const overflow = Math.max(0, orgEach - oldOrg);
      const before = regiment.strength;
      regiment.strength = clamp(regiment.strength - strEach - overflow * 6, 0, MAX_REGIMENT_STRENGTH);
      totalStrengthLoss += Math.max(0, before - regiment.strength);
    }
    cleanupArmy(army);
  }
  return totalStrengthLoss;
}

function resolveLandBattle(
  world: World,
  rng: Rng,
  war: War,
  provinceId: ProvinceId,
  attackers: Army[],
  defenders: Army[],
): { attackerLosses: number; defenderLosses: number; attackerBroken: boolean; defenderBroken: boolean; factors?: BattleReport['factors'] } {
  const province = world.provinces[provinceId];
  const terrain = province?.terrain ?? 'plains';
  const attackerUnits = sideRegiments(attackers);
  const defenderUnits = sideRegiments(defenders);
  if (attackerUnits <= 0 || defenderUnits <= 0) {
    return { attackerLosses: 0, defenderLosses: 0, attackerBroken: attackerUnits <= 0, defenderBroken: defenderUnits <= 0 };
  }

  const leaderAtk = sideLeader(attackers, true);
  const leaderDef = sideLeader(defenders, false);
  const attackerTech = attackers.length > 0 ? nationArmyTech(world, attackers[0].owner) : 0;
  const defenderTech = defenders.length > 0 ? nationArmyTech(world, defenders[0].owner) : 0;
  const attackerTypes = sideTypePower(attackers);
  const defenderTypes = sideTypePower(defenders);
  const attackerSpec = attackers.length > 0 ? nationArmySpecializationTech(world, attackers[0].owner) : { cavalry: 0, artillery: 0, guard: 0 };
  const defenderSpec = defenders.length > 0 ? nationArmySpecializationTech(world, defenders[0].owner) : { cavalry: 0, artillery: 0, guard: 0 };
  const terrainDef = terrainDefenseBonus(terrain);
  const attackerRoll = rng.next() * 6;
  const defenderRoll = rng.next() * 6;
  const attackerOrg = sideAvgOrg(attackers) / 100;
  const defenderOrg = sideAvgOrg(defenders) / 100;

  const attackerFlank = 1 + Math.min(0.24, Math.max(0, attackerTypes.cavalryShare - defenderTypes.cavalryShare) * 0.45) + attackerSpec.cavalry * 0.01;
  const defenderFlank = 1 + Math.min(0.24, Math.max(0, defenderTypes.cavalryShare - attackerTypes.cavalryShare) * 0.45) + defenderSpec.cavalry * 0.01;
  const attackerFirepower = attackerTypes.offense * (1 + attackerSpec.artillery * attackerTypes.artilleryShare * 0.03);
  const defenderFirepower = defenderTypes.offense * (1 + defenderSpec.artillery * defenderTypes.artilleryShare * 0.03);
  const attackerOffense = (attackerFirepower * attackerFlank + attackerRoll + leaderAtk.attack * 1.6 + attackerTech * 0.95) * clamp(attackerOrg + 0.35, 0.2, 1.45);
  const defenderOffense = (defenderFirepower * defenderFlank + defenderRoll + leaderDef.attack * 1.45 + defenderTech * 0.9) * clamp(defenderOrg + 0.35, 0.2, 1.45);
  const attackerDefense = 1 + leaderAtk.defense * 0.08 + attackerTypes.defense / Math.max(2, attackerUnits) * 0.3 + attackerSpec.guard * attackerTypes.guardShare * 0.02;
  const defenderDefense = 1 + leaderDef.defense * 0.08 + terrainDef + (province?.fortLevel ?? 0) * 0.05 + defenderTypes.defense / Math.max(2, defenderUnits) * 0.34 + defenderSpec.guard * defenderTypes.guardShare * 0.02;

  const attackerOrgDamage = clamp((defenderOffense / attackerDefense) * 1.8, 3, 60);
  const defenderOrgDamage = clamp((attackerOffense / defenderDefense) * 1.75, 3, 60);
  const attackerStrengthDamage = clamp((defenderOffense / attackerDefense) * (0.82 + defenderTypes.pursuit / Math.max(2, defenderUnits) * 0.2), 2, 45);
  const defenderStrengthDamage = clamp((attackerOffense / defenderDefense) * (0.82 + attackerTypes.pursuit / Math.max(2, attackerUnits) * 0.2), 2, 45);

  const attackerLosses = damageArmies(attackers, attackerOrgDamage, attackerStrengthDamage);
  const defenderLosses = damageArmies(defenders, defenderOrgDamage, defenderStrengthDamage);

  const attackerBroken = sideRegiments(attackers) <= 0 || sideAvgOrg(attackers) < 8;
  const defenderBroken = sideRegiments(defenders) <= 0 || sideAvgOrg(defenders) < 8;

  if (attackerBroken) {
    const retreatEnemySet = new Set<NationId>(war.defenders);
    for (const army of attackers) {
      const retreat = findRetreatProvince(world, army, retreatEnemySet);
      if (retreat >= 0) {
        army.location = retreat;
        army.moveTarget = -1;
        army.moveProgress = 0;
        for (const regiment of army.regiments) regiment.organization = clamp(regiment.organization * 0.55, 0, 100);
      } else {
        army.regiments = [];
      }
    }
  }
  if (defenderBroken) {
    const retreatEnemySet = new Set<NationId>(war.attackers);
    for (const army of defenders) {
      const retreat = findRetreatProvince(world, army, retreatEnemySet);
      if (retreat >= 0) {
        army.location = retreat;
        army.moveTarget = -1;
        army.moveProgress = 0;
        for (const regiment of army.regiments) regiment.organization = clamp(regiment.organization * 0.55, 0, 100);
      } else {
        army.regiments = [];
      }
    }
  }

  // U4: attacker-minus-defender edges per factor, scaled comparably so the
  // report can name the decisive one. Terrain/fort always favor the defender.
  const factors: BattleReport['factors'] = {
    roll: attackerRoll - defenderRoll,
    organization: (attackerOrg - defenderOrg) * 6,
    leadership: leaderAtk.attack * 1.6 - leaderDef.attack * 1.45,
    technology: attackerTech * 0.95 - defenderTech * 0.9,
    terrain: -terrainDef * 8,
    fort: -(province?.fortLevel ?? 0) * 0.4 * 8,
  };
  return { attackerLosses, defenderLosses, attackerBroken, defenderBroken, factors };
}

function resolveRebelCombat(world: World, rng: Rng, provinceId: ProvinceId, armiesAtProvince?: Army[]): void {
  const armies = armiesAtProvince ?? world.armies.filter((army) => army.location === provinceId);
  const rebels = armies.filter((army) => army.rebel);
  if (rebels.length === 0) return;
  for (const rebel of rebels) {
    const loyal = armies.filter((army) => !army.rebel && army.owner === rebel.hostileTo);
    if (loyal.length === 0) continue;
    const tempWar: War = {
      id: -1,
      attackers: [rebel.hostileTo],
      defenders: [rebel.hostileTo],
      goals: [],
      score: 0,
      attackerExhaustion: 0,
      defenderExhaustion: 0,
      startDay: world.day,
    };
    resolveLandBattle(world, rng, tempWar, provinceId, [rebel], loyal.slice(0, 1));
  }
}

function resolveFleetBattle(
  world: World,
  rng: Rng,
  _war: War,
  location: ProvinceId,
  attackerFleets: Fleet[],
  defenderFleets: Fleet[],
  armiesById: Map<ArmyId, Army>,
): { attackerLosses: number; defenderLosses: number } {
  const attackerPower = attackerFleets.reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0);
  const defenderPower = defenderFleets.reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0);
  if (attackerPower <= 0 || defenderPower <= 0) return { attackerLosses: 0, defenderLosses: 0 };

  const attackerTech = attackerFleets.length > 0 ? nationNavyTech(world, attackerFleets[0].owner) : 0;
  const defenderTech = defenderFleets.length > 0 ? nationNavyTech(world, defenderFleets[0].owner) : 0;
  const attackerRoll = rng.next() * 4;
  const defenderRoll = rng.next() * 4;
  const attackerDamage = clamp((attackerPower + attackerTech * 0.8 + attackerRoll) * 2.2, 1, 120);
  const defenderDamage = clamp((defenderPower + defenderTech * 0.8 + defenderRoll) * 2.2, 1, 120);

  let attackerLosses = 0;
  let defenderLosses = 0;
  const attackerShips = attackerFleets.flatMap((fleet) => fleet.ships);
  const defenderShips = defenderFleets.flatMap((fleet) => fleet.ships);
  const perAttackerShip = defenderDamage / Math.max(1, attackerShips.length);
  const perDefenderShip = attackerDamage / Math.max(1, defenderShips.length);

  for (const ship of attackerShips) {
    const orgDrop = perAttackerShip * 0.38;
    const oldStrength = ship.strength;
    ship.organization = clamp(ship.organization - orgDrop, 0, 100);
    const strDrop = perAttackerShip * 0.16 + Math.max(0, orgDrop - ship.organization) * 0.2;
    ship.strength = clamp(ship.strength - strDrop, 0, MAX_SHIP_STRENGTH);
    attackerLosses += Math.max(0, oldStrength - ship.strength);
  }
  for (const ship of defenderShips) {
    const orgDrop = perDefenderShip * 0.38;
    const oldStrength = ship.strength;
    ship.organization = clamp(ship.organization - orgDrop, 0, 100);
    const strDrop = perDefenderShip * 0.16 + Math.max(0, orgDrop - ship.organization) * 0.2;
    ship.strength = clamp(ship.strength - strDrop, 0, MAX_SHIP_STRENGTH);
    defenderLosses += Math.max(0, oldStrength - ship.strength);
  }

  for (const fleet of attackerFleets) fleet.ships = fleet.ships.filter((ship) => ship.strength > 0.001);
  for (const fleet of defenderFleets) fleet.ships = fleet.ships.filter((ship) => ship.strength > 0.001);

  for (const fleet of attackerFleets) {
    if (fleet.ships.length > 0) continue;
    if (fleet.embarkedArmy >= 0) {
      const embarked = armiesById.get(fleet.embarkedArmy);
      if (embarked) embarked.regiments = [];
    }
    fleet.embarkedArmy = -1;
    fleet.location = location;
  }
  for (const fleet of defenderFleets) {
    if (fleet.ships.length > 0) continue;
    if (fleet.embarkedArmy >= 0) {
      const embarked = armiesById.get(fleet.embarkedArmy);
      if (embarked) embarked.regiments = [];
    }
    fleet.embarkedArmy = -1;
    fleet.location = location;
  }

  return { attackerLosses, defenderLosses };
}

function updateArmyMovement(world: World, embarkedIds: Set<ArmyId>): void {
  for (const army of world.armies) {
    if (army.regiments.length <= 0) continue;
    if (isArmyEmbarked(world, army.id, embarkedIds)) continue;
    if (army.moveTarget < 0) continue;
    const province = world.provinces[army.location];
    const target = world.provinces[army.moveTarget];
    if (!province || !target || !province.neighbors.includes(target.id)) {
      army.moveTarget = -1;
      army.moveProgress = 0;
      continue;
    }
    const days = movementDaysForArmy(world, army, target);
    army.moveProgress = clamp(army.moveProgress + 1 / days, 0, 1);
    if (army.moveProgress >= 1) {
      army.location = target.id;
      army.moveTarget = -1;
      army.moveProgress = 0;
    }
  }
}

function updateFleetMovement(world: World, armiesById: Map<ArmyId, Army>): void {
  for (const fleet of world.fleets) {
    if (fleet.ships.length <= 0) continue;
    if (fleet.moveTarget < 0) continue;
    const source = world.provinces[fleet.location];
    const target = world.provinces[fleet.moveTarget];
    if (!source || !target || !source.coastal || !target.coastal) {
      fleet.moveTarget = -1;
      fleet.moveProgress = 0;
      continue;
    }
    const days = movementDaysForFleet(world, fleet, target);
    fleet.moveProgress = clamp(fleet.moveProgress + 1 / days, 0, 1);
    if (fleet.moveProgress >= 1) {
      fleet.location = target.id;
      fleet.moveTarget = -1;
      fleet.moveProgress = 0;
      if (fleet.embarkedArmy >= 0) {
        const embarked = armiesById.get(fleet.embarkedArmy);
        if (embarked) embarked.location = fleet.location;
      }
    }
  }
}

function cleanupDestroyedForces(world: World): void {
  world.armies = world.armies.filter((army) => army.regiments.length > 0);
  world.fleets = world.fleets.filter((fleet) => fleet.ships.length > 0);
}

function capRebelArmies(world: World, limit = BALANCE.rebellion.maxRebelArmiesWorld): void {
  const rebels = world.armies.filter((army) => army.rebel);
  if (rebels.length <= limit) return;
  const keepIds = new Set(rebels
    .slice()
    .sort((a, b) => b.regiments.length - a.regiments.length || a.id - b.id)
    .slice(0, limit)
    .map((army) => army.id));
  for (const rebel of rebels) {
    if (keepIds.has(rebel.id)) continue;
    rebel.regiments = [];
  }
}

function warById(world: World, warId: WarId): War | null {
  return world.wars.find((war) => war.id === warId) ?? null;
}

function nationAtWar(world: World, nationId: NationId): boolean {
  return world.wars.some((war) => war.attackers.includes(nationId) || war.defenders.includes(nationId));
}

function addBattleScore(world: World, warId: WarId, delta: number): void {
  const runtime = ensureRuntime(world);
  runtime.battleScoreByWar.set(warId, (runtime.battleScoreByWar.get(warId) ?? 0) + delta);
}

function calculateOccupationScore(world: World, war: War): number {
  let attackerOwned = 0;
  let attackerOccupiedByDefenders = 0;
  let defenderOwned = 0;
  let defenderOccupiedByAttackers = 0;
  for (const province of world.provinces) {
    if (war.attackers.includes(province.owner)) {
      attackerOwned++;
      if (war.defenders.includes(province.controller)) attackerOccupiedByDefenders++;
    } else if (war.defenders.includes(province.owner)) {
      defenderOwned++;
      if (war.attackers.includes(province.controller)) defenderOccupiedByAttackers++;
    }
  }
  const defenderOccupation = defenderOwned > 0 ? defenderOccupiedByAttackers / defenderOwned : 0;
  const attackerOccupation = attackerOwned > 0 ? attackerOccupiedByDefenders / attackerOwned : 0;
  let score = (defenderOccupation - attackerOccupation) * 48;

  for (const goal of war.goals) {
    if (goal.stateId < 0) continue;
    const state = world.states[goal.stateId];
    if (!state || state.provinceIds.length === 0) continue;
    let controlled = 0;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      if (province.controller === goal.holder) controlled++;
    }
    const progress = controlled / state.provinceIds.length;
    if (war.attackers.includes(goal.holder)) score += progress * goal.scoreValue * 0.9;
    else if (war.defenders.includes(goal.holder)) score -= progress * goal.scoreValue * 0.9;
  }
  return score;
}

function calculateCapitalScore(world: World, war: War): number {
  let score = 0;
  for (const attacker of war.attackers) {
    const capital = world.nations[attacker]?.capital ?? -1;
    const province = world.provinces[capital];
    if (province && war.defenders.includes(province.controller)) score -= 8;
  }
  for (const defender of war.defenders) {
    const capital = world.nations[defender]?.capital ?? -1;
    const province = world.provinces[capital];
    if (province && war.attackers.includes(province.controller)) score += 8;
  }
  return score;
}

function calculateBlockadeScore(world: World, war: War, fleetsByProv: Map<ProvinceId, Fleet[]>): number {
  let score = 0;
  for (const province of world.provinces) {
    if (!province.coastal) continue;
    const localFleets = fleetsByProv.get(province.id) ?? [];
    if (localFleets.length === 0) continue;
    const attackerPower = localFleets
      .filter((fleet) => war.attackers.includes(fleet.owner))
      .reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0);
    const defenderPower = localFleets
      .filter((fleet) => war.defenders.includes(fleet.owner))
      .reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0);
    if (war.defenders.includes(province.owner) && attackerPower > defenderPower * 1.2) score += 0.18;
    if (war.attackers.includes(province.owner) && defenderPower > attackerPower * 1.2) score -= 0.18;
  }
  return score;
}

function updateWarScores(world: World, fleetsByProv: Map<ProvinceId, Fleet[]>): void {
  const runtime = ensureRuntime(world);
  for (const war of world.wars) {
    const occupation = calculateOccupationScore(world, war);
    const capital = calculateCapitalScore(world, war);
    const blockade = calculateBlockadeScore(world, war, fleetsByProv);
    const battle = runtime.battleScoreByWar.get(war.id) ?? 0;
    const exhaustionTerm = (war.defenderExhaustion - war.attackerExhaustion) * 0.35;
    war.scoreBreakdown = {
      occupation,
      capital,
      blockade,
      battle,
      exhaustion: exhaustionTerm,
    };
    war.score = clamp(occupation + capital + blockade + battle + exhaustionTerm, -100, 100);
  }
}

function endWar(world: World, warId: WarId): void {
  const runtime = ensureRuntime(world);
  const index = world.wars.findIndex((war) => war.id === warId);
  if (index < 0) return;
  const war = world.wars[index];
  for (const attacker of war.attackers) {
    for (const defender of war.defenders) setTruce(world, attacker, defender);
  }
  world.wars.splice(index, 1);
  runtime.battleScoreByWar.delete(warId);
}

function transferStateTo(world: World, stateId: StateId, nationId: NationId): void {
  const state = world.states[stateId];
  if (!state) return;
  state.owner = nationId;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    province.owner = nationId;
    province.controller = nationId;
    province.occupationProgress = 0;
  }
}

/** Enforce a war goal's effects (also reused by 0.7.0 congress settlements). */
export function applyWarGoal(world: World, goal: WarGoal): void {
  const holder = world.nations[goal.holder];
  const target = world.nations[goal.target];
  if (!holder || !target) return;
  switch (goal.type) {
    case 'annex_state':
      transferStateTo(world, goal.stateId, goal.holder);
      holder.prestige += 2.4;
      target.prestige = Math.max(0, target.prestige - 1.8);
      break;
    case 'take_colony': {
      const state = world.states[goal.stateId];
      if (!state) break;
      const colonial = state.provinceIds.every((provinceId) => world.provinces[provinceId]?.colonial);
      if (colonial) transferStateTo(world, goal.stateId, goal.holder);
      holder.prestige += 1.6;
      target.prestige = Math.max(0, target.prestige - 0.8);
      break;
    }
    case 'liberate_state': {
      const fallback = world.nations.find((nation) => nation.tag === 'UNC' && nation.id !== goal.holder && nation.id !== goal.target)?.id ?? goal.holder;
      transferStateTo(world, goal.stateId, fallback);
      holder.prestige += 1.4;
      target.prestige = Math.max(0, target.prestige - 1.1);
      break;
    }
    case 'humiliate':
      holder.prestige += 5;
      target.prestige = Math.max(0, target.prestige - 10);
      break;
    case 'add_to_sphere':
      target.spheredBy = holder.id;
      if (!holder.sphereMembers.includes(target.id)) holder.sphereMembers.push(target.id);
      holder.prestige += 1;
      break;
    case 'cut_down_to_size':
      target.prestige = Math.max(0, target.prestige - 12);
      target.gpRank = 0;
      target.sphereMembers = [];
      holder.prestige += 2;
      break;
    default:
      break;
  }
}

export function offerPeaceTerms(
  world: World,
  warId: WarId,
  offeringNation: NationId,
  goalsToEnforce: number[],
): { ok: boolean; reason: string; counterGoals?: number[] } {
  const war = warById(world, warId);
  if (!war) return { ok: false, reason: 'War not found.' };
  const offeringAttackers = war.attackers.includes(offeringNation);
  const offeringDefenders = war.defenders.includes(offeringNation);
  if (!offeringAttackers && !offeringDefenders) return { ok: false, reason: 'Nation is not in this war.' };
  if (goalsToEnforce.length === 0) {
    const mutualExhaustion = war.attackerExhaustion >= WHITE_PEACE_MUTUAL_EXHAUSTION
      && war.defenderExhaustion >= WHITE_PEACE_MUTUAL_EXHAUSTION;
    const scoreBand = Math.abs(war.score) <= WHITE_PEACE_SCORE_BAND;
    if (mutualExhaustion || scoreBand) {
      endWar(world, warId);
      return {
        ok: true,
        reason: mutualExhaustion
          ? 'White peace signed (mutual exhaustion).'
          : 'White peace signed (warscore stalemate).',
      };
    }
    // Escape hatch closed: quitting outside free conditions costs prestige.
    const quitter = world.nations[offeringNation];
    if (quitter) {
      quitter.prestige = Math.max(0, quitter.prestige - WHITE_PEACE_PRESTIGE_FEE);
    }
    endWar(world, warId);
    return {
      ok: true,
      reason: `White peace signed (−${WHITE_PEACE_PRESTIGE_FEE} prestige).`,
    };
  }
  const requested = goalsToEnforce
    .map((index) => war.goals[index])
    .filter((goal): goal is WarGoal => Boolean(goal))
    .filter((goal) => offeringAttackers ? war.attackers.includes(goal.holder) : war.defenders.includes(goal.holder));
  if (requested.length === 0) return { ok: false, reason: 'No enforceable goals selected.' };
  const needed = requested.reduce((sum, goal) => sum + Math.max(0, goal.scoreValue), 0);
  const available = offeringAttackers ? war.score : -war.score;
  if (available + 1e-6 < needed) {
    return { ok: false, reason: `Need ${needed.toFixed(1)} score, only ${available.toFixed(1)} available.` };
  }
  const receiverExhaustion = offeringAttackers ? war.defenderExhaustion : war.attackerExhaustion;
  const offeringExhaustion = offeringAttackers ? war.attackerExhaustion : war.defenderExhaustion;
  const acceptanceBudget = clamp(available + receiverExhaustion * 0.55 - offeringExhaustion * 0.2, 0, 140);
  if (needed > acceptanceBudget + 2) {
    const candidateIndices = Array.from(new Set(goalsToEnforce.filter((index) => index >= 0 && index < war.goals.length))).sort((a, b) => a - b);
    const sorted = candidateIndices
      .map((index) => ({ index, cost: Math.max(0, war.goals[index]?.scoreValue ?? 0) }))
      .filter((entry) => entry.cost > 0)
      .sort((a, b) => b.cost - a.cost || a.index - b.index);
    let running = 0;
    const counterGoals: number[] = [];
    for (const entry of sorted) {
      if (running + entry.cost > acceptanceBudget) continue;
      running += entry.cost;
      counterGoals.push(entry.index);
    }
    counterGoals.sort((a, b) => a - b);
    if (counterGoals.length === 0) {
      return {
        ok: false,
        reason: `Offer rejected. Opposing side will only accept white peace (exhaustion ${receiverExhaustion.toFixed(1)}).`,
        counterGoals: [],
      };
    }
    return {
      ok: false,
      reason: `Offer rejected. Counter-offer accepts ${counterGoals.length} goal(s) for ${running.toFixed(1)} score.`,
      counterGoals,
    };
  }
  for (const goal of requested) applyWarGoal(world, goal);
  endWar(world, warId);
  return { ok: true, reason: `Peace enforced (${requested.length} goals).` };
}

function resolveWarBattles(
  world: World,
  rng: Rng,
  byProvince: Map<ProvinceId, Army[]>,
  fleetsByProv: Map<ProvinceId, Fleet[]>,
  armiesById: Map<ArmyId, Army>,
): void {
  for (const war of world.wars) {
    let attackerCasualties = 0;
    let defenderCasualties = 0;
    for (const [provinceId, armies] of byProvince.entries()) {
      const attackers = armies.filter((army) => !army.rebel && war.attackers.includes(army.owner) && army.regiments.length > 0);
      const defenders = armies.filter((army) => !army.rebel && war.defenders.includes(army.owner) && army.regiments.length > 0);
      if (attackers.length === 0 || defenders.length === 0) continue;
      const result = resolveLandBattle(world, rng, war, provinceId, attackers, defenders);
      attackerCasualties += result.attackerLosses;
      defenderCasualties += result.defenderLosses;
      if (result.factors) {
        world.recentBattles = world.recentBattles ?? [];
        world.recentBattles.push({
          day: world.day,
          provinceId,
          provinceName: world.provinces[provinceId]?.name ?? `Province ${provinceId}`,
          warId: war.id,
          attackerNation: attackers[0].owner,
          defenderNation: defenders[0].owner,
          attackerLosses: result.attackerLosses,
          defenderLosses: result.defenderLosses,
          outcome: result.defenderBroken && !result.attackerBroken
            ? 'attacker_victory'
            : result.attackerBroken && !result.defenderBroken
              ? 'defender_victory'
              : 'clash',
          factors: result.factors,
        });
        if (world.recentBattles.length > 24) world.recentBattles.splice(0, world.recentBattles.length - 24);
      }
      if (result.attackerBroken && !result.defenderBroken) addBattleScore(world, war.id, -3.4);
      else if (result.defenderBroken && !result.attackerBroken) addBattleScore(world, war.id, 3.4);
      const delta = (result.defenderLosses - result.attackerLosses) * 0.005;
      addBattleScore(world, war.id, clamp(delta, -1.5, 1.5));
    }

    for (const [provinceId, fleets] of fleetsByProv.entries()) {
      const attackerFleets = fleets.filter((fleet) => war.attackers.includes(fleet.owner) && fleet.ships.length > 0);
      const defenderFleets = fleets.filter((fleet) => war.defenders.includes(fleet.owner) && fleet.ships.length > 0);
      if (attackerFleets.length === 0 || defenderFleets.length === 0) continue;
      const result = resolveFleetBattle(world, rng, war, provinceId, attackerFleets, defenderFleets, armiesById);
      attackerCasualties += result.attackerLosses;
      defenderCasualties += result.defenderLosses;
      addBattleScore(world, war.id, clamp((result.defenderLosses - result.attackerLosses) * 0.01, -1.2, 1.2));
    }

    war.attackerExhaustion = clamp(war.attackerExhaustion + 0.025 + attackerCasualties * 0.00028, 0, 100);
    war.defenderExhaustion = clamp(war.defenderExhaustion + 0.025 + defenderCasualties * 0.00028, 0, 100);
  }

  for (const [provinceId, armies] of byProvince.entries()) resolveRebelCombat(world, rng, provinceId, armies);
}

function updateSieges(world: World, byProvince: Map<ProvinceId, Army[]>): void {
  const enemyMap = warEnemyMap(world);
  for (const [provinceId, armies] of byProvince.entries()) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    const activeArmies = armies.filter((army) => army.regiments.length > 0);
    const nonRebelArmies = activeArmies.filter((army) => !army.rebel);
    for (const army of nonRebelArmies) {
      const enemies = enemyMap.get(army.owner);
      if (!enemies || !enemies.has(province.owner)) continue;
      const enemyPresent = nonRebelArmies.some((other) => other.owner !== army.owner && enemies.has(other.owner));
      if (enemyPresent) continue;
      if (province.controller === army.owner) continue;
      const leaderBonus = army.leader?.trait === 'siegecraft' ? 1.25 : 1;
      const typePower = sideTypePower([army]);
      const artilleryBoost = 1 + Math.min(0.95, typePower.artilleryShare * 1.4);
      const infantryPenalty = typePower.infantryShare < 0.2 ? 0.82 : 1;
      const daily = (0.028 / (1 + province.fortLevel * 0.75)) * leaderBonus * artilleryBoost * infantryPenalty;
      province.occupationProgress = clamp(province.occupationProgress + daily, 0, 1);
      if (province.occupationProgress >= 0.999) {
        province.controller = army.owner;
        province.occupationProgress = 0;
      }
    }

    const rebelArmies = activeArmies.filter((army) => army.rebel && army.hostileTo === province.owner);
    if (rebelArmies.length > 0 && province.controller !== -1) {
      const loyalPresence = nonRebelArmies.some((army) => army.owner === province.owner);
      if (!loyalPresence) {
        const siegeWeight = rebelArmies.reduce((sum, army) => sum + sideTypePower([army]).siege, 0);
        const regimentCount = rebelArmies.reduce((sum, army) => sum + army.regiments.length, 0);
        const siegeFactor = regimentCount > 0 ? clamp(siegeWeight / regimentCount, 0.45, 2.5) : 1;
        const daily = (REBEL_SIEGE_BASE_DAILY / (1 + province.fortLevel * 0.8)) * siegeFactor;
        province.occupationProgress = clamp(province.occupationProgress + daily, 0, 1);
        if (province.occupationProgress >= 0.999) {
          province.controller = -1;
          province.occupationProgress = 0;
        }
      }
    }

    if (province.controller !== province.owner) {
      const ownerArmy = nonRebelArmies.find((army) => army.owner === province.owner);
      const hostileOwnerPresent = activeArmies.some((army) => army.owner !== province.owner || army.rebel);
      if (ownerArmy && !hostileOwnerPresent) {
        province.occupationProgress = clamp(province.occupationProgress + 0.04, 0, 1);
        if (province.occupationProgress >= 0.999) {
          province.controller = province.owner;
          province.occupationProgress = 0;
        }
      }
    }
  }
}

function updateSupplyAndAttrition(world: World, embarkedIds: Set<ArmyId>): void {
  for (const army of world.armies) {
    if (army.regiments.length === 0 || army.rebel) continue;
    if (isArmyEmbarked(world, army.id, embarkedIds)) continue;
    // Supply topology is unchanged by reinforcement, so compute it once and
    // reuse for both reinforcement and attrition (was two BFS per army/day).
    const supplied = isSupplied(world, army.owner, army.location);
    reinforceArmy(world, army, supplied);
    if (!supplied) applyUnsuppliedAttrition(army);
    cleanupArmy(army);
  }
}

function claimableColonialState(world: World, nationId: NationId, stateId: StateId): boolean {
  const state = world.states[stateId];
  if (!state || state.provinceIds.length === 0) return false;
  const provinces = state.provinceIds.map((provinceId) => world.provinces[provinceId]).filter((province): province is Province => Boolean(province));
  if (provinces.length === 0) return false;
  if (!provinces.every((province) => province.colonial)) return false;
  let adjacentByLand = false;
  for (const province of provinces) {
    if (province.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === nationId)) {
      adjacentByLand = true;
      break;
    }
  }
  const hasOverseasReach = provinces.some((province) => province.coastal) && world.provinces.some((province) => (
    province.owner === nationId && province.coastal && province.navalBaseLevel > 0
  ));
  return adjacentByLand || hasOverseasReach;
}

function applyColonyToNation(world: World, stateId: StateId, nationId: NationId): void {
  const state = world.states[stateId];
  if (!state) return;
  state.owner = nationId;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    province.owner = nationId;
    province.controller = nationId;
    province.colonial = false;
    province.occupationProgress = 0;
  }
}

/**
 * Naval-base power (province.navalBaseLevel * 10) summed per owner in a single
 * provinces pass. Accumulating in province-index order per owner reproduces the
 * exact float sequence the old per-nation filter+reduce produced.
 */
function navalBasePowerByOwner(world: World): number[] {
  const power = new Array(world.nations.length).fill(0);
  for (const province of world.provinces) {
    const owner = province.owner;
    if (owner >= 0 && owner < power.length) power[owner] += province.navalBaseLevel * 10;
  }
  return power;
}

function computeColonialPoints(world: World, nationId: NationId, navalPow?: number[]): number {
  const runtime = ensureRuntime(world);
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const navalBasePower = navalPow
    ? (navalPow[nationId] ?? 0)
    : world.provinces
        .filter((province) => province.owner === nationId)
        .reduce((sum, province) => sum + province.navalBaseLevel * 10, 0);
  const reformBonus = (nation.reforms.conscription_level ?? 0) * 6 + (nation.reforms.army_professionalism ?? 0) * 4;
  const techBonus = nationNavyTech(world, nationId) * 5;
  const gpBonus = nation.gpRank > 0 ? 12 : 0;
  const committed = Array.from(runtime.colonialClaims.values())
    .filter((claim) => claim.claimants.has(nationId))
    .length * COLONIAL_CLAIM_COST;
  return Math.max(0, Math.round(navalBasePower + reformBonus + techBonus + gpBonus - committed));
}

function updateColonialClaims(world: World): void {
  const runtime = ensureRuntime(world);
  const navalPow = navalBasePowerByOwner(world);
  for (const nation of world.nations) nation.colonialPoints = computeColonialPoints(world, nation.id, navalPow);
  for (const claim of runtime.colonialClaims.values()) {
    const claimants = Array.from(claim.claimants.keys()).sort((a, b) => a - b);
    for (const claimant of claimants) {
      const nation = world.nations[claimant];
      if (!nation || nation.colonialPoints < COLONIAL_CLAIM_COST) continue;
      const next = clamp((claim.claimants.get(claimant) ?? 0) + 0.006 + (nation.gpRank > 0 ? 0.002 : 0), 0, 1.2);
      claim.claimants.set(claimant, next);
    }
    if (claimants.length > 1) {
      claim.tension = clamp(claim.tension + 0.015 * claimants.length, 0, 1.2);
      for (let i = 0; i < claimants.length; i++) {
        for (let j = i + 1; j < claimants.length; j++) {
          const relation = getOrCreateRelation(world, claimants[i], claimants[j]);
          relation.opinion = clamp(relation.opinion - 0.18, -200, 200);
        }
      }
    }
    const winner = Array.from(claim.claimants.entries())
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (winner && winner[1] >= 1) {
      applyColonyToNation(world, claim.stateId, winner[0]);
      runtime.colonialClaims.delete(claim.stateId);
    }
  }
}

export function startColonization(world: World, nationId: NationId, stateId: StateId): { ok: boolean; reason: string } {
  const runtime = ensureRuntime(world);
  if (!claimableColonialState(world, nationId, stateId)) {
    return { ok: false, reason: 'State is not claimable with current colonial reach.' };
  }
  const nation = world.nations[nationId];
  if (!nation || nation.colonialPoints < COLONIAL_CLAIM_COST) {
    return { ok: false, reason: `Need ${COLONIAL_CLAIM_COST} colonial points.` };
  }
  const existing = runtime.colonialClaims.get(stateId) ?? {
    stateId,
    claimants: new Map<NationId, number>(),
    tension: 0,
  };
  existing.claimants.set(nationId, clamp((existing.claimants.get(nationId) ?? 0) + 0.25, 0, 1.2));
  runtime.colonialClaims.set(stateId, existing);
  return { ok: true, reason: 'Colonial claim planted.' };
}

function mobilizedSetFor(runtime: WarRuntime, nationId: NationId): Set<ArmyId> {
  const existing = runtime.mobilizedArmyIds.get(nationId);
  if (existing) return existing;
  const created = new Set<ArmyId>();
  runtime.mobilizedArmyIds.set(nationId, created);
  return created;
}

function estimateActiveRegiments(world: World, nationId: NationId): number {
  return world.armies
    .filter((army) => !army.rebel && army.owner === nationId)
    .reduce((sum, army) => sum + army.regiments.length, 0);
}

export function mobilizeNation(world: World, nationId: NationId): { ok: boolean; reason: string } {
  const runtime = ensureRuntime(world);
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Nation not found.' };
  if (!nationAtWar(world, nationId)) return { ok: false, reason: 'Mobilization is only available during war.' };
  if (runtime.mobilizedNations.has(nationId)) return { ok: false, reason: 'Already mobilized.' };
  const standing = estimateActiveRegiments(world, nationId);
  const available = Math.max(0, nation.mobilizationCapacity - Math.max(0, standing - nation.standingRegimentCapacity));
  if (available <= 0) return { ok: false, reason: 'No mobilization capacity available.' };
  const candidatePops = world.pops
    .filter((pop) => pop.type !== 'soldier' && pop.size > 300 && world.provinces[pop.provinceId]?.owner === nationId)
    .sort((a, b) => b.size - a.size || a.id - b.id);
  if (candidatePops.length === 0) return { ok: false, reason: 'No eligible pops for mobilization.' };

  const mobilizedIds = mobilizedSetFor(runtime, nationId);
  let raised = 0;
  let cursor = 0;
  while (raised < available && cursor < candidatePops.length) {
    const pop = candidatePops[cursor++];
    if (pop.size < 250) continue;
    const regiments = [];
    const regimentCount = Math.min(3, available - raised);
    for (let i = 0; i < regimentCount; i++) {
      if (pop.size < 160) break;
      pop.size = Math.max(0, pop.size - 55);
      regiments.push({
        type: 'infantry' as const,
        strength: 830,
        organization: clamp(38 + nation.armyOrganization * 10, 20, 80),
        sourcePop: pop.id,
      });
      raised++;
    }
    if (regiments.length === 0) continue;
    const newArmy: Army = {
      id: world.nextArmyId++,
      owner: nationId,
      location: pop.provinceId,
      moveTarget: -1,
      moveProgress: 0,
      regiments,
      leader: null,
      rebel: false,
      hostileTo: -1,
    };
    world.armies.push(newArmy);
    mobilizedIds.add(newArmy.id);
  }
  if (raised <= 0) return { ok: false, reason: 'Failed to raise mobilized regiments.' };
  runtime.mobilizedNations.add(nationId);
  nation.treasury -= raised * 14;
  return { ok: true, reason: `Mobilized ${raised} reserve regiments.` };
}

export function demobilizeNation(world: World, nationId: NationId): void {
  const runtime = ensureRuntime(world);
  runtime.mobilizedNations.delete(nationId);
  const ids = mobilizedSetFor(runtime, nationId);
  const byId = armiesByIdMap(world);
  for (const armyId of ids) {
    const army = byId.get(armyId);
    if (!army) continue;
    for (const regiment of army.regiments) {
      const source = popById(world, regiment.sourcePop);
      if (source) source.size += regiment.strength * 0.35;
    }
    army.regiments = [];
  }
  ids.clear();
  cleanupDestroyedForces(world);
}

export function canEmbarkArmy(world: World, fleetId: FleetId, armyId: ArmyId): { ok: boolean; reason: string } {
  const fleetsById = new Map(world.fleets.map((fleet) => [fleet.id, fleet]));
  const armiesById = armiesByIdMap(world);
  const fleet = fleetsById.get(fleetId);
  const army = armiesById.get(armyId);
  if (!fleet || !army) return { ok: false, reason: 'Fleet or army missing.' };
  if (fleet.owner !== army.owner) return { ok: false, reason: 'Fleet and army must share owner.' };
  if (fleet.location !== army.location) return { ok: false, reason: 'Fleet and army must be in same province.' };
  if (fleet.embarkedArmy >= 0) return { ok: false, reason: 'Fleet already carries an army.' };
  const capacity = fleetTransportCapacity(fleet);
  if (capacity < army.regiments.length) return { ok: false, reason: 'Not enough transport capacity.' };
  return { ok: true, reason: 'Embark possible.' };
}

export function hasNavalSupremacyForLanding(world: World, nationId: NationId, targetProvinceId: ProvinceId): boolean {
  const target = world.provinces[targetProvinceId];
  if (!target || !target.coastal) return false;
  const enemies = new Set<NationId>();
  for (const war of world.wars) {
    if (war.attackers.includes(nationId)) war.defenders.forEach((id) => enemies.add(id));
    if (war.defenders.includes(nationId)) war.attackers.forEach((id) => enemies.add(id));
  }
  if (target.owner !== nationId) enemies.add(target.owner);
  let friendlyPower = 0;
  let enemyPower = 0;
  for (const fleet of world.fleets) {
    if (fleet.location !== targetProvinceId) continue;
    const power = fleetCombatPower(fleet);
    if (fleet.owner === nationId) friendlyPower += power;
    else if (enemies.has(fleet.owner)) enemyPower += power;
  }
  if (friendlyPower <= 0 && enemyPower <= 0) {
    // Quiet sea lane fallback: require at least one owned combat fleet anywhere.
    friendlyPower = world.fleets
      .filter((fleet) => fleet.owner === nationId)
      .reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0) * 0.4;
    enemyPower = world.fleets
      .filter((fleet) => enemies.has(fleet.owner))
      .reduce((sum, fleet) => sum + fleetCombatPower(fleet), 0) * 0.3;
  }
  return friendlyPower >= enemyPower * 1.05;
}

export function disembarkFromFleet(world: World, fleetId: FleetId, targetProvinceId: ProvinceId): { ok: boolean; reason: string } {
  const fleet = world.fleets.find((candidate) => candidate.id === fleetId);
  if (!fleet || fleet.embarkedArmy < 0) return { ok: false, reason: 'No embarked army on this fleet.' };
  const army = armiesByIdMap(world).get(fleet.embarkedArmy);
  const target = world.provinces[targetProvinceId];
  const seaProvince = world.provinces[fleet.location];
  if (!army || !target || !seaProvince) return { ok: false, reason: 'Invalid disembark target.' };
  if (!target.coastal) return { ok: false, reason: 'Landings require a coastal province.' };
  if (fleet.location !== targetProvinceId) return { ok: false, reason: 'Fleet must be in the target coastal province to land troops.' };
  const overseas = !target.neighbors.some((neighborId) => world.provinces[neighborId]?.owner === army.owner);
  if (overseas && !hasNavalSupremacyForLanding(world, army.owner, targetProvinceId)) {
    return { ok: false, reason: 'Naval supremacy required for overseas landing.' };
  }
  army.location = targetProvinceId;
  army.moveTarget = -1;
  army.moveProgress = 0;
  for (const regiment of army.regiments) regiment.organization = clamp(regiment.organization - 7, 0, 100);
  fleet.embarkedArmy = -1;
  return { ok: true, reason: `Army landed in ${target.name}.` };
}

function updateMobilizationUpkeep(world: World): void {
  const runtime = ensureRuntime(world);
  if (runtime.mobilizedNations.size === 0) return;
  const byId = armiesByIdMap(world);

  // Bucket civilian pops by their home owner in a single pass (was one full
  // pop scan per mobilized nation — O(mobilized × pops) daily). Each pop is
  // still touched at most once and order-independently, so results are identical.
  const civilianPopsByOwner = new Map<NationId, typeof world.pops>();
  for (const pop of world.pops) {
    if (pop.type === 'soldier') continue;
    const home = world.provinces[pop.provinceId];
    if (!home) continue;
    const owner = home.owner;
    if (!runtime.mobilizedNations.has(owner)) continue;
    const list = civilianPopsByOwner.get(owner) ?? [];
    list.push(pop);
    civilianPopsByOwner.set(owner, list);
  }

  for (const nationId of runtime.mobilizedNations) {
    const nation = world.nations[nationId];
    if (!nation) continue;
    const armyIds = mobilizedSetFor(runtime, nationId);
    let mobilizedRegiments = 0;
    for (const armyId of armyIds) {
      const army = byId.get(armyId);
      if (!army) continue;
      mobilizedRegiments += army.regiments.length;
    }
    nation.treasury -= mobilizedRegiments * MOBILIZED_UPKEEP_DAILY;
    const penalty = mobilizedRegiments * 0.000007;
    for (const pop of civilianPopsByOwner.get(nationId) ?? []) {
      pop.needsMet = clamp(pop.needsMet - penalty, 0, 1);
    }
  }
}

function rebelArmiesFor(world: World, rebellionId: number): Army[] {
  return world.armies.filter((army) => army.rebel && army.rebellionId === rebellionId && army.regiments.length > 0);
}

function applyRebelReformDemand(world: World, data: GameData, rebellion: Rebellion): void {
  const nation = world.nations[rebellion.targetNation];
  if (!nation || rebellion.demand.type !== 'enact_reform' || !rebellion.demand.reformKey) return;
  const reform = data.reforms.find((entry) => entry.key === rebellion.demand.reformKey);
  if (!reform) return;
  const target = clamp(rebellion.demand.reformLevel ?? (nation.reforms[reform.key] ?? 0) + 1, 0, reform.options.length - 1);
  if (target <= (nation.reforms[reform.key] ?? 0)) return;
  nation.reforms[reform.key] = target;
  const targetStates = new Set([rebellion.originState, ...(rebellion.demand.stateIds ?? [])]);
  for (const province of world.provinces) {
    if (province.owner !== nation.id || !targetStates.has(province.stateId)) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      pop.militancy = clamp(pop.militancy - 0.32, 0, 10);
      pop.consciousness = clamp(pop.consciousness + 0.08, 0, 10);
    }
  }
  if (reform.category === 'military') updateMilitaryDerivedForNation(world, nation.id);
}

function createIndependentRebelNation(world: World, data: GameData, rebellion: Rebellion): NationId {
  const target = world.nations[rebellion.targetNation];
  const stateIds = rebellion.demand.stateIds?.slice() ?? [rebellion.originState];
  const culture = rebellion.demand.culture ?? target?.primaryCulture ?? 0;
  const cultureDef = data.cultures[culture];
  const newId = world.nations.length as NationId;
  const template = target ?? world.nations[world.playerNation];
  const capitalState = world.states[stateIds[0]];
  const capital = capitalState?.provinceIds[0] ?? template?.capital ?? 0;
  const tag = `REB${newId}`;
  const name = cultureDef ? `${cultureDef.name} Revolt` : `Rebel State ${newId}`;
  const color = cultureDef?.color ?? template?.color ?? [140, 110, 100];
  world.nations.push({
    id: newId,
    tag,
    name,
    color,
    primaryCulture: culture,
    acceptedCultures: [culture],
    government: template?.government ?? 'presidential_dictatorship',
    rulingParty: defaultRulingParty(template?.government ?? 'presidential_dictatorship'),
    parties: createNationParties(),
    upperHouse: defaultUpperHouse(template?.government ?? 'presidential_dictatorship'),
    electionIntervalYears: 4,
    lastElectionYear: 1820,
    nextElectionYear: Number.MAX_SAFE_INTEGER,
    electionLastResult: 'Revolutionary council',
    capital,
    coreStateIds: stateIds.slice().sort((a, b) => a - b),
    treasury: 650,
    prestige: 6,
    infamy: 0,
    literacy: clamp(template?.literacy ?? 0.25, 0.05, 0.75),
    nationalConsciousness: 2.6,
    researchPoints: 0,
    reforms: { ...(template?.reforms ?? {}) },
    techs: (template?.techs ?? []).slice(),
    taxRatePoor: 0.45,
    taxRateMiddle: 0.35,
    taxRateRich: 0.22,
    tariffRate: 0.1,
    gpRank: 0,
    spheredBy: -1,
    sphereMembers: [],
    colonialPoints: 0,
    isCivilized: template?.isCivilized ?? false,
    isPlayer: false,
    isBankrupt: false,
    bankruptcyMonths: 0,
    constructionBlocked: false,
    monthlyTariffIncome: 0,
    monthlyProductionIncome: 0,
    lastBudget: template ? JSON.parse(JSON.stringify(template.lastBudget)) : {
      taxIncome: 0,
      tariffIncome: 0,
      productionIncome: 0,
      armyUpkeep: 0,
      subsidySpend: 0,
      constructionSpend: 0,
      adminSpend: 0,
      reformUpkeep: 0,
      net: 0,
      bankrupt: false,
      trace: {
        taxIncome: [],
        tariffIncome: [],
        productionIncome: [],
        armyUpkeep: [],
        subsidySpend: [],
        constructionSpend: [],
        adminSpend: [],
        reformUpkeep: [],
        net: [],
      },
    },
    regimentsPerSoldierPop: template?.regimentsPerSoldierPop ?? 0.8,
    standingRegimentCapacity: 0,
    mobilizationCapacity: 0,
    armyOrganization: template?.armyOrganization ?? 0.9,
    armyMorale: template?.armyMorale ?? 0.9,
  });
  for (let otherId = 0; otherId < newId; otherId++) {
    world.relations.push({
      a: otherId,
      b: newId,
      kind: otherId === rebellion.targetNation ? 'truce' : 'neutral',
      opinion: otherId === rebellion.targetNation ? -45 : 0,
      expiresDay: otherId === rebellion.targetNation ? world.day + 365 * 5 : -1,
    });
  }
  updateMilitaryDerivedForNation(world, newId);
  return newId;
}

function applyRebelIndependenceDemand(world: World, data: GameData, rebellion: Rebellion): void {
  const target = world.nations[rebellion.targetNation];
  if (!target) return;
  const toRelease = (rebellion.demand.stateIds?.slice() ?? [rebellion.originState])
    .filter((stateId) => world.states[stateId] && world.states[stateId].owner === rebellion.targetNation);
  if (toRelease.length === 0) return;
  const newNationId = createIndependentRebelNation(world, data, rebellion);
  for (const stateId of toRelease) transferStateTo(world, stateId, newNationId);
  target.prestige = Math.max(0, target.prestige - 8);
  target.coreStateIds = (target.coreStateIds ?? []).filter((stateId) => !toRelease.includes(stateId));
  updateMilitaryDerivedForNation(world, rebellion.targetNation);
}

function applyRebellionAftermath(world: World, rebellion: Rebellion, militancyRelief: number): void {
  const targetStates = new Set([rebellion.originState, ...(rebellion.demand.stateIds ?? [])]);
  for (const stateId of targetStates) {
    const state = world.states[stateId];
    if (!state) continue;
    state.unrestRisk = clamp(state.unrestRisk * BALANCE.rebellion.postResolutionUnrestMultiplier, 0, 2);
    state.unrestMonths = 0;
    state.lastRebellionDay = world.day;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province || province.owner !== rebellion.targetNation) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        pop.militancy = clamp(pop.militancy - militancyRelief, 0, 10);
      }
    }
  }
}

function updateRebellions(world: World, data: GameData): void {
  if (!Array.isArray(world.rebellions) || world.rebellions.length === 0) return;
  for (const rebellion of world.rebellions) {
    if (rebellion.status !== 'active') continue;
    const armies = rebelArmiesFor(world, rebellion.id);
    const demandStates = rebellion.demand.stateIds?.slice() ?? [rebellion.originState];
    const relevantProvinces = world.provinces.filter((province) => (
      province.owner === rebellion.targetNation
      && (
        rebellion.demand.type !== 'independence'
        || demandStates.includes(province.stateId)
      )
    ));
    const controlled = relevantProvinces.filter((province) => province.controller === -1);
    const holdShare = relevantProvinces.length > 0 ? controlled.length / relevantProvinces.length : 0;
    const rebelStrength = armies.reduce((sum, army) => sum + army.regiments.reduce((inner, regiment) => inner + regiment.strength, 0), 0);
    const loyalStrength = world.armies
      .filter((army) => !army.rebel && army.owner === rebellion.targetNation)
      .reduce((sum, army) => sum + army.regiments.reduce((inner, regiment) => inner + regiment.strength, 0), 0);
    if (holdShare > 0.18) rebellion.holdDays += 1;
    else rebellion.holdDays = Math.max(0, rebellion.holdDays - 1);
    let delta = holdShare * 1.35;
    if (rebelStrength > loyalStrength * 1.05) delta += 0.42;
    if (loyalStrength < 2500) delta += 0.24;
    if (armies.length === 0) delta -= 0.6;
    if (holdShare < 0.05) delta -= 0.35;
    rebellion.progress = clamp(rebellion.progress + delta, 0, 120);
    const enforce = rebellion.progress >= REBELLION_PROGRESS_TO_ENFORCE
      || (rebellion.holdDays >= 180 && holdShare >= 0.35 && rebelStrength >= loyalStrength * 0.6);
    if (!enforce) {
      if (armies.length === 0 && rebellion.progress < 2 && holdShare <= 0.01) {
        rebellion.status = 'crushed';
        applyRebellionAftermath(world, rebellion, BALANCE.rebellion.crushedMilitancyRelief);
      }
      continue;
    }
    if (rebellion.demand.type === 'enact_reform') applyRebelReformDemand(world, data, rebellion);
    else applyRebelIndependenceDemand(world, data, rebellion);
    rebellion.status = 'enforced';
    applyRebellionAftermath(world, rebellion, BALANCE.rebellion.enforcedMilitancyRelief);
    for (const army of armies) army.regiments = [];
  }
  if (world.rebellions.length > 64) {
    world.rebellions = world.rebellions
      .slice()
      .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.startDay - a.startDay))
      .slice(0, 64);
  }
}

function maybeAutoPeace(world: World): void {
  for (const war of world.wars.slice()) {
    const attackerPressure = war.score + (war.defenderExhaustion - war.attackerExhaustion) * 0.4;
    const defenderPressure = -war.score + (war.attackerExhaustion - war.defenderExhaustion) * 0.4;
    if (attackerPressure < 65 && defenderPressure < 65 && war.attackerExhaustion < 96 && war.defenderExhaustion < 96) continue;
    const attackerWins = war.score >= 0;
    const available = attackerWins ? war.score : -war.score;
    const side = attackerWins ? war.attackers : war.defenders;
    const candidateGoals = war.goals
      .filter((goal) => side.includes(goal.holder))
      .sort((a, b) => b.scoreValue - a.scoreValue);
    const selected: number[] = [];
    let used = 0;
    for (let i = 0; i < war.goals.length; i++) {
      const goal = war.goals[i];
      if (!candidateGoals.includes(goal)) continue;
      if (used + goal.scoreValue > available) continue;
      selected.push(i);
      used += goal.scoreValue;
    }
    const proposer = side[0];
    const result = offerPeaceTerms(world, war.id, proposer, selected);
    if (!result.ok && result.counterGoals && result.counterGoals.length < selected.length) {
      offerPeaceTerms(world, war.id, proposer, result.counterGoals);
      continue;
    }
    if (!result.ok && (war.attackerExhaustion > 98 || war.defenderExhaustion > 98)) {
      offerPeaceTerms(world, war.id, proposer, []);
    }
  }
}

function normalizeWarPostPeace(world: World): void {
  const runtime = ensureRuntime(world);
  for (const nationId of Array.from(runtime.mobilizedNations)) {
    if (nationAtWar(world, nationId)) continue;
    demobilizeNation(world, nationId);
  }
}

export function runWarDaily(world: World, data: GameData, rng: Rng): void {
  const runtime = ensureRuntime(world);
  for (const nation of world.nations) {
    if (!runtime.generalPools.has(nation.id)) runtime.generalPools.set(nation.id, generateLeaderPool(nation.id));
  }
  const hasMovingArmy = world.armies.some((army) => army.moveTarget >= 0 || army.moveProgress > 0);
  const hasMovingFleet = world.fleets.some((fleet) => fleet.moveTarget >= 0 || fleet.moveProgress > 0 || fleet.embarkedArmy >= 0);
  const hasRebels = world.armies.some((army) => army.rebel);
  if (world.wars.length === 0 && runtime.mobilizedNations.size === 0 && runtime.colonialClaims.size === 0 && !hasMovingArmy && !hasMovingFleet) {
    if (!hasRebels) {
      if (world.day % 30 === 0) {
        const navalPow = navalBasePowerByOwner(world);
        for (const nation of world.nations) nation.colonialPoints = computeColonialPoints(world, nation.id, navalPow);
      }
      if (world.day % 7 === 0) updateRebellions(world, data);
      return;
    }
    if (world.day % 30 !== 0) return;
    const byProvince = armiesByProvince(world);
    for (const [provinceId, armies] of byProvince.entries()) resolveRebelCombat(world, rng, provinceId, armies);
    updateRebellions(world, data);
    cleanupDestroyedForces(world);
    capRebelArmies(world);
    {
      const navalPow = navalBasePowerByOwner(world);
      for (const nation of world.nations) nation.colonialPoints = computeColonialPoints(world, nation.id, navalPow);
    }
    return;
  }
  const armiesById = armiesByIdMap(world);
  const embarkedIds = embarkedArmyIdSet(world);
  updateArmyMovement(world, embarkedIds);
  updateFleetMovement(world, armiesById);
  // Rebuild location indexes after movement for battles / sieges / scores.
  const byProvince = armiesByProvince(world);
  const fleetsByProv = fleetsByProvince(world);
  const embarkedAfterMove = embarkedArmyIdSet(world);
  updateSupplyAndAttrition(world, embarkedAfterMove);
  resolveWarBattles(world, rng, byProvince, fleetsByProv, armiesById);
  // Battles can retreat armies — rebuild province index before sieges.
  const byProvinceAfterBattle = armiesByProvince(world);
  updateSieges(world, byProvinceAfterBattle);
  updateMobilizationUpkeep(world);
  updateColonialClaims(world);
  if ((world.rebellions?.length ?? 0) > 0 && world.day % 3 === 0) updateRebellions(world, data);
  cleanupDestroyedForces(world);
  capRebelArmies(world);
  updateWarScores(world, fleetsByProv);
  maybeAutoPeace(world);
  normalizeWarPostPeace(world);
}
