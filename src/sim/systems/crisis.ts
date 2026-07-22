/**
 * 0.7.0 Concert of Europe — world tension, flashpoint crises, congresses,
 * and crisis wars.
 *
 * The world accumulates TENSION (0-100) from observable geopolitical causes
 * (great-power wars, infamous powers, GP rivalries, contested spheres). High
 * tension breeds a single active CRISIS at a concrete flashpoint: two GP leads
 * press/resist a demand over a subject nation while the other great powers
 * pick sides. Each crisis ends one of three ways:
 *   - CONGRESS: one bloc is clearly stronger, the weak lead backs down, the
 *     demand is settled peacefully (prestige swings, spheres redrawn);
 *   - WAR: balanced blocs go over the brink — a bloc-vs-bloc war using the
 *     existing war machinery;
 *   - FIZZLE: the flashpoint collapses (a lead dies, loses GP rank, etc).
 *
 * Pure sim logic: deterministic (rng threaded), no DOM, runs in the worker and
 * the Node multiplayer server. All state lives as plain data on World and is
 * self-healing for pre-0.7.0 saves (see ensureCrisisState).
 */

import type {
  CongressRecord,
  Crisis,
  CrisisSide,
  CrisisType,
  GameData,
  NationId,
  TensionContribution,
  WarGoalType,
  World,
} from '../../shared/types';
import type { Rng } from '../rng';
import {
  getCoalitionAgainst,
  getInfamyLimit,
  getInfluencePressureForTarget,
  getNationPowerBreakdown,
  getOrCreateRelation,
  getWarGoalRule,
  hasActiveTruce,
  relationForNations,
} from './diplomacy';
import { applyWarGoal } from './war';

const CONGRESS_HISTORY_CAP = 16;
const SPAWN_TENSION_FLOOR = 35;
const SHOWDOWN_POWER_RATIO = 1.45;
const AI_BACKDOWN_RATIO = 0.62;
const JOIN_SCORE_THRESHOLD = 45;
const PRESS_TEMPERATURE = 18;

/** Exported for UI forecast copy (congress vs war at showdown). */
export function getShowdownPowerRatio(): number {
  return SHOWDOWN_POWER_RATIO;
}

export function getPressTemperature(): number {
  return PRESS_TEMPERATURE;
}

export function getSpawnTensionFloor(): number {
  return SPAWN_TENSION_FLOOR;
}

/** Monthly tension decay that will apply at the next Concert tick. */
export function computeTensionDecay(tension: number): number {
  return Number((2.2 + tension * 0.06).toFixed(2));
}

export function computeBlocPower(world: World, members: NationId[]): number {
  let total = 0;
  for (const id of members) total += Math.max(0, getNationPowerBreakdown(world, id).score);
  return Math.max(1, total);
}

export type CrisisShowdownForecast = 'congress_attacker' | 'congress_defender' | 'war';

export function forecastCrisisShowdown(attackerPower: number, defenderPower: number): CrisisShowdownForecast {
  if (attackerPower >= defenderPower * SHOWDOWN_POWER_RATIO) return 'congress_attacker';
  if (defenderPower >= attackerPower * SHOWDOWN_POWER_RATIO) return 'congress_defender';
  return 'war';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// State bootstrap / self-healing (old saves have none of these fields)
// ---------------------------------------------------------------------------

export function ensureCrisisState(world: World): void {
  if (!Number.isFinite(world.tension)) world.tension = 15;
  if (world.crisis === undefined) world.crisis = null;
  if (!Array.isArray(world.congresses)) world.congresses = [];
  if (!Number.isFinite(world.nextCrisisId)) world.nextCrisisId = 1;
  if (!Number.isFinite(world.crisisCooldownUntil)) world.crisisCooldownUntil = 0;
}

export function getWorldTension(world: World): number {
  return Number((world.tension ?? 15).toFixed(2));
}

// ---------------------------------------------------------------------------
// Tension
// ---------------------------------------------------------------------------

function nationAlive(world: World, ownedCount: number[], nationId: NationId): boolean {
  return Boolean(world.nations[nationId]) && (ownedCount[nationId] ?? 0) > 0;
}

function ownedProvinceCounts(world: World): number[] {
  const counts = Array.from({ length: world.nations.length }, () => 0);
  for (const province of world.provinces) {
    if (counts[province.owner] !== undefined) counts[province.owner] += 1;
  }
  return counts;
}

/**
 * The labelled monthly tension pressure. Pure read — also drives the UI trace
 * tooltip, so every number the player sees traces to a cause.
 */
export function computeTensionContributions(world: World): TensionContribution[] {
  const out: TensionContribution[] = [];
  const infamyLimit = getInfamyLimit();

  let gpWars = 0;
  for (const war of world.wars) {
    const hasGp = war.attackers.some((id) => (world.nations[id]?.gpRank ?? 0) > 0)
      || war.defenders.some((id) => (world.nations[id]?.gpRank ?? 0) > 0);
    if (hasGp) gpWars += 1;
  }
  if (gpWars > 0) out.push({ label: `Great powers at war (${gpWars})`, value: Math.min(4, gpWars * 0.8) });

  let infamyPressure = 0;
  let infamousCount = 0;
  for (const nation of world.nations) {
    if (nation.infamy >= infamyLimit) {
      infamousCount += 1;
      infamyPressure += 1.5 + (nation.infamy - infamyLimit) * 0.1;
    }
  }
  if (infamousCount > 0) out.push({ label: `Infamous powers (${infamousCount})`, value: Math.min(6, infamyPressure) });

  let gpRivalries = 0;
  let bitterPairs = 0;
  for (const relation of world.relations) {
    const gpA = (world.nations[relation.a]?.gpRank ?? 0) > 0;
    const gpB = (world.nations[relation.b]?.gpRank ?? 0) > 0;
    if (!gpA || !gpB) continue;
    if (relation.kind === 'rivalry') gpRivalries += 1;
    if (relation.opinion <= -100) bitterPairs += 1;
  }
  if (gpRivalries > 0) out.push({ label: `Great-power rivalries (${gpRivalries})`, value: Math.min(2.4, gpRivalries * 0.4) });
  if (bitterPairs > 0) out.push({ label: `Bitter GP relations (${bitterPairs})`, value: Math.min(1.5, bitterPairs * 0.3) });

  let contested = 0;
  for (const nation of world.nations) {
    if (nation.gpRank > 0) continue;
    const pressure = getInfluencePressureForTarget(world, nation.id).filter((entry) => entry.points >= 25);
    if (pressure.length >= 2) contested += 1;
  }
  if (contested > 0) out.push({ label: `Contested spheres (${contested})`, value: Math.min(3, contested * 0.6) });

  if (world.crisis) out.push({ label: 'Active crisis', value: 1.5 });

  return out;
}

function updateTension(world: World): void {
  const pressure = computeTensionContributions(world).reduce((sum, entry) => sum + entry.value, 0);
  const tension = world.tension ?? 15;
  const decay = 2.2 + tension * 0.06;
  world.tension = clamp(Number((tension + pressure - decay).toFixed(2)), 0, 100);
}

// ---------------------------------------------------------------------------
// Flashpoint scan
// ---------------------------------------------------------------------------

interface CrisisCandidate {
  type: CrisisType;
  subject: NationId;
  demand: WarGoalType;
  stateId: number;
  attackerLead: NationId;
  defenderLead: NationId;
  score: number;
}

function leadsCanClash(world: World, a: NationId, b: NationId): boolean {
  if (a === b) return false;
  if (hasActiveTruce(world, a, b)) return false;
  const atWar = world.wars.some((war) => (
    (war.attackers.includes(a) && war.defenders.includes(b))
    || (war.attackers.includes(b) && war.defenders.includes(a))
  ));
  return !atWar;
}

function findCrisisCandidates(world: World, ownedCount: number[]): CrisisCandidate[] {
  const candidates: CrisisCandidate[] = [];
  const infamyLimit = getInfamyLimit();

  // 1. Sphere contests: two GPs with heavy influence stakes in the same minor.
  for (const target of world.nations) {
    if (target.gpRank > 0 || !nationAlive(world, ownedCount, target.id)) continue;
    const pressure = getInfluencePressureForTarget(world, target.id)
      .filter((entry) => (world.nations[entry.gp]?.gpRank ?? 0) > 0);
    const incumbent = target.spheredBy >= 0 && (world.nations[target.spheredBy]?.gpRank ?? 0) > 0
      ? target.spheredBy
      : pressure[0]?.gp ?? -1;
    if (incumbent < 0) continue;
    const challenger = pressure.find((entry) => entry.gp !== incumbent && entry.points >= 30)?.gp ?? -1;
    if (challenger < 0) continue;
    if (!leadsCanClash(world, challenger, incumbent)) continue;
    const challengerPts = pressure.find((entry) => entry.gp === challenger)?.points ?? 0;
    const incumbentPts = pressure.find((entry) => entry.gp === incumbent)?.points ?? 0;
    const opinion = relationForNations(world, challenger, incumbent)?.opinion ?? 0;
    candidates.push({
      type: 'sphere_contest',
      subject: target.id,
      demand: 'add_to_sphere',
      stateId: -1,
      attackerLead: challenger,
      defenderLead: incumbent,
      score: challengerPts + incumbentPts + (target.spheredBy >= 0 ? 15 : 0) - opinion * 0.2,
    });
  }

  // 2. Containment: an infamous power faces the concert.
  for (const offender of world.nations) {
    if (offender.infamy < infamyLimit || !nationAlive(world, ownedCount, offender.id)) continue;
    const coalition = getCoalitionAgainst(world, offender.id)
      .filter((id) => (world.nations[id]?.gpRank ?? 0) > 0)
      .filter((id) => leadsCanClash(world, id, offender.id))
      .filter((id) => relationForNations(world, id, offender.id)?.kind !== 'alliance');
    if (coalition.length === 0) continue;
    const lead = coalition
      .map((id) => ({ id, power: getNationPowerBreakdown(world, id).score }))
      .sort((a, b) => (b.power - a.power) || (a.id - b.id))[0].id;
    candidates.push({
      type: 'containment',
      subject: offender.id,
      demand: 'cut_down_to_size',
      stateId: -1,
      attackerLead: lead,
      defenderLead: offender.id,
      score: 20 + (offender.infamy - infamyLimit) * 2,
    });
  }

  // 3. Humiliation: a GP rivalry has curdled into open hostility.
  for (const relation of world.relations) {
    if (relation.kind !== 'rivalry' || relation.opinion > -70) continue;
    const nationA = world.nations[relation.a];
    const nationB = world.nations[relation.b];
    if (!nationA || !nationB || nationA.gpRank <= 0 || nationB.gpRank <= 0) continue;
    if (!nationAlive(world, ownedCount, nationA.id) || !nationAlive(world, ownedCount, nationB.id)) continue;
    if (!leadsCanClash(world, nationA.id, nationB.id)) continue;
    const powerA = getNationPowerBreakdown(world, nationA.id).score;
    const powerB = getNationPowerBreakdown(world, nationB.id).score;
    const attacker = powerA >= powerB ? nationA.id : nationB.id;
    const defender = attacker === nationA.id ? nationB.id : nationA.id;
    candidates.push({
      type: 'humiliation',
      subject: defender,
      demand: 'humiliate',
      stateId: -1,
      attackerLead: attacker,
      defenderLead: defender,
      score: 10 + (-relation.opinion - 70) * 0.3,
    });
  }

  return candidates.sort((a, b) => (
    (b.score - a.score)
    || a.type.localeCompare(b.type)
    || (a.subject - b.subject)
  ));
}

/** Ranked flashpoints for idle Concert UI (same ranking used for spawn). */
export function listCrisisCandidates(world: World, limit = 5): Array<{
  type: CrisisType;
  subject: NationId;
  demand: WarGoalType;
  attackerLead: NationId;
  defenderLead: NationId;
  score: number;
}> {
  ensureCrisisState(world);
  const ownedCount = ownedProvinceCounts(world);
  return findCrisisCandidates(world, ownedCount)
    .slice(0, Math.max(0, limit))
    .map((candidate) => ({
      type: candidate.type,
      subject: candidate.subject,
      demand: candidate.demand,
      attackerLead: candidate.attackerLead,
      defenderLead: candidate.defenderLead,
      score: Number(candidate.score.toFixed(1)),
    }));
}

export function buildCrisisShowdownView(world: World, crisis: Crisis): {
  attackerPower: number;
  defenderPower: number;
  powerRatio: number;
  showdownThreshold: number;
  forecast: CrisisShowdownForecast;
  pressTemperature: number;
  pressTempAfter: number;
  backDownWinnerLeadPrestige: number;
  backDownLoserLeadPrestige: number;
  demandEnforceOnAttackerWin: boolean;
  peacefulContainmentLimited: boolean;
} {
  const attackerPower = Number(computeBlocPower(world, crisis.attackerBackers).toFixed(1));
  const defenderPower = Number(computeBlocPower(world, crisis.defenderBackers).toFixed(1));
  const ratio = Number((attackerPower / Math.max(1, defenderPower)).toFixed(2));
  const pressTempAfter = clamp(crisis.temperature + PRESS_TEMPERATURE, 0, 100);
  return {
    attackerPower,
    defenderPower,
    powerRatio: ratio,
    showdownThreshold: SHOWDOWN_POWER_RATIO,
    forecast: forecastCrisisShowdown(attackerPower, defenderPower),
    pressTemperature: PRESS_TEMPERATURE,
    pressTempAfter,
    backDownWinnerLeadPrestige: Number((10 + crisis.temperature * 0.1).toFixed(1)),
    backDownLoserLeadPrestige: Number((8 + crisis.temperature * 0.08).toFixed(1)),
    demandEnforceOnAttackerWin: true,
    peacefulContainmentLimited: crisis.demand === 'cut_down_to_size',
  };
}

function spawnCrisis(world: World, rng: Rng, candidate: CrisisCandidate): void {
  const crisis: Crisis = {
    id: world.nextCrisisId ?? 1,
    type: candidate.type,
    subject: candidate.subject,
    demand: candidate.demand,
    stateId: candidate.stateId,
    attackerLead: candidate.attackerLead,
    defenderLead: candidate.defenderLead,
    attackerBackers: [candidate.attackerLead],
    defenderBackers: [candidate.defenderLead],
    startDay: world.day,
    deadlineDay: world.day + 300 + rng.int(0, 120),
    temperature: 15,
    pressedBy: [],
  };
  world.nextCrisisId = (world.nextCrisisId ?? 1) + 1;
  world.crisis = crisis;
  // A crisis chills the leads' relations immediately.
  const relation = getOrCreateRelation(world, crisis.attackerLead, crisis.defenderLead);
  relation.opinion = clamp(relation.opinion - 15, -200, 200);
}

// ---------------------------------------------------------------------------
// Sides, escalation, resolution
// ---------------------------------------------------------------------------

function crisisSideOf(crisis: Crisis, nationId: NationId): CrisisSide | null {
  if (crisis.attackerBackers.includes(nationId)) return 'attacker';
  if (crisis.defenderBackers.includes(nationId)) return 'defender';
  return null;
}

function blocPower(world: World, members: NationId[]): number {
  return computeBlocPower(world, members);
}

function aiEvaluateJoin(world: World, crisis: Crisis, gp: NationId): CrisisSide | null {
  const opinionAttacker = relationForNations(world, gp, crisis.attackerLead)?.opinion ?? 0;
  const opinionDefender = relationForNations(world, gp, crisis.defenderLead)?.opinion ?? 0;
  const kindAttacker = relationForNations(world, gp, crisis.attackerLead)?.kind ?? 'neutral';
  const kindDefender = relationForNations(world, gp, crisis.defenderLead)?.kind ?? 'neutral';
  let score = (opinionAttacker - opinionDefender) * 0.5;
  if (kindAttacker === 'alliance') score += 40;
  if (kindDefender === 'alliance') score -= 40;
  if (kindAttacker === 'rivalry') score -= 25;
  if (kindDefender === 'rivalry') score += 25;
  // Sphere interest: nobody helps a rival GP swallow their own client.
  if (world.nations[crisis.subject]?.spheredBy === gp) score -= 60;
  if (score >= JOIN_SCORE_THRESHOLD && leadsCanClash(world, gp, crisis.defenderLead)) return 'attacker';
  if (score <= -JOIN_SCORE_THRESHOLD && leadsCanClash(world, gp, crisis.attackerLead)) return 'defender';
  return null;
}

function recruitBackers(world: World, crisis: Crisis): void {
  const gpIds = world.nations
    .filter((nation) => nation.gpRank > 0)
    .map((nation) => nation.id)
    .sort((a, b) => a - b);
  for (const gp of gpIds) {
    if (crisisSideOf(crisis, gp) !== null) continue;
    if (world.nations[gp]?.isPlayer) continue; // the player joins by command only
    const side = aiEvaluateJoin(world, crisis, gp);
    if (side === 'attacker') crisis.attackerBackers.push(gp);
    else if (side === 'defender') crisis.defenderBackers.push(gp);
  }
  crisis.attackerBackers.sort((a, b) => a - b);
  crisis.defenderBackers.sort((a, b) => a - b);
}

function crisisDisplayName(world: World, crisis: Crisis): string {
  return world.nations[crisis.subject]?.name ?? `Nation ${crisis.subject}`;
}

function demandDetail(world: World, crisis: Crisis): string {
  const subject = crisisDisplayName(world, crisis);
  const attacker = world.nations[crisis.attackerLead]?.name ?? '?';
  switch (crisis.demand) {
    case 'add_to_sphere': return `${subject} into the sphere of ${attacker}`;
    case 'cut_down_to_size': return `${subject} cut down to size`;
    case 'humiliate': return `${subject} humiliated`;
    default: return `${crisis.demand.replaceAll('_', ' ')} against ${subject}`;
  }
}

function recordCongress(world: World, crisisId: number, record: Omit<CongressRecord, 'id'>): void {
  const congresses = world.congresses ?? (world.congresses = []);
  congresses.push({ id: crisisId, ...record });
  if (congresses.length > CONGRESS_HISTORY_CAP) congresses.splice(0, congresses.length - CONGRESS_HISTORY_CAP);
}

function finishCrisis(world: World, rng: Rng, cooldownDays: number): void {
  world.crisis = null;
  world.crisisCooldownUntil = world.day + cooldownDays + rng.int(0, 180);
}

/** The weak lead concedes: a congress convenes and settles the demand. */
function resolveCongress(world: World, rng: Rng, crisis: Crisis, winnerSide: CrisisSide): void {
  const winnerLead = winnerSide === 'attacker' ? crisis.attackerLead : crisis.defenderLead;
  const loserLead = winnerSide === 'attacker' ? crisis.defenderLead : crisis.attackerLead;
  const winners = winnerSide === 'attacker' ? crisis.attackerBackers : crisis.defenderBackers;
  const losers = winnerSide === 'attacker' ? crisis.defenderBackers : crisis.attackerBackers;

  const winner = world.nations[winnerLead];
  const loser = world.nations[loserLead];
  if (winner) winner.prestige += 10 + crisis.temperature * 0.1;
  if (loser) loser.prestige = Math.max(0, loser.prestige - (8 + crisis.temperature * 0.08));
  for (const id of winners) {
    if (id === winnerLead) continue;
    const nation = world.nations[id];
    if (nation) nation.prestige += 2.5;
  }
  for (const id of losers) {
    if (id === loserLead) continue;
    const nation = world.nations[id];
    if (nation) nation.prestige = Math.max(0, nation.prestige - 1);
  }

  if (winnerSide === 'attacker') {
    applyWarGoal(world, {
      holder: crisis.attackerLead,
      target: crisis.subject,
      type: crisis.demand,
      stateId: crisis.stateId,
      scoreValue: getWarGoalRule(crisis.demand).score,
    });
  }

  const relation = getOrCreateRelation(world, crisis.attackerLead, crisis.defenderLead);
  relation.opinion = clamp(relation.opinion - 30, -200, 200);

  world.tension = clamp((world.tension ?? 15) - 20, 0, 100);
  recordCongress(world, crisis.id, {
    name: `Congress of ${crisisDisplayName(world, crisis)}`,
    day: world.day,
    type: crisis.type,
    subject: crisis.subject,
    outcome: 'congress',
    winnerLead,
    loserLead,
    detail: winnerSide === 'attacker'
      ? `Settled: ${demandDetail(world, crisis)}.`
      : `Demand withdrawn: ${demandDetail(world, crisis)} refused.`,
  });
  finishCrisis(world, rng, 540);
}

/** Both blocs go over the brink: a crisis war between the full sides. */
function igniteCrisisWar(world: World, rng: Rng, crisis: Crisis): void {
  const attackers = Array.from(new Set(crisis.attackerBackers.filter((id) => !crisis.defenderBackers.includes(id))));
  const defenders = Array.from(new Set(crisis.defenderBackers.filter((id) => !attackers.includes(id))));
  if (attackers.length === 0) attackers.push(crisis.attackerLead);
  if (defenders.length === 0) defenders.push(crisis.defenderLead);

  const demandRule = getWarGoalRule(crisis.demand);
  const humiliateRule = getWarGoalRule('humiliate');
  world.wars.push({
    id: world.nextWarId++,
    attackers: attackers.sort((a, b) => a - b),
    defenders: defenders.sort((a, b) => a - b),
    goals: [
      {
        holder: crisis.attackerLead,
        target: crisis.subject,
        type: crisis.demand,
        stateId: crisis.stateId,
        scoreValue: demandRule.score,
      },
      {
        holder: crisis.defenderLead,
        target: crisis.attackerLead,
        type: 'humiliate',
        stateId: -1,
        scoreValue: humiliateRule.score,
      },
    ],
    score: 0,
    attackerExhaustion: 0,
    defenderExhaustion: 0,
    startDay: world.day,
  });

  const attackerNation = world.nations[crisis.attackerLead];
  if (attackerNation) {
    // The concert legitimizes the demand; declaring costs half the usual infamy.
    attackerNation.infamy = clamp(Number((attackerNation.infamy + demandRule.infamyUse * 0.5).toFixed(2)), 0, 100);
  }

  world.tension = clamp((world.tension ?? 15) - 35, 0, 100);
  recordCongress(world, crisis.id, {
    name: `The ${crisisDisplayName(world, crisis)} Crisis War`,
    day: world.day,
    type: crisis.type,
    subject: crisis.subject,
    outcome: 'war',
    winnerLead: -1,
    loserLead: -1,
    detail: `Diplomacy failed over ${demandDetail(world, crisis)}; ${attackers.length + defenders.length} powers march.`,
  });
  finishCrisis(world, rng, 720);
}

function fizzleCrisis(world: World, rng: Rng, crisis: Crisis, reason: string): void {
  world.tension = clamp((world.tension ?? 15) - 8, 0, 100);
  recordCongress(world, crisis.id, {
    name: `${crisisDisplayName(world, crisis)} Crisis`,
    day: world.day,
    type: crisis.type,
    subject: crisis.subject,
    outcome: 'fizzle',
    winnerLead: -1,
    loserLead: -1,
    detail: reason,
  });
  finishCrisis(world, rng, 240);
}

function crisisStillValid(world: World, ownedCount: number[], crisis: Crisis): string | null {
  if (!nationAlive(world, ownedCount, crisis.subject)) return 'The subject nation ceased to exist.';
  if (!nationAlive(world, ownedCount, crisis.attackerLead) || !nationAlive(world, ownedCount, crisis.defenderLead)) {
    return 'A crisis lead ceased to exist.';
  }
  if ((world.nations[crisis.attackerLead]?.gpRank ?? 0) <= 0) return 'The pressing power fell from the great-power ranks.';
  const alreadyAtWar = world.wars.some((war) => (
    (war.attackers.includes(crisis.attackerLead) && war.defenders.includes(crisis.defenderLead))
    || (war.attackers.includes(crisis.defenderLead) && war.defenders.includes(crisis.attackerLead))
  ));
  if (alreadyAtWar) return 'Overtaken by open war between the leads.';
  return null;
}

function runActiveCrisis(world: World, rng: Rng, crisis: Crisis, ownedCount: number[]): void {
  const invalidReason = crisisStillValid(world, ownedCount, crisis);
  if (invalidReason) {
    fizzleCrisis(world, rng, crisis, invalidReason);
    return;
  }

  recruitBackers(world, crisis);
  crisis.temperature = clamp(
    crisis.temperature
    + 7 + rng.next() * 5
    + (crisis.attackerBackers.length + crisis.defenderBackers.length) * 0.6,
    0,
    100,
  );

  const attackerPower = blocPower(world, crisis.attackerBackers);
  const defenderPower = blocPower(world, crisis.defenderBackers);

  // Early AI back-down: a clearly outmatched, unpressed AI lead concedes.
  if (crisis.temperature >= 50 && crisis.temperature < 100 && world.day < crisis.deadlineDay) {
    const attackerIsAi = !world.nations[crisis.attackerLead]?.isPlayer && !crisis.pressedBy.includes(crisis.attackerLead);
    const defenderIsAi = !world.nations[crisis.defenderLead]?.isPlayer && !crisis.pressedBy.includes(crisis.defenderLead);
    if (attackerIsAi && attackerPower < defenderPower * AI_BACKDOWN_RATIO) {
      resolveCongress(world, rng, crisis, 'defender');
      return;
    }
    if (defenderIsAi && defenderPower < attackerPower * AI_BACKDOWN_RATIO) {
      resolveCongress(world, rng, crisis, 'attacker');
      return;
    }
  }

  // Showdown: boiling point or deadline reached.
  if (crisis.temperature >= 100 || world.day >= crisis.deadlineDay) {
    const forecast = forecastCrisisShowdown(attackerPower, defenderPower);
    if (forecast === 'congress_attacker') {
      resolveCongress(world, rng, crisis, 'attacker');
    } else if (forecast === 'congress_defender') {
      resolveCongress(world, rng, crisis, 'defender');
    } else {
      igniteCrisisWar(world, rng, crisis);
    }
  }
}

// ---------------------------------------------------------------------------
// Player commands (invoked from src/sim/commands.ts)
// ---------------------------------------------------------------------------

export function joinCrisisSide(world: World, nationId: NationId, crisisId: number, side: CrisisSide): { ok: boolean; reason: string } {
  ensureCrisisState(world);
  const crisis = world.crisis;
  if (!crisis || crisis.id !== crisisId) return { ok: false, reason: 'No such active crisis.' };
  const nation = world.nations[nationId];
  if (!nation || nation.gpRank <= 0) return { ok: false, reason: 'Only great powers may back a crisis side.' };
  if (crisisSideOf(crisis, nationId) !== null) return { ok: false, reason: 'Already committed to a side.' };
  const opposingLead = side === 'attacker' ? crisis.defenderLead : crisis.attackerLead;
  if (!leadsCanClash(world, nationId, opposingLead)) {
    return { ok: false, reason: 'A truce or ongoing war blocks opposing that power.' };
  }
  if (side === 'attacker') crisis.attackerBackers = [...crisis.attackerBackers, nationId].sort((a, b) => a - b);
  else crisis.defenderBackers = [...crisis.defenderBackers, nationId].sort((a, b) => a - b);
  crisis.temperature = clamp(crisis.temperature + 6, 0, 100);
  return { ok: true, reason: `Backing the ${side} side in the ${crisisDisplayName(world, crisis)} crisis.` };
}

export function pressCrisisDemand(world: World, nationId: NationId, crisisId: number): { ok: boolean; reason: string } {
  ensureCrisisState(world);
  const crisis = world.crisis;
  if (!crisis || crisis.id !== crisisId) return { ok: false, reason: 'No such active crisis.' };
  if (nationId !== crisis.attackerLead && nationId !== crisis.defenderLead) {
    return { ok: false, reason: 'Only a crisis lead can press the demand.' };
  }
  if (crisis.pressedBy.includes(nationId)) return { ok: false, reason: 'Demand already pressed.' };
  crisis.pressedBy = [...crisis.pressedBy, nationId].sort((a, b) => a - b);
  crisis.temperature = clamp(crisis.temperature + PRESS_TEMPERATURE, 0, 100);
  return { ok: true, reason: `Demand pressed — temperature rises to ${crisis.temperature.toFixed(0)}.` };
}

export function crisisLeadBackDown(world: World, rng: Rng, nationId: NationId, crisisId: number): { ok: boolean; reason: string } {
  ensureCrisisState(world);
  const crisis = world.crisis;
  if (!crisis || crisis.id !== crisisId) return { ok: false, reason: 'No such active crisis.' };
  if (nationId !== crisis.attackerLead && nationId !== crisis.defenderLead) {
    return { ok: false, reason: 'Only a crisis lead can back down.' };
  }
  const winnerSide: CrisisSide = nationId === crisis.attackerLead ? 'defender' : 'attacker';
  resolveCongress(world, rng, crisis, winnerSide);
  return { ok: true, reason: 'Backed down. The congress settles against you; prestige suffers.' };
}

// ---------------------------------------------------------------------------
// Monthly tick (wired in src/sim/world.ts after diplomacy)
// ---------------------------------------------------------------------------

export function runCrisisMonthly(world: World, _data: GameData, rng: Rng): void {
  ensureCrisisState(world);
  updateTension(world);

  const ownedCount = ownedProvinceCounts(world);
  const crisis = world.crisis;
  if (crisis) {
    runActiveCrisis(world, rng, crisis, ownedCount);
    return;
  }

  // Spawn roll: gated on tension + cooldown, chance scales with tension.
  const tension = world.tension ?? 15;
  if (tension < SPAWN_TENSION_FLOOR) return;
  if (world.day < (world.crisisCooldownUntil ?? 0)) return;
  const spawnChance = ((tension - SPAWN_TENSION_FLOOR) / (100 - SPAWN_TENSION_FLOOR)) * 0.45 + 0.05;
  if (!rng.chance(spawnChance)) return;

  const candidate = findCrisisCandidates(world, ownedCount)[0];
  if (!candidate) return;
  spawnCrisis(world, rng, candidate);
  recruitBackers(world, world.crisis as Crisis);
}
