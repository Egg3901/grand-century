import type {
  CasusBelli,
  DiploRelation,
  DiploRelationKind,
  GameData,
  GreatPowerStanding,
  InfluenceTarget,
  NationId,
  WarGoalType,
  World,
} from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { gameDataForScenario } from '../../data/gameData';

const TRUCE_DURATION_DAYS = 365 * 5;
const ALLIANCE_DURATION_DAYS = 365 * 10;
const CB_DURATION_DAYS = 365 * 2;
const INFAMY_LIMIT = 18;
/** Diplomatic-point cost to declare a rivalry (player command path). */
const RIVALRY_DP_COST = 12;
/** Max concurrent rivalries a nation may hold via addRival. */
const RIVALRY_CAP = 4;

type RelationCommandKind = 'alliance' | 'guarantee' | 'rivalry' | 'neutral';

interface PowerScoreEntry {
  nation: NationId;
  industry: number;
  military: number;
  prestige: number;
  score: number;
}

interface InfluenceEntry {
  gp: NationId;
  target: NationId;
  points: number;
}

interface DiplomacyRuntime {
  pendingCbs: CasusBelli[];
  activeCbs: CasusBelli[];
  influence: InfluenceEntry[];
  influencePool: number[];
  diplomaticPoints: number[];
  powerScores: PowerScoreEntry[];
  coalitionAgainst: Map<NationId, NationId[]>;
}

export interface DiplomacyRuntimeSnapshot {
  pendingCbs: CasusBelli[];
  activeCbs: CasusBelli[];
  influence: InfluenceEntry[];
  influencePool: number[];
  diplomaticPoints: number[];
  powerScores: PowerScoreEntry[];
  coalitionAgainst: Array<{ nation: NationId; members: NationId[] }>;
}

interface WarGoalRule {
  score: number;
  infamyUse: number;
  infamyFabrication: number;
  fabricationDays: number;
  aggressive: boolean;
}

const WAR_GOAL_RULES: Record<WarGoalType, WarGoalRule> = {
  annex_state: { score: 38, infamyUse: 6.5, infamyFabrication: 1.4, fabricationDays: 140, aggressive: true },
  liberate_state: { score: 24, infamyUse: 2.2, infamyFabrication: 0.4, fabricationDays: 95, aggressive: false },
  humiliate: { score: 18, infamyUse: 1.4, infamyFabrication: 0.25, fabricationDays: 70, aggressive: false },
  add_to_sphere: { score: 22, infamyUse: 1.8, infamyFabrication: 0.35, fabricationDays: 85, aggressive: false },
  take_colony: { score: 28, infamyUse: 4.2, infamyFabrication: 0.9, fabricationDays: 120, aggressive: true },
  cut_down_to_size: { score: 30, infamyUse: 2.6, infamyFabrication: 0.5, fabricationDays: 110, aggressive: false },
};

const RUNTIME_BY_WORLD = new WeakMap<World, DiplomacyRuntime>();

/** Irredentist claims cost this fraction of a normal fabricated annex_state's
 * infamy — reclaiming your own historic homeland is far more diplomatically
 * defensible than naked conquest. */
const IRREDENTIST_INFAMY_DISCOUNT = 0.45;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function relationPair(a: NationId, b: NationId): { a: NationId; b: NationId } {
  return a < b ? { a, b } : { a: b, b: a };
}

function ensureRuntime(world: World): DiplomacyRuntime {
  const existing = RUNTIME_BY_WORLD.get(world);
  if (existing) return existing;
  const created: DiplomacyRuntime = {
    pendingCbs: [],
    activeCbs: [],
    influence: [],
    influencePool: Array.from({ length: world.nations.length }, () => 0),
    diplomaticPoints: Array.from({ length: world.nations.length }, () => 24),
    powerScores: [],
    coalitionAgainst: new Map<NationId, NationId[]>(),
  };
  RUNTIME_BY_WORLD.set(world, created);
  return created;
}

export function exportDiplomacyRuntime(world: World): DiplomacyRuntimeSnapshot {
  const runtime = ensureRuntime(world);
  return {
    pendingCbs: runtime.pendingCbs.map((cb) => ({ ...cb })),
    activeCbs: runtime.activeCbs.map((cb) => ({ ...cb })),
    influence: runtime.influence.map((entry) => ({ ...entry })),
    influencePool: runtime.influencePool.slice(),
    diplomaticPoints: runtime.diplomaticPoints.slice(),
    powerScores: runtime.powerScores.map((entry) => ({ ...entry })),
    coalitionAgainst: Array.from(runtime.coalitionAgainst.entries())
      .map(([nation, members]) => ({ nation, members: members.slice().sort((a, b) => a - b) }))
      .sort((a, b) => a.nation - b.nation),
  };
}

export function importDiplomacyRuntime(world: World, snapshot: DiplomacyRuntimeSnapshot | null | undefined): void {
  if (!snapshot) {
    ensureRuntime(world);
    return;
  }
  const runtime: DiplomacyRuntime = {
    pendingCbs: snapshot.pendingCbs.map((cb) => ({ ...cb })),
    activeCbs: snapshot.activeCbs.map((cb) => ({ ...cb })),
    influence: snapshot.influence.map((entry) => ({ ...entry })),
    influencePool: Array.from({ length: world.nations.length }, (_unused, index) => snapshot.influencePool[index] ?? 0),
    diplomaticPoints: Array.from({ length: world.nations.length }, (_unused, index) => snapshot.diplomaticPoints[index] ?? 24),
    powerScores: snapshot.powerScores.map((entry) => ({ ...entry })),
    coalitionAgainst: new Map(snapshot.coalitionAgainst.map((entry) => [entry.nation, entry.members.slice()])),
  };
  RUNTIME_BY_WORLD.set(world, runtime);
}

function relationIndex(world: World, a: NationId, b: NationId): number {
  const pair = relationPair(a, b);
  return world.relations.findIndex((relation) => relation.a === pair.a && relation.b === pair.b);
}

export function getOrCreateRelation(world: World, a: NationId, b: NationId): DiploRelation {
  const pair = relationPair(a, b);
  const index = relationIndex(world, pair.a, pair.b);
  if (index >= 0) return world.relations[index];
  const created: DiploRelation = {
    a: pair.a,
    b: pair.b,
    kind: 'neutral',
    opinion: 0,
    expiresDay: -1,
  };
  world.relations.push(created);
  return created;
}

function sortedNationIds(world: World): NationId[] {
  return world.nations.map((nation) => nation.id).sort((a, b) => a - b);
}

function ensureAllPairRelations(world: World): void {
  const ids = sortedNationIds(world);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      getOrCreateRelation(world, ids[i], ids[j]);
    }
  }
}

export function relationForNations(world: World, a: NationId, b: NationId): DiploRelation | null {
  const pair = relationPair(a, b);
  return world.relations.find((relation) => relation.a === pair.a && relation.b === pair.b) ?? null;
}

export function relationKindBetween(world: World, a: NationId, b: NationId): DiploRelationKind {
  return relationForNations(world, a, b)?.kind ?? 'neutral';
}

export function opinionBetween(world: World, a: NationId, b: NationId): number {
  return relationForNations(world, a, b)?.opinion ?? 0;
}

export function hasActiveTruce(world: World, a: NationId, b: NationId): boolean {
  const relation = relationForNations(world, a, b);
  if (!relation || relation.kind !== 'truce') return false;
  if (relation.expiresDay < 0) return true;
  return world.day < relation.expiresDay;
}

function setRelation(
  world: World,
  a: NationId,
  b: NationId,
  kind: RelationCommandKind,
  opinion: number,
  expiresDay = -1,
): DiploRelation {
  const relation = getOrCreateRelation(world, a, b);
  relation.kind = kind;
  relation.opinion = clamp(opinion, -200, 200);
  relation.expiresDay = expiresDay;
  return relation;
}

export function setTruce(world: World, a: NationId, b: NationId, durationDays = TRUCE_DURATION_DAYS): void {
  const relation = getOrCreateRelation(world, a, b);
  relation.kind = 'truce';
  relation.opinion = Math.min(relation.opinion, -35);
  relation.expiresDay = world.day + durationDays;
}

function cleanExpiredRelations(world: World): void {
  for (const relation of world.relations) {
    if (relation.expiresDay < 0) continue;
    if (world.day < relation.expiresDay) continue;
    relation.expiresDay = -1;
    relation.kind = 'neutral';
  }
}

function militaryShipWeight(type: string): number {
  switch (type) {
    case 'transport': return 0.6;
    case 'frigate': return 1;
    case 'manofwar': return 1.45;
    case 'ironclad': return 2.1;
    default: return 1;
  }
}

function computePowerScores(world: World): PowerScoreEntry[] {
  const industry = Array.from({ length: world.nations.length }, () => 0);
  const military = Array.from({ length: world.nations.length }, () => 0);

  for (const state of world.states) {
    const owner = state.owner;
    if (!world.nations[owner]) continue;
    for (const factory of state.factories) {
      industry[owner] += factory.level * 11 + factory.lastOutput * 1.2 + factory.employed / 2000;
    }
  }

  for (const army of world.armies) {
    if (army.rebel || !world.nations[army.owner]) continue;
    for (const regiment of army.regiments) {
      const strength = clamp(regiment.strength / 1000, 0, 1.6);
      military[army.owner] += 1.9 * strength;
    }
  }
  for (const fleet of world.fleets) {
    if (!world.nations[fleet.owner]) continue;
    for (const ship of fleet.ships) military[fleet.owner] += militaryShipWeight(ship.type);
  }
  for (const nation of world.nations) military[nation.id] += nation.mobilizationCapacity * 0.12;

  return world.nations
    .map((nation) => ({
      nation: nation.id,
      industry: Number(industry[nation.id].toFixed(2)),
      military: Number(military[nation.id].toFixed(2)),
      prestige: Number(nation.prestige.toFixed(2)),
      // U3: sqrt on industry — raw factory totals grew unboundedly and
      // drowned military (100:1) and prestige, freezing the GP table for
      // eighty straight years in century probes. Diminishing industrial
      // returns let armament and prestige actually move rankings.
      score: Number((Math.sqrt(Math.max(0, industry[nation.id])) * 9 + military[nation.id] * 2.5 + nation.prestige).toFixed(2)),
    }))
    .sort((a, b) => (b.score - a.score) || (a.nation - b.nation));
}

export function refreshGreatPowerRanking(world: World): void {
  const runtime = ensureRuntime(world);
  const scores = computePowerScores(world);
  runtime.powerScores = scores;

  const gpIds = new Set<NationId>();
  const top = Math.min(8, scores.length);
  for (let i = 0; i < scores.length; i++) {
    const entry = scores[i];
    const nation = world.nations[entry.nation];
    if (!nation) continue;
    nation.gpRank = i < top ? i + 1 : 0;
    if (nation.gpRank > 0) gpIds.add(nation.id);
  }

  for (const nation of world.nations) {
    if (nation.gpRank === 0 && nation.sphereMembers.length > 0) nation.sphereMembers = [];
    if (nation.spheredBy >= 0 && !gpIds.has(nation.spheredBy)) nation.spheredBy = -1;
    nation.sphereMembers = nation.sphereMembers.filter((member) => world.nations[member] && world.nations[member].gpRank === 0);
  }
}

function neighborsByNation(world: World): Set<NationId>[] {
  const neighbors = Array.from({ length: world.nations.length }, () => new Set<NationId>());
  for (const province of world.provinces) {
    const owner = province.owner;
    if (!world.nations[owner]) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = world.provinces[neighborId];
      if (!neighbor || neighbor.owner === owner) continue;
      neighbors[owner].add(neighbor.owner);
    }
  }
  return neighbors;
}

function warEnemies(world: World): Set<NationId>[] {
  const enemies = Array.from({ length: world.nations.length }, () => new Set<NationId>());
  for (const war of world.wars) {
    for (const attacker of war.attackers) {
      for (const defender of war.defenders) {
        enemies[attacker].add(defender);
        enemies[defender].add(attacker);
      }
    }
  }
  return enemies;
}

function sharedEnemyCount(a: Set<NationId>, b: Set<NationId>): number {
  let total = 0;
  for (const id of a) if (b.has(id)) total++;
  return total;
}

function contestedTargets(world: World): Map<NationId, NationId[]> {
  const runtime = ensureRuntime(world);
  const entries = new Map<NationId, NationId[]>();
  for (const influence of runtime.influence) {
    if (influence.points < 25) continue;
    const existing = entries.get(influence.target) ?? [];
    if (!existing.includes(influence.gp)) existing.push(influence.gp);
    entries.set(influence.target, existing);
  }
  for (const nation of world.nations) {
    if (nation.spheredBy < 0) continue;
    const existing = entries.get(nation.id) ?? [];
    if (!existing.includes(nation.spheredBy)) existing.push(nation.spheredBy);
    entries.set(nation.id, existing);
  }
  return entries;
}

function driftRelationOpinions(world: World): void {
  const neighbors = neighborsByNation(world);
  const enemies = warEnemies(world);
  const contested = contestedTargets(world);

  for (const relation of world.relations) {
    const a = relation.a;
    const b = relation.b;
    let drift = -relation.opinion * 0.035;
    if (relation.kind === 'alliance') drift += 2.1;
    if (relation.kind === 'guarantee') drift += 0.95;
    if (relation.kind === 'rivalry') drift -= 2;
    if (relation.kind === 'truce') drift -= 0.75;

    if (neighbors[a]?.has(b)) drift += relation.kind === 'rivalry' ? -0.7 : 0.35;
    const sharedEnemies = sharedEnemyCount(enemies[a], enemies[b]);
    drift += Math.min(2, sharedEnemies) * 0.85;

    const nationA = world.nations[a];
    const nationB = world.nations[b];
    if (nationA?.spheredBy === b || nationB?.spheredBy === a) drift += 1.2;
    if (nationA?.gpRank > 0 && nationB?.gpRank > 0) {
      for (const [target, claimants] of contested.entries()) {
        if (!world.nations[target] || world.nations[target].gpRank > 0) continue;
        if (claimants.includes(a) && claimants.includes(b)) {
          drift -= 1.05;
          break;
        }
      }
    }

    relation.opinion = clamp(Number((relation.opinion + drift).toFixed(2)), -200, 200);
  }
}

function getInfluenceEntry(runtime: DiplomacyRuntime, gp: NationId, target: NationId): InfluenceEntry {
  const existing = runtime.influence.find((entry) => entry.gp === gp && entry.target === target);
  if (existing) return existing;
  const created: InfluenceEntry = { gp, target, points: 0 };
  runtime.influence.push(created);
  return created;
}

function applySphere(world: World, gp: NationId, target: NationId): void {
  const gpNation = world.nations[gp];
  const targetNation = world.nations[target];
  if (!gpNation || !targetNation || gpNation.gpRank <= 0 || targetNation.gpRank > 0) return;
  const old = targetNation.spheredBy;
  if (old >= 0 && world.nations[old]) {
    world.nations[old].sphereMembers = world.nations[old].sphereMembers.filter((member) => member !== target);
  }
  targetNation.spheredBy = gp;
  if (!gpNation.sphereMembers.includes(target)) gpNation.sphereMembers.push(target);
  const relation = getOrCreateRelation(world, gp, target);
  relation.opinion = clamp(Math.max(relation.opinion, 75), -200, 200);
  if (relation.kind === 'rivalry') relation.kind = 'neutral';
  gpNation.prestige += 0.5;
  targetNation.prestige = Math.max(0, targetNation.prestige - 0.25);
}

/**
 * Sphere defection (#34): tear up client status. The probe showed unifiers
 * finishing their core set and then rotting inside a patron's sphere forever —
 * Tuscany at 6/6 Italian cores, Prussia at 4/4 NGF cores, both dead-ended on
 * the `independent` requirement with no mechanism anywhere to leave a sphere.
 * Defection resets the patron's accumulated influence to zero (they must
 * rebuild the grip from scratch) and sours the relationship; the patron keeps
 * a truce-free hand to punish the upstart. Risorgimento, not paperwork.
 */
export function defectFromSphere(world: World, nationId: NationId): { ok: boolean; reason: string } {
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Nation not found.' };
  const master = nation.spheredBy;
  if (master < 0 || !world.nations[master]) return { ok: false, reason: 'Not inside any sphere.' };
  const runtime = ensureRuntime(world);
  const masterNation = world.nations[master];
  masterNation.sphereMembers = masterNation.sphereMembers.filter((member) => member !== nationId);
  nation.spheredBy = -1;
  getInfluenceEntry(runtime, master, nationId).points = 0;
  const relation = getOrCreateRelation(world, master, nationId);
  relation.opinion = clamp(relation.opinion - 80, -200, 200);
  masterNation.prestige = Math.max(0, masterNation.prestige - 1.5);
  return { ok: true, reason: `${nation.name} breaks from the ${masterNation.name} sphere.` };
}

function chooseInfluenceTarget(world: World, gp: NationId, neighbors: Set<NationId>[]): NationId | null {
  const gpNation = world.nations[gp];
  if (!gpNation || gpNation.gpRank <= 0) return null;
  const candidates = world.nations
    .filter((nation) => nation.id !== gp && nation.gpRank === 0)
    .map((nation) => {
      const relation = relationForNations(world, gp, nation.id);
      const relationBias = relation ? relation.opinion * 0.12 : 0;
      const near = neighbors[gp].has(nation.id) ? 15 : 0;
      const alreadySphered = nation.spheredBy === gp ? 30 : 0;
      const rivalSphere = nation.spheredBy >= 0 && nation.spheredBy !== gp ? -20 : 0;
      const civBias = nation.isCivilized ? 6 : 3;
      return {
        id: nation.id,
        score: relationBias + near + alreadySphered + rivalSphere + civBias - nation.infamy * 0.2,
      };
    })
    .sort((a, b) => (b.score - a.score) || (a.id - b.id));
  return candidates[0]?.id ?? null;
}

function accrueAndSpendInfluence(world: World): void {
  const runtime = ensureRuntime(world);
  const neighbors = neighborsByNation(world);
  for (const nation of world.nations) {
    if (nation.gpRank <= 0) continue;
    const rankGain = Math.max(0.6, 3.6 - nation.gpRank * 0.28);
    runtime.influencePool[nation.id] = clamp(runtime.influencePool[nation.id] + rankGain, 0, 200);
    let actions = 0;
    while (runtime.influencePool[nation.id] >= 1 && actions < 3) {
      const target = chooseInfluenceTarget(world, nation.id, neighbors);
      if (target === null) break;
      runtime.influencePool[nation.id] -= 1;
      const entry = getInfluenceEntry(runtime, nation.id, target);
      entry.points = clamp(entry.points + (7 + Math.max(0, 8 - nation.gpRank)), 0, 100);
      for (const rival of runtime.influence) {
        if (rival.target !== target || rival.gp === nation.id) continue;
        rival.points = clamp(rival.points - 4, 0, 100);
      }
      if (entry.points >= 100) applySphere(world, nation.id, target);
      actions++;
    }
  }
}

function updateDiplomaticPointAccrual(world: World): void {
  const runtime = ensureRuntime(world);
  for (const nation of world.nations) {
    const gain = 1.6 + (nation.gpRank > 0 ? 0.9 : 0) + clamp(nation.prestige, 0, 100) * 0.01;
    runtime.diplomaticPoints[nation.id] = clamp(runtime.diplomaticPoints[nation.id] + gain, 0, 120);
  }
}

function updateCbQueues(world: World): void {
  const runtime = ensureRuntime(world);
  const stillPending: CasusBelli[] = [];
  for (const cb of runtime.pendingCbs) {
    if (world.day >= cb.readyDay) {
      cb.discovered = true;
      runtime.activeCbs.push(cb);
    } else {
      stillPending.push(cb);
    }
  }
  runtime.pendingCbs = stillPending;
  runtime.activeCbs = runtime.activeCbs.filter((cb) => world.day <= cb.expiresDay);
}

function updateInfamyAndCoalitions(world: World): void {
  const runtime = ensureRuntime(world);
  runtime.coalitionAgainst.clear();
  for (const nation of world.nations) nation.infamy = Math.max(0, Number((nation.infamy - 0.14).toFixed(2)));

  for (const offender of world.nations) {
    if (offender.infamy < INFAMY_LIMIT) continue;
    const coalition: NationId[] = [];
    for (const candidate of world.nations) {
      if (candidate.id === offender.id) continue;
      if (candidate.gpRank > 0 || opinionBetween(world, candidate.id, offender.id) < -30) {
        coalition.push(candidate.id);
        ensureContainmentCb(world, candidate.id, offender.id);
      }
    }
    runtime.coalitionAgainst.set(offender.id, coalition.sort((a, b) => a - b));
  }
}

function ensureContainmentCb(world: World, holder: NationId, target: NationId): void {
  const runtime = ensureRuntime(world);
  const existing = runtime.activeCbs.find((cb) => (
    cb.holder === holder
    && cb.target === target
    && cb.goal === 'cut_down_to_size'
    && world.day <= cb.expiresDay
  ));
  if (existing) return;
  const rule = WAR_GOAL_RULES.cut_down_to_size;
  runtime.activeCbs.push({
    holder,
    target,
    goal: 'cut_down_to_size',
    stateId: -1,
    scoreCost: rule.score,
    infamyCost: rule.infamyUse,
    readyDay: world.day,
    expiresDay: world.day + 365 * 2,
    discovered: true,
  });
}

/**
 * 1.0-U1: content-granted free CB (from a decision or event effect) — active
 * immediately, no fabrication time or fabrication infamy. Stateless goals
 * only (humiliate / cut_down_to_size / add_to_sphere).
 */
export function grantContentCb(
  world: World,
  holder: NationId,
  target: NationId,
  goal: WarGoalType,
  monthsValid = 36,
): void {
  const runtime = ensureRuntime(world);
  const expiresDay = world.day + Math.max(30, Math.round(monthsValid * 30));
  const existing = runtime.activeCbs.find((cb) => (
    cb.holder === holder && cb.target === target && cb.goal === goal && world.day <= cb.expiresDay
  ));
  if (existing) {
    existing.expiresDay = Math.max(existing.expiresDay, expiresDay);
    return;
  }
  const rule = WAR_GOAL_RULES[goal];
  runtime.activeCbs.push({
    holder,
    target,
    goal,
    stateId: -1,
    scoreCost: rule.score,
    infamyCost: rule.infamyUse,
    readyDay: world.day,
    expiresDay,
    discovered: true,
  });
}

export function getWarGoalRule(goal: WarGoalType): WarGoalRule {
  return WAR_GOAL_RULES[goal];
}

/** Diplomatic-point cost to begin fabricating a CB for this goal. */
export function getFabricateCbCost(goal: WarGoalType): number {
  return Number((10 + WAR_GOAL_RULES[goal].score * 0.35).toFixed(2));
}

export function getDiplomaticPoints(world: World, nationId: NationId): number {
  return Number((ensureRuntime(world).diplomaticPoints[nationId] ?? 0).toFixed(2));
}

export function getInfamyLimit(): number {
  return INFAMY_LIMIT;
}

export function primeDiplomacy(world: World, _data: GameData): void {
  ensureRuntime(world);
  ensureAllPairRelations(world);
  refreshGreatPowerRanking(world);
}

export function runDiplomacyMonthly(world: World, _data: GameData, _rng: Rng): void {
  ensureRuntime(world);
  ensureAllPairRelations(world);
  cleanExpiredRelations(world);
  refreshGreatPowerRanking(world);
  driftRelationOpinions(world);
  accrueAndSpendInfluence(world);
  updateDiplomaticPointAccrual(world);
  updateCbQueues(world);
  updateInfamyAndCoalitions(world);

  for (const nation of world.nations) {
    if (nation.gpRank > 0 && nation.sphereMembers.length > 0) {
      nation.treasury += nation.sphereMembers.length * 6;
      nation.prestige += nation.sphereMembers.length * 0.08;
    }
    if (nation.spheredBy >= 0) nation.prestige = Math.max(0, nation.prestige - 0.05);
    // #35: prestige is a flow, not a stock. Sphere/influence prestige only
    // accrues to sitting GPs, so without decay the top-8 becomes self-sealing:
    // a century probe showed the Ottomans matching Spain on industry+military
    // yet locked out at prestige 6 vs 784. Proportional fade turns old glory
    // into a half-life (~11 years at 0.5%/month) and lets armament and
    // industry actually move the table.
    nation.prestige = Math.max(0, nation.prestige * (1 - BALANCE.diplomacy.prestigeMonthlyDecayRate));
  }
}

export function setRelationKindByCommand(
  world: World,
  a: NationId,
  b: NationId,
  kind: RelationCommandKind,
): DiploRelation {
  const baseOpinion = kind === 'alliance'
    ? Math.max(65, opinionBetween(world, a, b))
    : kind === 'guarantee'
      ? Math.max(35, opinionBetween(world, a, b))
      : kind === 'rivalry'
        ? Math.min(-40, opinionBetween(world, a, b) - 20)
        : opinionBetween(world, a, b);
  const expiry = kind === 'alliance' ? world.day + ALLIANCE_DURATION_DAYS : -1;
  return setRelation(world, a, b, kind, baseOpinion, expiry);
}

function countRivalries(world: World, nationId: NationId): number {
  return world.relations.filter((relation) => (
    relation.kind === 'rivalry' && (relation.a === nationId || relation.b === nationId)
  )).length;
}

export function getRivalryDpCost(): number {
  return RIVALRY_DP_COST;
}

export function getRivalryCap(): number {
  return RIVALRY_CAP;
}

/**
 * Player-facing rivalry with a DP cost and concurrent cap so free rivalry
 * spam cannot manufacture Concert tension without tradeoff.
 */
export function tryAddRivalry(world: World, a: NationId, b: NationId): { ok: boolean; reason: string } {
  if (!world.nations[a] || !world.nations[b] || a === b) {
    return { ok: false, reason: 'Invalid rivalry target.' };
  }
  const existing = relationForNations(world, a, b);
  if (existing?.kind === 'rivalry') return { ok: false, reason: 'Already rivals.' };
  if (countRivalries(world, a) >= RIVALRY_CAP) {
    return { ok: false, reason: `Rivalry cap reached (${RIVALRY_CAP}). Cancel one first.` };
  }
  const runtime = ensureRuntime(world);
  if (runtime.diplomaticPoints[a] < RIVALRY_DP_COST) {
    return { ok: false, reason: `Need ${RIVALRY_DP_COST} diplomatic points to declare a rivalry.` };
  }
  runtime.diplomaticPoints[a] -= RIVALRY_DP_COST;
  setRelationKindByCommand(world, a, b, 'rivalry');
  return { ok: true, reason: `${world.nations[b].name} is now marked as a rival (−${RIVALRY_DP_COST} DP).` };
}

export function evaluateAllianceAcceptance(world: World, proposer: NationId, target: NationId): { accepted: boolean; score: number } {
  const relation = getOrCreateRelation(world, proposer, target);
  if (relation.kind === 'rivalry' || hasActiveTruce(world, proposer, target)) return { accepted: false, score: -999 };
  const runtime = ensureRuntime(world);
  if (runtime.powerScores.length === 0) refreshGreatPowerRanking(world);
  const proposerScore = runtime.powerScores.find((entry) => entry.nation === proposer)?.score ?? 1;
  const targetScore = runtime.powerScores.find((entry) => entry.nation === target)?.score ?? 1;
  const balance = 25 - Math.abs(proposerScore - targetScore) / Math.max(20, targetScore) * 26;
  const rivals = world.relations.filter((entry) => (
    entry.kind === 'rivalry' && (entry.a === target || entry.b === target)
  )).length;
  const wars = world.wars.filter((war) => war.attackers.includes(target) || war.defenders.includes(target)).length;
  const threat = rivals * 6 + wars * 8;
  const infamyPenalty = Math.max(0, world.nations[proposer]?.infamy - INFAMY_LIMIT) * 2;
  const score = relation.opinion + threat + balance - infamyPenalty;
  return { accepted: score >= 70, score };
}

function warSideSet(war: { attackers: NationId[]; defenders: NationId[] }, nation: NationId): Set<NationId> {
  if (war.attackers.includes(nation)) return new Set(war.attackers);
  if (war.defenders.includes(nation)) return new Set(war.defenders);
  return new Set<NationId>();
}

export function collectAllianceBloc(
  world: World,
  leader: NationId,
  against: NationId,
  opts: { includeGuarantees?: boolean } = {},
): NationId[] {
  const includeGuarantees = opts.includeGuarantees === true;
  const result = new Set<NationId>([leader]);
  const queue: NationId[] = [leader];
  while (queue.length > 0) {
    const current = queue.shift() as NationId;
    const options = world.relations
      .filter((relation) => {
        const active = relation.expiresDay < 0 || relation.expiresDay > world.day;
        if (!active) return false;
        if (relation.kind === 'alliance') return true;
        // Guarantees are defensive-only: pull guarantors into the war leader's
        // bloc when collecting defenders, never into an offensive march.
        if (includeGuarantees && relation.kind === 'guarantee' && current === leader) return true;
        return false;
      })
      .map((relation) => relation.a === current ? relation.b : relation.b === current ? relation.a : -1)
      .filter((nationId) => nationId >= 0)
      .sort((a, b) => a - b);
    for (const nationId of options) {
      if (nationId === against || result.has(nationId)) continue;
      if (hasActiveTruce(world, nationId, against)) continue;
      const withLeader = relationForNations(world, nationId, leader);
      if (!withLeader) continue;
      const isAlly = withLeader.kind === 'alliance' && withLeader.opinion >= 35;
      const isGuarantor = includeGuarantees && withLeader.kind === 'guarantee';
      if (!isAlly && !isGuarantor) continue;
      const hostileWar = world.wars.some((war) => {
        const side = warSideSet(war, nationId);
        return side.size > 0 && !side.has(leader);
      });
      if (hostileWar) continue;
      result.add(nationId);
      // Only BFS through alliance edges; guarantees do not chain.
      if (isAlly) queue.push(nationId);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export function beginCbFabrication(
  world: World,
  holder: NationId,
  target: NationId,
  goal: WarGoalType,
  stateId: number,
): { ok: boolean; reason: string } {
  const runtime = ensureRuntime(world);
  const rule = WAR_GOAL_RULES[goal];
  const cost = 10 + rule.score * 0.35;
  if (runtime.diplomaticPoints[holder] < cost) {
    return { ok: false, reason: `Need ${cost.toFixed(1)} diplomatic points.` };
  }

  runtime.diplomaticPoints[holder] -= cost;
  runtime.pendingCbs = runtime.pendingCbs.filter((cb) => !(cb.holder === holder && cb.target === target && cb.goal === goal && cb.stateId === stateId));
  runtime.activeCbs = runtime.activeCbs.filter((cb) => !(cb.holder === holder && cb.target === target && cb.goal === goal && cb.stateId === stateId));
  runtime.pendingCbs.push({
    holder,
    target,
    goal,
    stateId,
    scoreCost: rule.score,
    infamyCost: rule.infamyUse,
    readyDay: world.day + rule.fabricationDays,
    expiresDay: world.day + rule.fabricationDays + CB_DURATION_DAYS,
    discovered: false,
  });
  if (rule.aggressive) {
    world.nations[holder].infamy = clamp(
      Number((world.nations[holder].infamy + rule.infamyFabrication).toFixed(2)),
      0,
      100,
    );
  }
  return { ok: true, reason: `CB fabrication in progress (${rule.fabricationDays} days).` };
}

/**
 * Cultural cores: nation.coreStateIds (recorded at bootstrap — the states a
 * nation started the campaign owning) is its historic heartland. If a core
 * state ends up owned by someone else, the nation gets a standing, always-
 * available, cheap claim to reclaim it — no diplomatic points, no
 * fabrication wait, and far lower infamy than a fabricated annex_state CB.
 * Computed fresh every call (not stored in runtime.activeCbs) since this is
 * a standing historical fact, not a time-limited fabricated pretext: it
 * exists for exactly as long as the state remains foreign-held and needs no
 * expiry bookkeeping — reclaiming it (or losing the core claim itself, e.g.
 * via a formable absorbing the state) simply makes it stop appearing.
 */
function irredentistClaim(world: World, holder: NationId, target: NationId, stateId: number): CasusBelli | null {
  if (holder === target) return null;
  const nation = world.nations[holder];
  const state = world.states[stateId];
  if (!nation || !state || state.owner !== target) return null;
  if (!(nation.coreStateIds ?? []).includes(stateId)) return null;
  const rule = WAR_GOAL_RULES.annex_state;
  return {
    holder,
    target,
    goal: 'annex_state',
    stateId,
    scoreCost: rule.score,
    infamyCost: Number((rule.infamyUse * IRREDENTIST_INFAMY_DISCOUNT).toFixed(2)),
    readyDay: world.day,
    expiresDay: world.day + 3650,
    discovered: true,
    origin: 'core_claim',
  };
}

function irredentistClaimsForNation(world: World, holder: NationId): CasusBelli[] {
  const nation = world.nations[holder];
  if (!nation) return [];
  const claims: CasusBelli[] = [];
  for (const stateId of nation.coreStateIds ?? []) {
    const state = world.states[stateId];
    if (!state || state.owner === holder) continue;
    const claim = irredentistClaim(world, holder, state.owner, stateId);
    if (claim) claims.push(claim);
  }
  return claims;
}

/**
 * Unification claims (#34): a formable candidate holds a standing annex_state
 * claim on every core state of that formable it does not yet control — the
 * Risorgimento/kleindeutsch CB. Before this, unification had no war path at
 * all: the AI could only sphere minors (GPs only), so on seeds where the
 * stepping-stone unifier died early or a single core sat in the wrong hands,
 * no nation ever formed in a century. Discounted infamy like irredentism, but
 * less so — the age forgives national unification, not completely.
 */
const UNIFICATION_INFAMY_DISCOUNT = 0.6;

function unificationClaim(world: World, holder: NationId, target: NationId, stateId: number): CasusBelli | null {
  if (holder === target) return null;
  const nation = world.nations[holder];
  const state = world.states[stateId];
  if (!nation || !state || state.owner !== target) return null;
  const isUnificationCore = (gameDataForScenario(world.scenarioId).formables ?? []).some((formable) => (
    formable.candidateTags.includes(nation.tag)
    && formable.resultTag !== nation.tag
    && formable.coreStateIds.includes(stateId)
  ));
  if (!isUnificationCore) return null;
  const rule = WAR_GOAL_RULES.annex_state;
  return {
    holder,
    target,
    goal: 'annex_state',
    stateId,
    scoreCost: rule.score,
    infamyCost: Number((rule.infamyUse * UNIFICATION_INFAMY_DISCOUNT).toFixed(2)),
    readyDay: world.day,
    expiresDay: world.day + 3650,
    discovered: true,
    origin: 'unification',
  };
}

function unificationClaimsForNation(world: World, holder: NationId): CasusBelli[] {
  const nation = world.nations[holder];
  if (!nation) return [];
  const claims: CasusBelli[] = [];
  const seen = new Set<number>();
  for (const formable of gameDataForScenario(world.scenarioId).formables ?? []) {
    if (!formable.candidateTags.includes(nation.tag) || formable.resultTag === nation.tag) continue;
    for (const stateId of formable.coreStateIds) {
      if (seen.has(stateId)) continue;
      seen.add(stateId);
      const state = world.states[stateId];
      if (!state || state.owner === holder) continue;
      const claim = unificationClaim(world, holder, state.owner, stateId);
      if (claim) claims.push(claim);
    }
  }
  return claims;
}

export function consumeValidCb(
  world: World,
  holder: NationId,
  target: NationId,
  goal: WarGoalType,
  stateId: number,
): CasusBelli | null {
  const runtime = ensureRuntime(world);
  const index = runtime.activeCbs.findIndex((cb) => (
    cb.holder === holder
    && cb.target === target
    && cb.goal === goal
    && (cb.stateId === stateId || cb.stateId === -1)
    && world.day >= cb.readyDay
    && world.day <= cb.expiresDay
  ));
  if (index < 0) {
    if (goal !== 'annex_state') return null;
    return irredentistClaim(world, holder, target, stateId)
      ?? unificationClaim(world, holder, target, stateId);
  }
  const [cb] = runtime.activeCbs.splice(index, 1);
  return cb;
}

export function getCbsForNation(world: World, holder: NationId): CasusBelli[] {
  const runtime = ensureRuntime(world);
  const active = runtime.activeCbs
    .filter((cb) => cb.holder === holder && world.day <= cb.expiresDay)
    .map((cb) => ({ ...cb }));
  const activeKeys = new Set(active.map((cb) => `${cb.target}:${cb.goal}:${cb.stateId}`));
  const irredentist = irredentistClaimsForNation(world, holder)
    .filter((cb) => !activeKeys.has(`${cb.target}:${cb.goal}:${cb.stateId}`));
  for (const cb of irredentist) activeKeys.add(`${cb.target}:${cb.goal}:${cb.stateId}`);
  const unification = unificationClaimsForNation(world, holder)
    .filter((cb) => !activeKeys.has(`${cb.target}:${cb.goal}:${cb.stateId}`));
  return [...active, ...irredentist, ...unification]
    .sort((a, b) => (a.target - b.target) || (a.goal.localeCompare(b.goal)));
}

export function getPendingCbsForNation(world: World, holder: NationId): CasusBelli[] {
  const runtime = ensureRuntime(world);
  return runtime.pendingCbs
    .filter((cb) => cb.holder === holder)
    .map((cb) => ({ ...cb }))
    .sort((a, b) => (a.readyDay - b.readyDay) || (a.target - b.target));
}

export function getInfluencePool(world: World, nationId: NationId): number {
  return Number((ensureRuntime(world).influencePool[nationId] ?? 0).toFixed(2));
}

export function spendInfluence(world: World, gp: NationId, target: NationId, spend = 1): { ok: boolean; reason: string } {
  const runtime = ensureRuntime(world);
  const gpNation = world.nations[gp];
  const targetNation = world.nations[target];
  if (!gpNation || gpNation.gpRank <= 0) return { ok: false, reason: 'Only great powers can influence.' };
  if (!targetNation || targetNation.gpRank > 0 || target === gp) return { ok: false, reason: 'Target must be a non-GP nation.' };
  const amount = clamp(Math.floor(spend), 1, 20);
  if (runtime.influencePool[gp] < amount) return { ok: false, reason: 'Not enough influence points.' };
  runtime.influencePool[gp] -= amount;
  const entry = getInfluenceEntry(runtime, gp, target);
  entry.points = clamp(entry.points + amount * 8, 0, 100);
  for (const rival of runtime.influence) {
    if (rival.target !== target || rival.gp === gp) continue;
    rival.points = clamp(rival.points - amount * 3, 0, 100);
  }
  if (entry.points >= 100) applySphere(world, gp, target);
  return { ok: true, reason: `Influence increased to ${entry.points.toFixed(1)}.` };
}

export function getInfluenceTargetsForNation(world: World, nationId: NationId): InfluenceTarget[] {
  const runtime = ensureRuntime(world);
  return runtime.influence
    .filter((entry) => entry.gp === nationId && entry.points > 0)
    .map((entry) => {
      const rivalPressure = runtime.influence
        .filter((rival) => rival.target === entry.target && rival.gp !== nationId && rival.points > 0.001)
        .reduce((max, rival) => Math.max(max, rival.points), 0);
      return {
        target: entry.target,
        points: Number(entry.points.toFixed(1)),
        rivalPressure: Number(rivalPressure.toFixed(1)),
      };
    })
    .sort((a, b) => (b.points - a.points) || (a.target - b.target));
}

export function getInfluencePressureForTarget(world: World, target: NationId): Array<{ gp: NationId; points: number }> {
  const runtime = ensureRuntime(world);
  return runtime.influence
    .filter((entry) => entry.target === target && entry.points > 0.001)
    .map((entry) => ({ gp: entry.gp, points: Number(entry.points.toFixed(2)) }))
    .sort((a, b) => (b.points - a.points) || (a.gp - b.gp));
}

export function getNationPowerBreakdown(world: World, nationId: NationId): { industry: number; military: number; score: number } {
  const runtime = ensureRuntime(world);
  if (runtime.powerScores.length === 0) refreshGreatPowerRanking(world);
  const entry = runtime.powerScores.find((candidate) => candidate.nation === nationId);
  if (!entry) return { industry: 0, military: 0, score: 0 };
  return { industry: entry.industry, military: entry.military, score: entry.score };
}

export function getGreatPowerStandings(world: World): GreatPowerStanding[] {
  const runtime = ensureRuntime(world);
  if (runtime.powerScores.length === 0) refreshGreatPowerRanking(world);
  return runtime.powerScores
    .filter((entry) => world.nations[entry.nation]?.gpRank > 0)
    .slice(0, 8)
    .map((entry) => ({
      nation: entry.nation,
      rank: world.nations[entry.nation].gpRank,
      industry: entry.industry,
      military: entry.military,
      prestige: entry.prestige,
      score: entry.score,
      sphereMembers: world.nations[entry.nation].sphereMembers.slice().sort((a, b) => a - b),
      influencePool: Number((runtime.influencePool[entry.nation] ?? 0).toFixed(2)),
    }))
    .sort((a, b) => a.rank - b.rank);
}

/** Score of the #8 power (the last GP seat). Used by the formable power gate. */
export function getEighthPowerScore(world: World): number {
  const runtime = ensureRuntime(world);
  if (runtime.powerScores.length === 0) refreshGreatPowerRanking(world);
  if (runtime.powerScores.length < 8) return 0;
  return runtime.powerScores[7].score;
}

/** Score of the #9 power (first non-GP). Gap to this is the GP cliff chase. */
export function getNinthPowerScore(world: World): number {
  const runtime = ensureRuntime(world);
  if (runtime.powerScores.length === 0) refreshGreatPowerRanking(world);
  if (runtime.powerScores.length < 9) return 0;
  return runtime.powerScores[8].score;
}

export function getWarGoalInfamyUse(): Record<WarGoalType, number> {
  return {
    annex_state: WAR_GOAL_RULES.annex_state.infamyUse,
    liberate_state: WAR_GOAL_RULES.liberate_state.infamyUse,
    humiliate: WAR_GOAL_RULES.humiliate.infamyUse,
    add_to_sphere: WAR_GOAL_RULES.add_to_sphere.infamyUse,
    take_colony: WAR_GOAL_RULES.take_colony.infamyUse,
    cut_down_to_size: WAR_GOAL_RULES.cut_down_to_size.infamyUse,
  };
}

export function getCoalitionAgainst(world: World, nationId: NationId): NationId[] {
  return (ensureRuntime(world).coalitionAgainst.get(nationId) ?? []).slice();
}

export function getNationRelations(world: World, nationId: NationId): { nation: NationId; kind: DiploRelationKind; opinion: number; expiresDay: number }[] {
  return world.relations
    .filter((relation) => relation.a === nationId || relation.b === nationId)
    .map((relation) => ({
      nation: relation.a === nationId ? relation.b : relation.a,
      kind: relation.kind,
      opinion: relation.opinion,
      expiresDay: relation.expiresDay,
    }))
    .sort((a, b) => a.nation - b.nation);
}
