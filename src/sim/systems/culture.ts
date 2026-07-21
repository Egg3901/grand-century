/**
 * 0.8.0 — The Age of Nationalism: assimilation, non-accepted-culture unrest,
 * and national movements (culture-based separatism).
 *
 * Monthly flow (runCultureMonthly, hooked in world.ts after the pop pass):
 *  1. Non-accepted pops accrue militancy/consciousness, scaled by the nation's
 *     culture policy (exclusionary / assimilationist / pluralist).
 *  2. Non-accepted pops assimilate toward the primary culture. The rate is
 *     driven by how surrounded they are (local primary-culture share), national
 *     literacy (schools melt minorities), policy, religious distance — and is
 *     smothered by a radical national movement (identity hardens instead).
 *  3. National movements form per (nation, non-accepted culture) once the
 *     culture is a meaningful share of the nation and conscious enough.
 *     Radicalism rises with anger and awareness, falls with contentment.
 *  4. A boiling movement (high radicalism AND genuinely angry pops) launches an
 *     independence rebellion for its heartland states through the existing
 *     rebellion machinery — BALANCE.rebellion world/nation caps, per-state
 *     cooldowns and the rebel-army cap all apply, so nationalism can never
 *     spawn endless rebellions.
 *
 * Determinism: no randomness is needed; the Rng parameter is accepted for
 * signature symmetry with the other systems but unused. Pure sim, DOM-free.
 * All world/nation fields are optional; ensureCultureState self-heals saves.
 */

import type {
  CultureLedgerEntry,
  CulturePolicy,
  GameData,
  MovementView,
  NationId,
  NationalMovement,
  Pop,
  World,
} from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';

// ---------------------------------------------------------------------------
// Tuning (kept local: this is the culture system's single knob panel)
// ---------------------------------------------------------------------------

export const CULTURE_TUNING = {
  /** Base monthly assimilation fraction before factors (0.6%/mo). */
  assimilationBase: 0.006,
  /** Multipliers per culture policy. */
  assimilationPolicy: { exclusionary: 1.2, assimilationist: 1, pluralist: 0.45 } as Record<CulturePolicy, number>,
  /** Assimilating across a religious divide is slower. */
  assimilationReligionPenalty: 0.7,
  /** Monthly militancy accrual for non-accepted pops, per policy. */
  militancyPolicy: { exclusionary: 0.05, assimilationist: 0.025, pluralist: 0.006 } as Record<CulturePolicy, number>,
  /** Extra resentment when the pop's religion also differs from the state's. */
  militancyReligionFactor: 1.2,
  /** Monthly consciousness accrual for non-accepted pops (awakening). */
  consciousnessAccrual: 0.012,
  /** Movement forms at >= this share of national population... */
  movementMinShare: 0.04,
  /** ...and >= this average consciousness across the culture's pops. */
  movementMinConsciousness: 2.5,
  /** A culture is a state's "heartland" at >= this share of state pop. */
  heartlandShare: 0.35,
  /**
   * Radicalism monthly drift terms. Negative base means a content, calm
   * minority's movement decays — radicalism tracks grievance, not time.
   */
  radicalBase: -0.3,
  radicalPerConsciousness: 0.15,
  radicalPerMilitancy: 0.5,
  radicalNeedsRelief: 2.0,
  radicalPolicy: { exclusionary: 0.8, assimilationist: 0, pluralist: -0.6 } as Record<CulturePolicy, number>,
  /** Monthly radicalism decay once the culture is accepted (movement winds down). */
  radicalAcceptedDecay: 4,
  /** Uprising gate: radicalism floor AND militancy floor. */
  uprisingRadicalism: 85,
  uprisingMilitancy: 4.2,
  /** A movement waits at least this long between its own uprisings. */
  uprisingCooldownDays: 365 * 6,
  /** Radicalism resets to this after an uprising fires. */
  postUprisingRadicalism: 30,
  /** Militancy relief applied to the culture's pops when its uprising fires. */
  postUprisingMilitancyRelief: 0.8,
  /** Max heartland states claimed by one uprising. */
  uprisingMaxStates: 3,
  /** Rebel regiments per this many movement adherents (clamped to BALANCE caps). */
  adherentsPerRegiment: 150_000,
  /** Grant-acceptance effects. */
  acceptPrestigeCost: 8,
  acceptMilitancyRelief: 1.5,
  acceptRadicalismRelief: 40,
  /** Revoke-acceptance effects. */
  revokeMilitancyPenalty: 1,
  revokeRadicalismSpike: 15,
  /** Minimum share of national pop to be allowed to grant acceptance. */
  acceptMinShare: 0.02,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// State bootstrap / self-healing (pre-0.8.0 saves have none of these fields)
// ---------------------------------------------------------------------------

export function ensureCultureState(world: World): void {
  if (!Array.isArray(world.movements)) world.movements = [];
  if (!Number.isFinite(world.nextMovementId)) world.nextMovementId = 1;
  for (const nation of world.nations) {
    if (nation.culturePolicy !== 'exclusionary'
      && nation.culturePolicy !== 'assimilationist'
      && nation.culturePolicy !== 'pluralist') {
      nation.culturePolicy = 'assimilationist';
    }
    if (!nation.assimilationByCulture || typeof nation.assimilationByCulture !== 'object') {
      nation.assimilationByCulture = {};
    }
    if (!Array.isArray(nation.acceptedCultures)) nation.acceptedCultures = [nation.primaryCulture];
  }
}

export function culturePolicyOf(nation: { culturePolicy?: CulturePolicy }): CulturePolicy {
  return nation.culturePolicy ?? 'assimilationist';
}

function isAccepted(world: World, nationId: NationId, culture: number): boolean {
  const nation = world.nations[nationId];
  if (!nation) return false;
  return culture === nation.primaryCulture || nation.acceptedCultures.includes(culture);
}

/** Placeholder map tags get no culture dynamics (they are not real states). */
function cultureDynamicsApply(world: World, nationId: NationId): boolean {
  const nation = world.nations[nationId];
  return Boolean(nation) && nation.government !== 'uncivilized';
}

// ---------------------------------------------------------------------------
// Assimilation
// ---------------------------------------------------------------------------

/**
 * Move `amount` people out of `pop` into the province's primary-culture cohort
 * of the same type (created if missing). Money moves proportionally; the
 * receiving cohort keeps its own militancy/consciousness (assimilated people
 * adopt the majority's temperament).
 */
function assimilatePortion(world: World, pop: Pop, amount: number, targetCulture: number, targetReligion: number): number {
  const moved = Math.max(0, Math.floor(Math.min(pop.size, finite(amount))));
  if (moved <= 0) return 0;
  const province = world.provinces[pop.provinceId];
  if (!province) return 0;
  const sourceSize = Math.max(1, pop.size);
  const moneyShare = pop.money * (moved / sourceSize);
  pop.size -= moved;
  pop.money = Math.max(0, pop.money - moneyShare);

  const targetId = province.popIds.find((popId) => {
    const candidate = world.pops[popId];
    return candidate
      && candidate.type === pop.type
      && candidate.culture === targetCulture
      && candidate.religion === targetReligion;
  });
  if (targetId !== undefined) {
    const target = world.pops[targetId];
    target.size += moved;
    target.money += moneyShare;
    return moved;
  }
  const created: Pop = {
    id: world.nextPopId++,
    type: pop.type,
    provinceId: pop.provinceId,
    size: moved,
    culture: targetCulture,
    religion: targetReligion,
    money: moneyShare,
    militancy: Math.max(0, pop.militancy - 1),
    consciousness: pop.consciousness,
    needsMet: pop.needsMet,
    lastGrowth: 0,
    ideology: pop.ideology,
  };
  world.pops.push(created);
  province.popIds.push(created.id);
  return moved;
}

// ---------------------------------------------------------------------------
// Monthly pass
// ---------------------------------------------------------------------------

interface CultureAggregate {
  size: number;
  militancy: number;   // size-weighted sum, divide by size for avg
  consciousness: number;
  needsMet: number;
}

export function runCultureMonthly(world: World, data: GameData, _rng: Rng): void {
  ensureCultureState(world);

  // --- per-province primary-culture share + dominant primary religion ------
  const provincePrimaryShare = new Float64Array(world.provinces.length);
  const provincePrimaryReligion = new Int32Array(world.provinces.length).fill(-1);
  {
    const religionSize = new Map<number, number>(); // religion of primary-culture pops per province (scratch)
    for (const province of world.provinces) {
      const nation = world.nations[province.owner];
      if (!nation) continue;
      let total = 0;
      let acceptedSize = 0;
      religionSize.clear();
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        total += pop.size;
        if (pop.culture === nation.primaryCulture || nation.acceptedCultures.includes(pop.culture)) {
          acceptedSize += pop.size;
          if (pop.culture === nation.primaryCulture) {
            religionSize.set(pop.religion, (religionSize.get(pop.religion) ?? 0) + pop.size);
          }
        }
      }
      provincePrimaryShare[province.id] = total > 0 ? acceptedSize / total : 0;
      let bestReligion = -1;
      let bestSize = -1;
      for (const [religion, size] of religionSize) {
        if (size > bestSize || (size === bestSize && religion < bestReligion)) {
          bestSize = size;
          bestReligion = religion;
        }
      }
      provincePrimaryReligion[province.id] = bestReligion;
    }
  }

  // National religion proxy: religion of the largest primary-culture pop mass.
  const nationReligion = new Map<NationId, number>();
  {
    const perNation = new Map<NationId, Map<number, number>>();
    for (const pop of world.pops) {
      if (pop.size <= 0) continue;
      const province = world.provinces[pop.provinceId];
      const nation = province ? world.nations[province.owner] : undefined;
      if (!province || !nation || pop.culture !== nation.primaryCulture) continue;
      let byReligion = perNation.get(nation.id);
      if (!byReligion) perNation.set(nation.id, byReligion = new Map());
      byReligion.set(pop.religion, (byReligion.get(pop.religion) ?? 0) + pop.size);
    }
    for (const [nationId, byReligion] of perNation) {
      let best = -1;
      let bestSize = -1;
      for (const [religion, size] of byReligion) {
        if (size > bestSize || (size === bestSize && religion < best)) {
          bestSize = size;
          best = religion;
        }
      }
      nationReligion.set(nationId, best);
    }
  }

  // --- pass over pops: penalties + assimilation + per-culture aggregation --
  // Aggregates keyed per nation: culture -> aggregate; also nation totals.
  const aggregates = new Map<NationId, Map<number, CultureAggregate>>();
  const nationPop = new Map<NationId, number>();
  const assimilated = new Map<NationId, Map<number, number>>();
  const movementByKey = new Map<string, NationalMovement>();
  for (const movement of world.movements!) movementByKey.set(`${movement.nation}:${movement.culture}`, movement);

  const monthStartPopCount = world.pops.length; // new cohorts skip this month
  for (let popIndex = 0; popIndex < monthStartPopCount; popIndex++) {
    const pop = world.pops[popIndex];
    if (!pop || pop.size <= 0) continue;
    const province = world.provinces[pop.provinceId];
    if (!province) continue;
    const nationId = province.owner;
    const nation = world.nations[nationId];
    if (!nation) continue;

    nationPop.set(nationId, (nationPop.get(nationId) ?? 0) + pop.size);
    let byCulture = aggregates.get(nationId);
    if (!byCulture) aggregates.set(nationId, byCulture = new Map());
    let agg = byCulture.get(pop.culture);
    if (!agg) byCulture.set(pop.culture, agg = { size: 0, militancy: 0, consciousness: 0, needsMet: 0 });
    agg.size += pop.size;
    agg.militancy += pop.militancy * pop.size;
    agg.consciousness += pop.consciousness * pop.size;
    agg.needsMet += pop.needsMet * pop.size;

    if (!cultureDynamicsApply(world, nationId)) continue;
    if (isAccepted(world, nationId, pop.culture)) continue;

    const policy = culturePolicyOf(nation);
    const stateReligion = nationReligion.get(nationId) ?? -1;
    const religionDiffers = stateReligion >= 0 && pop.religion !== stateReligion;

    // 1. resentment: second-class subjects simmer.
    const militancyAccrual = CULTURE_TUNING.militancyPolicy[policy]
      * (religionDiffers ? CULTURE_TUNING.militancyReligionFactor : 1);
    pop.militancy = clamp(pop.militancy + militancyAccrual, 0, 10);
    pop.consciousness = clamp(pop.consciousness + CULTURE_TUNING.consciousnessAccrual, 0, 10);

    // 2. assimilation toward the primary culture.
    const movement = movementByKey.get(`${nationId}:${pop.culture}`);
    const movementResistance = movement ? clamp(1 - movement.radicalism / 110, 0.05, 1) : 1;
    const primaryShare = provincePrimaryShare[province.id];
    // Isolated diasporas melt; solid homelands endure (superlinear in share).
    const surroundFactor = Math.pow(clamp(primaryShare, 0, 1), 1.5);
    const literacyFactor = 0.5 + clamp(nation.literacy, 0, 1);
    const religionFactor = religionDiffers ? CULTURE_TUNING.assimilationReligionPenalty : 1;
    const rate = CULTURE_TUNING.assimilationBase
      * surroundFactor
      * literacyFactor
      * CULTURE_TUNING.assimilationPolicy[policy]
      * religionFactor
      * movementResistance;
    const amount = Math.floor(pop.size * rate);
    if (amount > 0) {
      const targetReligion = provincePrimaryReligion[province.id] >= 0
        ? provincePrimaryReligion[province.id]
        : (stateReligion >= 0 ? stateReligion : pop.religion);
      const moved = assimilatePortion(world, pop, amount, nation.primaryCulture, targetReligion);
      if (moved > 0) {
        let byC = assimilated.get(nationId);
        if (!byC) assimilated.set(nationId, byC = new Map());
        byC.set(pop.culture, (byC.get(pop.culture) ?? 0) + moved);
      }
    }
  }

  // publish assimilation trace (per nation, per culture)
  for (const nation of world.nations) {
    const byC = assimilated.get(nation.id);
    nation.assimilationByCulture = byC ? Object.fromEntries(byC) : {};
  }

  // --- movements: form, drift, dissolve, rebel ------------------------------
  updateMovements(world, data, aggregates, nationPop);
}

// ---------------------------------------------------------------------------
// National movements
// ---------------------------------------------------------------------------

/** States (owned by the nation) where the culture is >= heartland share. */
function heartlandStatesFor(world: World, nationId: NationId, culture: number): number[] {
  const result: number[] = [];
  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    let total = 0;
    let cultureSize = 0;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        total += pop.size;
        if (pop.culture === culture) cultureSize += pop.size;
      }
    }
    if (total > 0 && cultureSize / total >= CULTURE_TUNING.heartlandShare) result.push(state.id);
  }
  return result;
}

function updateMovements(
  world: World,
  data: GameData,
  aggregates: Map<NationId, Map<number, CultureAggregate>>,
  nationPop: Map<NationId, number>,
): void {
  const movements = world.movements!;

  // Drift + dissolve existing movements (stable order: by id).
  for (const movement of movements) {
    const nation = world.nations[movement.nation];
    const byCulture = aggregates.get(movement.nation);
    const agg = byCulture?.get(movement.culture);
    if (!nation || !cultureDynamicsApply(world, movement.nation) || !agg || agg.size <= 0) {
      movement.radicalism = -1; // culture gone (assimilated / seceded) -> cull
      continue;
    }
    const avgMil = agg.militancy / agg.size;
    const avgCon = agg.consciousness / agg.size;
    const avgNeeds = agg.needsMet / agg.size;
    movement.adherents = agg.size;
    movement.militancy = avgMil;
    movement.consciousness = avgCon;
    movement.heartlandStateIds = heartlandStatesFor(world, movement.nation, movement.culture);

    if (isAccepted(world, movement.nation, movement.culture)) {
      movement.radicalism -= CULTURE_TUNING.radicalAcceptedDecay;
      continue;
    }
    const policy = culturePolicyOf(nation);
    const delta = CULTURE_TUNING.radicalBase
      + avgCon * CULTURE_TUNING.radicalPerConsciousness
      + avgMil * CULTURE_TUNING.radicalPerMilitancy
      + CULTURE_TUNING.radicalPolicy[policy]
      - avgNeeds * CULTURE_TUNING.radicalNeedsRelief;
    movement.radicalism = clamp(movement.radicalism + delta, 0, 100);
  }
  // Cull dissolved movements (radicalism dropped to/below zero while accepted, or culture gone).
  world.movements = movements.filter((movement) => movement.radicalism > 0
    || (!isAccepted(world, movement.nation, movement.culture) && movement.radicalism === 0));
  const live = world.movements;

  // Form new movements (deterministic order: nation id, then culture index).
  const nationIds = Array.from(aggregates.keys()).sort((a, b) => a - b);
  for (const nationId of nationIds) {
    if (!cultureDynamicsApply(world, nationId)) continue;
    const total = nationPop.get(nationId) ?? 0;
    if (total <= 0) continue;
    const byCulture = aggregates.get(nationId)!;
    const cultures = Array.from(byCulture.keys()).sort((a, b) => a - b);
    for (const culture of cultures) {
      if (isAccepted(world, nationId, culture)) continue;
      if (live.some((movement) => movement.nation === nationId && movement.culture === culture)) continue;
      const agg = byCulture.get(culture)!;
      if (agg.size / total < CULTURE_TUNING.movementMinShare) continue;
      if (agg.consciousness / agg.size < CULTURE_TUNING.movementMinConsciousness) continue;
      const heartland = heartlandStatesFor(world, nationId, culture);
      if (heartland.length === 0) continue;
      live.push({
        id: world.nextMovementId!++,
        nation: nationId,
        culture,
        startDay: world.day,
        radicalism: 1,
        heartlandStateIds: heartland,
        adherents: agg.size,
        militancy: agg.militancy / agg.size,
        consciousness: agg.consciousness / agg.size,
        lastUprisingDay: -1,
      });
    }
  }

  // Boiling movements rebel (respecting every BALANCE.rebellion cap).
  for (const movement of live) {
    maybeLaunchUprising(world, data, movement);
  }
}

/**
 * Launch an independence rebellion for a boiling movement. Mirrors the
 * constraint envelope of the reform-rebellion spawner (politics.ts): world and
 * per-nation active caps, per-state cooldowns, no duplicate demands. The
 * rebellion itself is then driven entirely by the existing war.ts machinery
 * (rebel combat, hold progress, enforcement -> new nation with this culture).
 */
function maybeLaunchUprising(world: World, data: GameData, movement: NationalMovement): void {
  if (movement.radicalism < CULTURE_TUNING.uprisingRadicalism) return;
  if (movement.militancy < CULTURE_TUNING.uprisingMilitancy) return;
  if (movement.lastUprisingDay >= 0
    && world.day - movement.lastUprisingDay < CULTURE_TUNING.uprisingCooldownDays) return;
  if (isAccepted(world, movement.nation, movement.culture)) return;

  const activeRebellions = world.rebellions.filter((rebellion) => rebellion.status === 'active');
  if (activeRebellions.length >= BALANCE.rebellion.worldActiveCap) return;
  if (activeRebellions.filter((rebellion) => rebellion.targetNation === movement.nation).length
    >= BALANCE.rebellion.nationActiveCap) return;
  if (activeRebellions.some((rebellion) => rebellion.targetNation === movement.nation
    && rebellion.demand.type === 'independence'
    && rebellion.demand.culture === movement.culture)) return;

  // Heartland states off rebellion cooldown, ranked by culture share.
  const eligible = movement.heartlandStateIds
    .map((stateId) => world.states[stateId])
    .filter((state) => state
      && state.owner === movement.nation
      && world.day - state.lastRebellionDay >= BALANCE.rebellion.stateCooldownDays);
  if (eligible.length === 0) return;
  const ranked = eligible
    .map((state) => {
      let total = 0;
      let cultureSize = 0;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        for (const popId of province.popIds) {
          const pop = world.pops[popId];
          if (!pop || pop.size <= 0) continue;
          total += pop.size;
          if (pop.culture === movement.culture) cultureSize += pop.size;
        }
      }
      return { state, share: total > 0 ? cultureSize / total : 0 };
    })
    .sort((a, b) => b.share - a.share || a.state.id - b.state.id);
  const claimed = ranked.slice(0, CULTURE_TUNING.uprisingMaxStates).map((entry) => entry.state);
  const origin = claimed[0];
  const originProvince = world.provinces[origin.provinceIds[0] ?? -1];
  if (!originProvince) return;

  const cultureName = data.cultures[movement.culture]?.name ?? `Culture ${movement.culture}`;
  const demand = {
    type: 'independence' as const,
    description: `${cultureName} independence`,
    culture: movement.culture,
    stateIds: claimed.map((state) => state.id),
  };
  const rebellionId = world.nextRebellionId++;
  world.rebellions.push({
    id: rebellionId,
    targetNation: movement.nation,
    originState: origin.id,
    startDay: world.day,
    progress: 0,
    holdDays: 0,
    status: 'active',
    demand,
  });
  const regimentCount = clamp(
    1 + Math.floor(movement.adherents / CULTURE_TUNING.adherentsPerRegiment),
    BALANCE.rebellion.spawnRegimentMin,
    BALANCE.rebellion.spawnRegimentMax,
  );
  const sourcePop = originProvince.popIds.find((popId) => (world.pops[popId]?.size ?? 0) > 0) ?? 0;
  world.armies.push({
    id: world.nextArmyId++,
    owner: -1,
    location: originProvince.id,
    moveTarget: -1,
    moveProgress: 0,
    regiments: Array.from({ length: regimentCount }, () => ({
      type: 'infantry' as const,
      strength: 900,
      organization: 45,
      sourcePop,
    })),
    leader: { name: `${cultureName} National Committee`, attack: 1, defense: 1, trait: 'nationalist' },
    rebel: true,
    hostileTo: movement.nation,
    rebellionId,
    rebelDemand: demand,
  });
  for (const state of claimed) {
    state.lastRebellionDay = world.day;
    state.unrestRisk = clamp(state.unrestRisk * BALANCE.rebellion.postSpawnUnrestMultiplier, 0, 2);
    state.unrestMonths = 0;
  }
  // The angry march off to fight; the street cools a little.
  for (const state of claimed) {
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0 || pop.culture !== movement.culture) continue;
        pop.militancy = clamp(pop.militancy - CULTURE_TUNING.postUprisingMilitancyRelief, 0, 10);
      }
    }
  }
  movement.radicalism = CULTURE_TUNING.postUprisingRadicalism;
  movement.lastUprisingDay = world.day;
}

// ---------------------------------------------------------------------------
// Commands (called from commands.ts on the player nation)
// ---------------------------------------------------------------------------

export function setCulturePolicy(world: World, nationId: NationId, policy: CulturePolicy): void {
  ensureCultureState(world);
  const nation = world.nations[nationId];
  if (!nation) return;
  if (policy !== 'exclusionary' && policy !== 'assimilationist' && policy !== 'pluralist') return;
  nation.culturePolicy = policy;
}

export interface AcceptanceResult {
  ok: boolean;
  reason: string;
}

export function setCultureAccepted(world: World, data: GameData, nationId: NationId, culture: number, accepted: boolean): AcceptanceResult {
  ensureCultureState(world);
  const nation = world.nations[nationId];
  if (!nation || !data.cultures[culture]) return { ok: false, reason: 'Unknown culture.' };
  if (culture === nation.primaryCulture) return { ok: false, reason: 'The primary culture is always accepted.' };
  const already = nation.acceptedCultures.includes(culture);
  if (accepted === already) return { ok: false, reason: accepted ? 'Already accepted.' : 'Not currently accepted.' };

  if (accepted) {
    // Gate: the culture must be a real community inside the nation.
    let total = 0;
    let cultureSize = 0;
    for (const pop of world.pops) {
      if (pop.size <= 0) continue;
      const province = world.provinces[pop.provinceId];
      if (!province || province.owner !== nationId) continue;
      total += pop.size;
      if (pop.culture === culture) cultureSize += pop.size;
    }
    if (total <= 0 || cultureSize / total < CULTURE_TUNING.acceptMinShare) {
      return { ok: false, reason: 'Too few people of this culture live in the nation.' };
    }
    nation.acceptedCultures = Array.from(new Set([...nation.acceptedCultures, culture])).sort((a, b) => a - b);
    nation.prestige = Math.max(0, nation.prestige - CULTURE_TUNING.acceptPrestigeCost);
    for (const pop of world.pops) {
      if (pop.size <= 0 || pop.culture !== culture) continue;
      const province = world.provinces[pop.provinceId];
      if (!province || province.owner !== nationId) continue;
      pop.militancy = clamp(pop.militancy - CULTURE_TUNING.acceptMilitancyRelief, 0, 10);
    }
    for (const movement of world.movements!) {
      if (movement.nation === nationId && movement.culture === culture) {
        movement.radicalism = clamp(movement.radicalism - CULTURE_TUNING.acceptRadicalismRelief, 0, 100);
      }
    }
    return { ok: true, reason: `${data.cultures[culture].name} culture granted full acceptance.` };
  }

  nation.acceptedCultures = nation.acceptedCultures.filter((entry) => entry !== culture);
  for (const pop of world.pops) {
    if (pop.size <= 0 || pop.culture !== culture) continue;
    const province = world.provinces[pop.provinceId];
    if (!province || province.owner !== nationId) continue;
    pop.militancy = clamp(pop.militancy + CULTURE_TUNING.revokeMilitancyPenalty, 0, 10);
  }
  for (const movement of world.movements!) {
    if (movement.nation === nationId && movement.culture === culture) {
      movement.radicalism = clamp(movement.radicalism + CULTURE_TUNING.revokeRadicalismSpike, 0, 100);
    }
  }
  return { ok: true, reason: `${data.cultures[culture].name} culture stripped of acceptance.` };
}

// ---------------------------------------------------------------------------
// Snapshot views (read-only; consumed by snapshot.ts)
// ---------------------------------------------------------------------------

export function buildCultureLedger(world: World, data: GameData, nationId: NationId): CultureLedgerEntry[] {
  const nation = world.nations[nationId];
  if (!nation) return [];
  const byCulture = new Map<number, CultureAggregate>();
  let total = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0) continue;
    const province = world.provinces[pop.provinceId];
    if (!province || province.owner !== nationId) continue;
    total += pop.size;
    let agg = byCulture.get(pop.culture);
    if (!agg) byCulture.set(pop.culture, agg = { size: 0, militancy: 0, consciousness: 0, needsMet: 0 });
    agg.size += pop.size;
    agg.militancy += pop.militancy * pop.size;
    agg.consciousness += pop.consciousness * pop.size;
    agg.needsMet += pop.needsMet * pop.size;
  }
  const assimilationTrace = nation.assimilationByCulture ?? {};
  return Array.from(byCulture.entries())
    .map(([culture, agg]) => {
      const def = data.cultures[culture];
      const primary = culture === nation.primaryCulture;
      const accepted = primary || nation.acceptedCultures.includes(culture);
      return {
        culture,
        key: def?.key ?? `culture_${culture}`,
        name: def?.name ?? `Culture ${culture}`,
        size: agg.size,
        share: total > 0 ? agg.size / total : 0,
        primary,
        accepted,
        avgMilitancy: agg.size > 0 ? agg.militancy / agg.size : 0,
        avgConsciousness: agg.size > 0 ? agg.consciousness / agg.size : 0,
        assimilatedLastMonth: primary ? 0 : (assimilationTrace[culture] ?? 0),
        canAccept: !accepted && total > 0 && agg.size / total >= CULTURE_TUNING.acceptMinShare,
      };
    })
    .sort((a, b) => b.size - a.size);
}

export function buildMovementViews(world: World, data: GameData, nationId: NationId): MovementView[] {
  return (world.movements ?? [])
    .filter((movement) => movement.nation === nationId)
    .map((movement) => ({
      id: movement.id,
      culture: movement.culture,
      cultureName: data.cultures[movement.culture]?.name ?? `Culture ${movement.culture}`,
      radicalism: movement.radicalism,
      adherents: movement.adherents,
      militancy: movement.militancy,
      consciousness: movement.consciousness,
      heartlandStateIds: movement.heartlandStateIds.slice(),
      heartlandNames: movement.heartlandStateIds
        .map((stateId) => world.states[stateId]?.name ?? `State ${stateId}`),
      boiling: movement.radicalism >= CULTURE_TUNING.uprisingRadicalism * 0.85,
    }))
    .sort((a, b) => b.radicalism - a.radicalism);
}
