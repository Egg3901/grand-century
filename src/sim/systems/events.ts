/**
 * Data-driven events & decisions engine (E4).
 *
 * Monthly cadence, staggered per nation for perf. Deterministic via rng only.
 * Player events stay pending until resolveEvent; AI resolves immediately.
 */

import { DECISION_DEFS } from '../../data/decisions';
import { EVENT_DEFS } from '../../data/events';
import type {
  DecisionDef,
  DecisionStatus,
  EventChoiceDef,
  EventDef,
  EventEffect,
  EventRequirement,
  EventTriggerDef,
  GameData,
  Nation,
  NationId,
  PendingEvent,
  PendingEventChoiceView,
  World,
} from '../../shared/types';
import { getFormableStatusesForNation } from '../formables';
import type { Rng } from '../rng';
import { getOrCreateRelation, grantContentCb } from './diplomacy';
import { startColonization } from './war';

const STAGGER_BUCKETS = 6;
const TREASURY_MIN = -25_000;
const TREASURY_MAX = 5_000_000;
const EPOCH_YEAR = 1820;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthIndexFromDay(day: number): number {
  let remaining = day;
  let year = EPOCH_YEAR;
  while (remaining >= 365) {
    remaining -= 365;
    year += 1;
  }
  let month = 0;
  while (month < 12 && remaining >= DAYS_IN_MONTH[month]) {
    remaining -= DAYS_IN_MONTH[month];
    month += 1;
  }
  return (year - EPOCH_YEAR) * 12 + month;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function historyKey(id: string, nationId: NationId): string {
  return `${id}:${nationId}`;
}

function monthsBetween(earlierDay: number, laterDay: number): number {
  return Math.max(0, Math.floor((laterDay - earlierDay) / 30));
}

function currentYear(day: number): number {
  return EPOCH_YEAR + Math.floor(day / 365);
}

function ensureEventState(world: World): void {
  if (!Array.isArray(world.pendingEvents)) world.pendingEvents = [];
  if (!world.eventLastFired || typeof world.eventLastFired !== 'object') world.eventLastFired = {};
  if (!world.decisionLastTaken || typeof world.decisionLastTaken !== 'object') world.decisionLastTaken = {};
  if (!Number.isFinite(world.nextEventInstanceId)) world.nextEventInstanceId = 1;
}

function nationOwnedProvinceIds(world: World, nationId: NationId): Set<number> {
  const ids = new Set<number>();
  for (const province of world.provinces) {
    if (province.owner === nationId) ids.add(province.id);
  }
  return ids;
}

function avgMilitancy(world: World, nationId: NationId): number {
  const owned = nationOwnedProvinceIds(world, nationId);
  let sum = 0;
  let count = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0 || !owned.has(pop.provinceId)) continue;
    sum += pop.militancy;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function avgNeedsMet(world: World, nationId: NationId): number {
  const owned = nationOwnedProvinceIds(world, nationId);
  let sum = 0;
  let count = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0 || !owned.has(pop.provinceId)) continue;
    sum += pop.needsMet;
    count += 1;
  }
  return count > 0 ? sum / count : 1;
}

function factoryCount(world: World, nationId: NationId): number {
  let total = 0;
  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    total += state.factories.length;
  }
  return total;
}

const UNCOLONIZED_TAGS = new Set(['UNC', 'COL', 'UNA']);

function hasUncolonizedAdjacent(world: World, nationId: NationId): boolean {
  const playerOwned = new Set<number>();
  for (const province of world.provinces) {
    if (province.owner === nationId) playerOwned.add(province.id);
  }
  for (const state of world.states) {
    const owners = state.provinceIds.map((id) => world.provinces[id]?.owner ?? -1);
    const allUncolonized = owners.every((ownerId) => {
      const tag = world.nations[ownerId]?.tag ?? '';
      return UNCOLONIZED_TAGS.has(tag);
    });
    if (!allUncolonized) continue;
    const adjacent = state.provinceIds.some((provinceId) => {
      const province = world.provinces[provinceId];
      if (!province) return false;
      return province.neighbors.some((neighborId) => playerOwned.has(neighborId));
    });
    if (adjacent) return true;
  }
  return false;
}

function hasFormableCandidate(world: World, data: GameData, nationId: NationId): boolean {
  const statuses = getFormableStatusesForNation(world, data, nationId);
  return statuses.length > 0;
}

export function summarizeEffect(effect: EventEffect): string {
  switch (effect.t) {
    case 'treasury': return `${effect.amount >= 0 ? '+' : ''}£${effect.amount.toFixed(0)} treasury`;
    case 'prestige': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} prestige`;
    case 'infamy': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} infamy`;
    case 'militancy': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} militancy`;
    case 'consciousness': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} consciousness`;
    case 'literacy': return `${effect.amount >= 0 ? '+' : ''}${(effect.amount * 100).toFixed(1)}% literacy`;
    case 'researchPoints': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} research`;
    case 'colonialPoints': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} colonial pts`;
    case 'unrest': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} unrest`;
    case 'reformLevel': return `${effect.delta >= 0 ? '+' : ''}${effect.delta} ${effect.reform.replace(/_/g, ' ')}`;
    case 'modifyGoodPrice': return `${effect.goodKey} price ×${effect.factor.toFixed(2)}`;
    case 'modifyGoodStockpile': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} ${effect.goodKey} stock`;
    case 'relationsWithGps': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} GP relations`;
    case 'spawnRebels': return 'Spawn rebels';
    case 'grantColonialClaim': return 'Plant colonial claim';
    case 'boostFactories': return `+${effect.levels} factory level(s)`;
    case 'boostRgo': return `+${effect.levels} ${effect.goodKey ?? 'RGO'} output`;
    case 'grantCasusBelli': return `Free casus belli vs ${effect.targetTag}`;
    case 'opinionWithTags': return `${effect.amount >= 0 ? '+' : ''}${effect.amount} opinion with ${effect.tags.join(', ')}`;
    case 'forceRivalry': return `Rivalry with ${effect.tag}`;
    default: return 'Effect';
  }
}

export function checkRequirement(
  world: World,
  data: GameData,
  nation: Nation,
  req: EventRequirement,
): { ok: boolean; reason: string } {
  const year = currentYear(world.day);
  switch (req.t) {
    case 'minTreasury':
      return nation.treasury >= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Need £${req.value} treasury` };
    case 'minPrestige':
      return nation.prestige >= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Need ${req.value} prestige` };
    case 'minColonialPoints':
      return nation.colonialPoints >= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Need ${req.value} colonial points` };
    case 'isGreatPower':
      return nation.gpRank > 0
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Must be a Great Power' };
    case 'isCivilized':
      return nation.isCivilized
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Must be civilized' };
    case 'reformAtMost':
      return (nation.reforms[req.reform] ?? 0) <= req.level
        ? { ok: true, reason: '' }
        : { ok: false, reason: `${req.reform} already advanced` };
    case 'reformAtLeast':
      return (nation.reforms[req.reform] ?? 0) >= req.level
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Need ${req.reform} level ${req.level}+` };
    case 'yearAtLeast':
      return year >= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Available from ${req.value}` };
    case 'yearAtMost':
      return year <= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Only until ${req.value}` };
    case 'minLiteracy':
      return nation.literacy >= req.value
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Need ${(req.value * 100).toFixed(0)}% literacy` };
    case 'hasFormableCandidate':
      return hasFormableCandidate(world, data, nation.id)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'No formable nation available' };
    case 'tagIn':
      return req.tags.includes(nation.tag)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Not available to this nation' };
    case 'decisionTaken':
      return world.decisionLastTaken[`${req.id}:${nation.id}`] !== undefined
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Requires "${req.id.replace(/_/g, ' ')}" first` };
    case 'formableCoreShareAtLeast': {
      const status = getFormableStatusesForNation(world, data, nation.id)
        .find((entry) => entry.key === req.key);
      const share = status && status.totalCoreStates > 0
        ? status.controlledCoreStates / status.totalCoreStates
        : 0;
      return share >= req.share
        ? { ok: true, reason: '' }
        : { ok: false, reason: `Control ${Math.round(req.share * 100)}% of the unification cores` };
    }
    default:
      return { ok: true, reason: '' };
  }
}

function triggerMet(
  world: World,
  data: GameData,
  nation: Nation,
  trigger: EventTriggerDef,
): boolean {
  const year = currentYear(world.day);
  if (trigger.yearAtLeast !== undefined && year < trigger.yearAtLeast) return false;
  if (trigger.yearAtMost !== undefined && year > trigger.yearAtMost) return false;
  if (trigger.isCivilized !== undefined && nation.isCivilized !== trigger.isCivilized) return false;
  if (trigger.isGreatPower !== undefined) {
    const isGp = nation.gpRank > 0;
    if (isGp !== trigger.isGreatPower) return false;
  }
  if (trigger.tags && trigger.tags.length > 0 && !trigger.tags.includes(nation.tag)) return false;
  if (trigger.excludeTags && trigger.excludeTags.includes(nation.tag)) return false;
  if (trigger.decisionTaken && world.decisionLastTaken[`${trigger.decisionTaken}:${nation.id}`] === undefined) return false;
  if (trigger.minTreasury !== undefined && nation.treasury < trigger.minTreasury) return false;
  if (trigger.maxTreasury !== undefined && nation.treasury > trigger.maxTreasury) return false;
  if (trigger.minLiteracy !== undefined && nation.literacy < trigger.minLiteracy) return false;
  if (trigger.maxLiteracy !== undefined && nation.literacy > trigger.maxLiteracy) return false;
  if (trigger.minMilitancy !== undefined && avgMilitancy(world, nation.id) < trigger.minMilitancy) return false;
  if (trigger.maxMilitancy !== undefined && avgMilitancy(world, nation.id) > trigger.maxMilitancy) return false;
  if (trigger.minAvgNeedsMet !== undefined && avgNeedsMet(world, nation.id) < trigger.minAvgNeedsMet) return false;
  if (trigger.maxAvgNeedsMet !== undefined && avgNeedsMet(world, nation.id) > trigger.maxAvgNeedsMet) return false;
  if (trigger.minFactoryCount !== undefined && factoryCount(world, nation.id) < trigger.minFactoryCount) return false;
  if (trigger.hasUncolonizedAdjacent && !hasUncolonizedAdjacent(world, nation.id)) return false;
  if (trigger.hasFormableCandidate && !hasFormableCandidate(world, data, nation.id)) return false;
  return true;
}

function choiceAvailable(
  world: World,
  data: GameData,
  nation: Nation,
  choice: EventChoiceDef,
): { ok: boolean; reason: string } {
  for (const req of choice.requirements ?? []) {
    const result = checkRequirement(world, data, nation, req);
    if (!result.ok) return result;
  }
  return { ok: true, reason: '' };
}

function buildChoiceViews(
  world: World,
  data: GameData,
  nation: Nation,
  choices: EventChoiceDef[],
): PendingEventChoiceView[] {
  return choices.map((choice) => {
    const gate = choiceAvailable(world, data, nation, choice);
    return {
      id: choice.id,
      label: choice.label,
      description: choice.description,
      effectsSummary: choice.effects.map(summarizeEffect),
      available: gate.ok,
      unavailableReason: gate.ok ? undefined : gate.reason,
    };
  });
}

function applyPopDelta(world: World, nationId: NationId, field: 'militancy' | 'consciousness', amount: number): void {
  const owned = nationOwnedProvinceIds(world, nationId);
  for (const pop of world.pops) {
    if (pop.size <= 0 || !owned.has(pop.provinceId)) continue;
    pop[field] = clamp(pop[field] + amount, 0, 10);
  }
}

function applyUnrest(world: World, nationId: NationId, amount: number): void {
  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    state.unrestRisk = clamp(state.unrestRisk + amount, 0, 2);
  }
}

function spawnEventRebels(world: World, data: GameData, nationId: NationId): void {
  if (!Array.isArray(world.rebellions)) world.rebellions = [];
  if (!Number.isFinite(world.nextRebellionId)) world.nextRebellionId = 1;
  const active = world.rebellions.filter((r) => r.status === 'active' && r.targetNation === nationId);
  if (active.length >= 2) return;

  let bestState = -1;
  let bestMil = -1;
  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    let mil = 0;
    let count = 0;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        mil += pop.militancy;
        count += 1;
      }
    }
    const avg = count > 0 ? mil / count : 0;
    if (avg > bestMil) {
      bestMil = avg;
      bestState = state.id;
    }
  }
  if (bestState < 0) return;
  const state = world.states[bestState];
  const provinceId = state.provinceIds[0];
  const province = world.provinces[provinceId];
  if (!province) return;

  const rebellionId = world.nextRebellionId++;
  const demand = {
    type: 'enact_reform' as const,
    description: 'Enact political reforms',
    reformKey: 'press_rights',
    reformLevel: Math.min(3, (world.nations[nationId]?.reforms.press_rights ?? 0) + 1),
  };
  world.rebellions.push({
    id: rebellionId,
    targetNation: nationId,
    originState: bestState,
    startDay: world.day,
    progress: 0,
    holdDays: 0,
    status: 'active',
    demand,
  });
  const sourcePop = province.popIds.find((id) => (world.pops[id]?.size ?? 0) > 0) ?? 0;
  world.armies.push({
    id: world.nextArmyId++,
    owner: -1,
    location: province.id,
    moveTarget: -1,
    moveProgress: 0,
    regiments: Array.from({ length: 3 }, () => ({
      type: 'infantry' as const,
      strength: 850,
      organization: 40,
      sourcePop,
    })),
    leader: { name: 'Event Insurgents', attack: 1, defense: 1, trait: 'uprising' },
    rebel: true,
    hostileTo: nationId,
    rebellionId,
    rebelDemand: demand,
  });
  state.lastRebellionDay = world.day;
  void data;
}

function grantColonialClaimEffect(world: World, nationId: NationId): void {
  const playerOwned = new Set<number>();
  for (const province of world.provinces) {
    if (province.owner === nationId) playerOwned.add(province.id);
  }
  const candidates: number[] = [];
  for (const state of world.states) {
    const owners = state.provinceIds.map((id) => world.provinces[id]?.owner ?? -1);
    const allUncolonized = owners.every((ownerId) => UNCOLONIZED_TAGS.has(world.nations[ownerId]?.tag ?? ''));
    if (!allUncolonized) continue;
    const adjacent = state.provinceIds.some((provinceId) => {
      const province = world.provinces[provinceId];
      return !!province && province.neighbors.some((n) => playerOwned.has(n));
    });
    if (adjacent) candidates.push(state.id);
  }
  candidates.sort((a, b) => a - b);
  if (candidates.length === 0) return;
  startColonization(world, nationId, candidates[0]);
}

export function applyEffects(
  world: World,
  data: GameData,
  nationId: NationId,
  effects: EventEffect[],
): void {
  const nation = world.nations[nationId];
  if (!nation) return;

  for (const effect of effects) {
    switch (effect.t) {
      case 'treasury': {
        let delta = effect.amount;
        // Bound drains so AI spam cannot bankrupt the world economy.
        if (delta < 0) {
          const maxDrain = Math.max(40, Math.abs(nation.treasury) * 0.35 + 80);
          delta = Math.max(delta, -maxDrain);
        } else if (delta > 0) {
          delta = Math.min(delta, 800);
        }
        nation.treasury = clamp(nation.treasury + delta, TREASURY_MIN, TREASURY_MAX);
        break;
      }
      case 'prestige':
        nation.prestige = clamp(nation.prestige + effect.amount, 0, 10_000);
        break;
      case 'infamy':
        nation.infamy = clamp(nation.infamy + effect.amount, 0, 100);
        break;
      case 'militancy':
        applyPopDelta(world, nationId, 'militancy', effect.amount);
        break;
      case 'consciousness':
        applyPopDelta(world, nationId, 'consciousness', effect.amount);
        break;
      case 'literacy':
        nation.literacy = clamp(nation.literacy + effect.amount, 0, 1);
        break;
      case 'researchPoints':
        nation.researchPoints = clamp(nation.researchPoints + effect.amount, 0, 50_000);
        break;
      case 'colonialPoints':
        nation.colonialPoints = clamp(nation.colonialPoints + effect.amount, 0, 5_000);
        break;
      case 'unrest':
        applyUnrest(world, nationId, effect.amount);
        break;
      case 'reformLevel': {
        const reform = data.reforms.find((r) => r.key === effect.reform);
        if (!reform) break;
        const current = nation.reforms[effect.reform] ?? 0;
        nation.reforms[effect.reform] = clamp(current + effect.delta, 0, reform.options.length - 1);
        break;
      }
      case 'modifyGoodPrice': {
        const good = data.goods.find((g) => g.key === effect.goodKey);
        if (!good) break;
        const market = world.market[good.id];
        if (!market) break;
        const factor = clamp(effect.factor, 0.4, 2.5);
        market.price = clamp(market.price * factor, good.basePrice * 0.3, good.basePrice * 3.5);
        break;
      }
      case 'modifyGoodStockpile': {
        const good = data.goods.find((g) => g.key === effect.goodKey);
        if (!good) break;
        const market = world.market[good.id];
        if (!market) break;
        market.worldStockpile = clamp(market.worldStockpile + effect.amount, 0, 50_000);
        break;
      }
      case 'relationsWithGps': {
        for (const other of world.nations) {
          if (other.id === nationId || other.gpRank <= 0) continue;
          const relation = getOrCreateRelation(world, nationId, other.id);
          relation.opinion = clamp(relation.opinion + effect.amount, -200, 200);
        }
        break;
      }
      case 'grantCasusBelli': {
        const target = world.nations.find((other) => other.tag === effect.targetTag);
        if (target && target.id !== nationId) {
          grantContentCb(world, nationId, target.id, effect.goal, effect.monthsValid);
        }
        break;
      }
      case 'opinionWithTags': {
        for (const tag of effect.tags) {
          const other = world.nations.find((candidate) => candidate.tag === tag);
          if (!other || other.id === nationId) continue;
          const relation = getOrCreateRelation(world, nationId, other.id);
          relation.opinion = clamp(relation.opinion + effect.amount, -200, 200);
        }
        break;
      }
      case 'forceRivalry': {
        const other = world.nations.find((candidate) => candidate.tag === effect.tag);
        if (other && other.id !== nationId) {
          const relation = getOrCreateRelation(world, nationId, other.id);
          relation.kind = 'rivalry';
          relation.opinion = Math.min(relation.opinion, -40);
        }
        break;
      }
      case 'spawnRebels':
        spawnEventRebels(world, data, nationId);
        break;
      case 'grantColonialClaim':
        grantColonialClaimEffect(world, nationId);
        break;
      case 'boostFactories': {
        const owned = world.states.filter((s) => s.owner === nationId && s.factories.length > 0);
        owned.sort((a, b) => a.id - b.id);
        for (const state of owned.slice(0, 3)) {
          for (const factory of state.factories) {
            factory.level = clamp(factory.level + effect.levels, 1, 12);
          }
        }
        break;
      }
      case 'boostRgo': {
        const recipeKey = effect.goodKey ? `rgo_${effect.goodKey}` : null;
        let boosted = 0;
        for (const province of world.provinces) {
          if (province.owner !== nationId) continue;
          if (recipeKey && province.rgo.recipe !== recipeKey) continue;
          province.rgo.level = clamp(province.rgo.level + effect.levels, 1, 12);
          boosted += 1;
          if (boosted >= 4) break;
        }
        break;
      }
      default:
        break;
    }
  }

  // Hard safety: no NaNs on key nation fields.
  nation.treasury = clamp(nation.treasury, TREASURY_MIN, TREASURY_MAX);
  nation.prestige = clamp(nation.prestige, 0, 10_000);
  nation.infamy = clamp(nation.infamy, 0, 100);
  nation.literacy = clamp(nation.literacy, 0, 1);
}

function pickAiChoice(
  world: World,
  data: GameData,
  nation: Nation,
  event: EventDef,
  rng: Rng,
): EventChoiceDef {
  const scored: { choice: EventChoiceDef; score: number }[] = [];
  for (const choice of event.choices) {
    if (!choiceAvailable(world, data, nation, choice).ok) continue;
    let base = choice.aiWeight ?? 40;
    const treasuryHit = choice.effects.reduce((sum, effect) => (
      effect.t === 'treasury' && effect.amount < 0 ? sum + effect.amount : sum
    ), 0);
    if (nation.treasury < 250 && treasuryHit < -100) base -= 25;
    if (choice.effects.some((effect) => effect.t === 'spawnRebels')) base -= 15;
    scored.push({ choice, score: base + rng.next() * 12 });
  }
  if (scored.length === 0) return event.choices[0];
  scored.sort((a, b) => b.score - a.score || a.choice.id.localeCompare(b.choice.id));
  return scored[0].choice;
}

function fireEvent(
  world: World,
  data: GameData,
  nation: Nation,
  event: EventDef,
  rng: Rng,
): void {
  ensureEventState(world);
  const key = historyKey(event.id, nation.id);
  world.eventLastFired[key] = world.day;

  if (nation.isPlayer || nation.id === world.playerNation) {
    const instanceId = world.nextEventInstanceId++;
    const pending: PendingEvent = {
      instanceId,
      eventKey: event.id,
      nationId: nation.id,
      firedDay: world.day,
      title: event.title,
      description: event.description,
      choices: buildChoiceViews(world, data, nation, event.choices),
    };
    world.pendingEvents.push(pending);
    return;
  }

  const choice = pickAiChoice(world, data, nation, event, rng);
  applyEffects(world, data, nation.id, choice.effects);
}

/** Test/helper: fire a specific event if its trigger is currently met (bypasses MTTH). */
export function forceFireEvent(
  world: World,
  data: GameData,
  nationId: NationId,
  eventId: string,
  rng: Rng,
): boolean {
  ensureEventState(world);
  const event = EVENT_DEFS.find((entry) => entry.id === eventId);
  const nation = world.nations[nationId];
  if (!event || !nation) return false;
  if (!triggerMet(world, data, nation, event.trigger)) return false;
  if (!canFireEvent(world, event, nationId)) return false;
  fireEvent(world, data, nation, event, rng);
  return true;
}

function canFireEvent(world: World, event: EventDef, nationId: NationId): boolean {
  ensureEventState(world);
  const key = historyKey(event.id, nationId);
  const last = world.eventLastFired[key];
  if (last === undefined) return true;
  if (event.once) return false;
  const cooldown = event.cooldownMonths ?? Math.max(24, Math.floor(event.mtthMonths * 0.5));
  return monthsBetween(last, world.day) >= cooldown;
}

function tryFireForNation(
  world: World,
  data: GameData,
  nation: Nation,
  rng: Rng,
): void {
  if (nationOwnedProvinceIds(world, nation.id).size === 0) return;
  const isPlayer = nation.isPlayer || nation.id === world.playerNation;
  // Keep AI event pressure light so long-run bankrupt bands stay intact.
  if (!isPlayer && nation.treasury < 140) return;
  // Cap pending player events so UI doesn't pile up.
  if (isPlayer && world.pendingEvents.filter((e) => e.nationId === nation.id).length >= 3) {
    return;
  }

  const eligible: EventDef[] = [];
  for (const event of EVENT_DEFS) {
    if (!canFireEvent(world, event, nation.id)) continue;
    if (!triggerMet(world, data, nation, event.trigger)) continue;
    eligible.push(event);
  }
  if (eligible.length === 0) return;

  // Weighted lottery among eligible; each event's monthly fire chance ≈ weight/mtth.
  let totalWeight = 0;
  const weights: number[] = [];
  for (const event of eligible) {
    const mtth = Math.max(1, event.mtthMonths);
    const w = Math.max(0.01, (event.weight ?? 1) / mtth);
    weights.push(w);
    totalWeight += w;
  }
  // At most one event per nation per monthly check.
  // Probability of firing anything scales with totalWeight, capped.
  const fireChance = clamp(totalWeight * 0.65, 0, 0.42);
  if (!rng.chance(fireChance)) return;

  let roll = rng.next() * totalWeight;
  let picked = eligible[0];
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      picked = eligible[i];
      break;
    }
  }
  fireEvent(world, data, nation, picked, rng);
}

/**
 * 1.0-U1: balance-of-power pressure. Great powers sour on any OUTSIDE nation
 * closing in on a formable — France watches German unification, Austria the
 * Risorgimento — without scripting outcomes: it is pure opinion pressure,
 * plus a rivalry once the unifier is nearly done and comparably strong.
 * Fellow formable candidates are exempt (they already compete directly), as
 * are allies (an entente is a choice the player can make and keep).
 */
const BOP_ALARM_SHARE = 0.5;
const BOP_RIVALRY_SHARE = 0.8;

export function applyBalanceOfPowerPressure(world: World, data: GameData): void {
  for (const nation of world.nations) {
    if (!nation || nation.gpRank <= 0) continue;
    const statuses = getFormableStatusesForNation(world, data, nation.id);
    for (const status of statuses) {
      if (status.totalCoreStates <= 0) continue;
      const share = status.controlledCoreStates / status.totalCoreStates;
      if (share < BOP_ALARM_SHARE) continue;
      const formable = data.formables?.find((entry) => entry.key === status.key);
      for (const gp of world.nations) {
        if (!gp || gp.id === nation.id || gp.gpRank <= 0) continue;
        if (formable?.candidateTags.includes(gp.tag)) continue;
        const relation = getOrCreateRelation(world, gp.id, nation.id);
        if (relation.kind === 'alliance') continue;
        const pressure = share >= BOP_RIVALRY_SHARE ? 3 : 1.5;
        relation.opinion = clamp(relation.opinion - pressure, -140, 200);
        if (share >= BOP_RIVALRY_SHARE && relation.kind === 'neutral') {
          relation.kind = 'rivalry';
          relation.opinion = Math.min(relation.opinion, -40);
        }
      }
    }
  }
}

export function runEventsMonthly(world: World, data: GameData, rng: Rng): void {
  ensureEventState(world);
  applyBalanceOfPowerPressure(world, data);
  const monthIndex = monthIndexFromDay(world.day);
  const bucket = ((monthIndex % STAGGER_BUCKETS) + STAGGER_BUCKETS) % STAGGER_BUCKETS;

  const nationIds = world.nations.map((n) => n.id).sort((a, b) => a - b);
  for (const nationId of nationIds) {
    if (nationId % STAGGER_BUCKETS !== bucket) continue;
    const nation = world.nations[nationId];
    if (!nation) continue;
    tryFireForNation(world, data, nation, rng);
    if (!nation.isPlayer) maybeTakeAiDecision(world, data, nation, rng);
  }
}

/**
 * U3 pacing: AI nations use the decisions system too — before this, all 47
 * AI nations ignored it entirely (no industrialization pushes, no amnesties,
 * and AI Prussia could never walk the unification arc). Conservative policy:
 * a monthly chance, one decision at a time, never below the AI's factory
 * treasury reserve, and deterministic through the world rng.
 */
const AI_DECISION_CHANCE = 0.22;
const AI_TREASURY_FLOOR = 900;

function maybeTakeAiDecision(world: World, data: GameData, nation: Nation, rng: Rng): void {
  if (rng.next() > AI_DECISION_CHANCE) return;
  if (!nation.isCivilized) return;
  const available = DECISION_DEFS.filter((decision) => {
    const status = evaluateDecision(world, data, nation.id, decision);
    if (!status.available) return false;
    const cost = decision.cost.treasury ?? 0;
    if (cost > 0 && (nation.treasury - cost < AI_TREASURY_FLOOR || cost > nation.treasury * 0.25)) return false;
    return true;
  });
  if (available.length === 0) return;
  const pick = available[Math.floor(rng.next() * available.length) % available.length];
  takeDecision(world, data, nation.id, pick.id);
}

export function resolvePendingEvent(
  world: World,
  data: GameData,
  nationId: NationId,
  instanceId: number,
  choiceId: string,
): { ok: boolean; reason: string } {
  ensureEventState(world);
  const idx = world.pendingEvents.findIndex((e) => e.instanceId === instanceId && e.nationId === nationId);
  if (idx < 0) return { ok: false, reason: 'Event not found.' };
  const pending = world.pendingEvents[idx];
  const def = EVENT_DEFS.find((e) => e.id === pending.eventKey);
  if (!def) {
    world.pendingEvents.splice(idx, 1);
    return { ok: false, reason: 'Unknown event definition.' };
  }
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Unknown choice.' };
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Nation missing.' };
  const gate = choiceAvailable(world, data, nation, choice);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  applyEffects(world, data, nationId, choice.effects);
  world.pendingEvents.splice(idx, 1);
  return { ok: true, reason: `${def.title}: ${choice.label}` };
}

export function evaluateDecision(
  world: World,
  data: GameData,
  nationId: NationId,
  decision: DecisionDef,
): DecisionStatus {
  ensureEventState(world);
  const nation = world.nations[nationId];
  const costSummary: string[] = [];
  if (decision.cost.treasury) costSummary.push(`£${decision.cost.treasury}`);
  if (decision.cost.prestige) costSummary.push(`${decision.cost.prestige} prestige`);
  if (decision.cost.researchPoints) costSummary.push(`${decision.cost.researchPoints} research`);
  const effectsSummary = decision.effects.map(summarizeEffect);

  if (!nation) {
    return {
      id: decision.id,
      title: decision.title,
      description: decision.description,
      available: false,
      reason: 'Nation missing',
      costSummary,
      effectsSummary,
    };
  }

  const key = historyKey(decision.id, nationId);
  const last = world.decisionLastTaken[key];
  if (decision.once && last !== undefined) {
    return {
      id: decision.id,
      title: decision.title,
      description: decision.description,
      available: false,
      reason: 'Already taken',
      costSummary,
      effectsSummary,
    };
  }
  if (last !== undefined && decision.cooldownMonths) {
    const elapsed = monthsBetween(last, world.day);
    if (elapsed < decision.cooldownMonths) {
      return {
        id: decision.id,
        title: decision.title,
        description: decision.description,
        available: false,
        reason: `Cooldown: ${decision.cooldownMonths - elapsed} months`,
        costSummary,
        effectsSummary,
      };
    }
  }

  for (const req of decision.prerequisites) {
    const result = checkRequirement(world, data, nation, req);
    if (!result.ok) {
      return {
        id: decision.id,
        title: decision.title,
        description: decision.description,
        available: false,
        reason: result.reason,
        costSummary,
        effectsSummary,
      };
    }
  }

  if ((decision.cost.treasury ?? 0) > 0 && nation.treasury < (decision.cost.treasury ?? 0)) {
    return {
      id: decision.id,
      title: decision.title,
      description: decision.description,
      available: false,
      reason: `Need £${decision.cost.treasury}`,
      costSummary,
      effectsSummary,
    };
  }
  if ((decision.cost.prestige ?? 0) > 0 && nation.prestige < (decision.cost.prestige ?? 0)) {
    return {
      id: decision.id,
      title: decision.title,
      description: decision.description,
      available: false,
      reason: `Need ${decision.cost.prestige} prestige`,
      costSummary,
      effectsSummary,
    };
  }

  return {
    id: decision.id,
    title: decision.title,
    description: decision.description,
    available: true,
    reason: 'Available',
    costSummary,
    effectsSummary,
  };
}

export function listPlayerDecisions(world: World, data: GameData, nationId: NationId): DecisionStatus[] {
  const nation = world.nations[nationId];
  return DECISION_DEFS
    // Tag-locked decisions (national arcs) are invisible to nations that can
    // NEVER take them — a year gate builds anticipation, a wrong-tag row is
    // just noise in 47 other panels.
    .filter((decision) => {
      if (!nation) return true;
      const tagGate = decision.prerequisites.find(
        (req): req is Extract<EventRequirement, { t: 'tagIn' }> => req.t === 'tagIn',
      );
      return !tagGate || tagGate.tags.includes(nation.tag);
    })
    .map((decision) => evaluateDecision(world, data, nationId, decision));
}

export function takeDecision(
  world: World,
  data: GameData,
  nationId: NationId,
  decisionId: string,
): { ok: boolean; reason: string } {
  ensureEventState(world);
  const decision = DECISION_DEFS.find((d) => d.id === decisionId);
  if (!decision) return { ok: false, reason: 'Unknown decision.' };
  const status = evaluateDecision(world, data, nationId, decision);
  if (!status.available) return { ok: false, reason: status.reason };
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Nation missing.' };

  nation.treasury = clamp(nation.treasury - (decision.cost.treasury ?? 0), TREASURY_MIN, TREASURY_MAX);
  nation.prestige = clamp(nation.prestige - (decision.cost.prestige ?? 0), 0, 10_000);
  nation.researchPoints = clamp(nation.researchPoints - (decision.cost.researchPoints ?? 0), 0, 50_000);
  applyEffects(world, data, nationId, decision.effects);
  world.decisionLastTaken[historyKey(decision.id, nationId)] = world.day;
  return { ok: true, reason: `Decision taken: ${decision.title}` };
}

/** Test helper: force-evaluate whether a named event's trigger is met. */
export function isEventTriggerMet(
  world: World,
  data: GameData,
  nationId: NationId,
  eventId: string,
): boolean {
  const event = EVENT_DEFS.find((e) => e.id === eventId);
  const nation = world.nations[nationId];
  if (!event || !nation) return false;
  return triggerMet(world, data, nation, event.trigger);
}

export function getEventDef(eventId: string): EventDef | undefined {
  return EVENT_DEFS.find((e) => e.id === eventId);
}

export { EVENT_DEFS, DECISION_DEFS };
