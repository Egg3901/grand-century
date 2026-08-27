/**
 * 0.6.0 — Research & Inventions ("The Inventive Century").
 *
 * Monthly system. For every nation:
 *   1. Generate research points (literacy-driven, boosted by culture/commerce
 *      tech via the researchRate modifier).
 *   2. Ensure a research target: AI nations pick one with the ported 0.5-era
 *      weighting (war posture + ruling-party bias); any nation — including the
 *      player — auto-picks the cheapest available tech once its banked points
 *      pile up to 1.5x that cost, so nobody stagnates unattended.
 *   3. Sink banked points into the current tech; complete it when paid off.
 *   4. Roll inventions whose prerequisite tech is researched (deterministic
 *      rng, literacy-scaled chance).
 *   5. Apply the slow modifier drips (literacy growth, prestige).
 *
 * Tech + invention modifiers are aggregated here into a `TechModifiers`
 * record consumed by economy.ts (throughput), budget.ts (tax efficiency) and
 * this file (research rate). Pure logic — runs identically in the web worker
 * and the Node multiplayer server.
 */

import type {
  GameData,
  Nation,
  NationId,
  PlayerTechView,
  ResearchPointBreakdown,
  TechDef,
  TechModifiers,
  World,
} from '../../shared/types';
import type { Rng } from '../rng';
import { partyByKey } from '../politics';
import { getInfamyLimit } from './diplomacy';

/** Same no-leap-year clock as world.ts / events.ts (kept local: no cycle). */
const EPOCH_YEAR = 1830;
function currentYear(day: number): number {
  return EPOCH_YEAR + Math.floor(day / 365);
}

export const RESEARCH_POINT_CAP = 10_000;
/** Banked-points multiple of the cheapest available tech that triggers auto-pick. */
const AUTO_PICK_BANK_RATIO = 1.5;

export const ZERO_TECH_MODIFIERS: TechModifiers = Object.freeze({
  factoryThroughput: 0,
  rgoThroughput: 0,
  taxEfficiency: 0,
  researchRate: 0,
  literacyRate: 0,
  prestigeMonthly: 0,
  popGrowth: 0,
  armyMovement: 0,
  supplyRange: 0,
  factoryProfit: 0,
  tradeEfficiency: 0,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Modifier aggregation (cached per nation; invalidated when tech/invention
// counts change — both lists are append-only during play).
// ---------------------------------------------------------------------------

interface ModifierCacheEntry {
  techCount: number;
  inventionCount: number;
  modifiers: TechModifiers;
}

const modifierCache = new WeakMap<Nation, ModifierCacheEntry>();

function addModifiers(total: TechModifiers, partial?: Partial<TechModifiers>): void {
  if (!partial) return;
  total.factoryThroughput += partial.factoryThroughput ?? 0;
  total.rgoThroughput += partial.rgoThroughput ?? 0;
  total.taxEfficiency += partial.taxEfficiency ?? 0;
  total.researchRate += partial.researchRate ?? 0;
  total.literacyRate += partial.literacyRate ?? 0;
  total.prestigeMonthly += partial.prestigeMonthly ?? 0;
  total.popGrowth = (total.popGrowth ?? 0) + (partial.popGrowth ?? 0);
  total.armyMovement = (total.armyMovement ?? 0) + (partial.armyMovement ?? 0);
  total.supplyRange = (total.supplyRange ?? 0) + (partial.supplyRange ?? 0);
  total.factoryProfit = (total.factoryProfit ?? 0) + (partial.factoryProfit ?? 0);
  total.tradeEfficiency = (total.tradeEfficiency ?? 0) + (partial.tradeEfficiency ?? 0);
}

/** Aggregate tech + invention modifiers for a nation. Cheap and cached. */
export function techModifiersFor(nation: Nation, data: GameData): TechModifiers {
  const inventions = nation.inventions ?? [];
  const cached = modifierCache.get(nation);
  if (cached && cached.techCount === nation.techs.length && cached.inventionCount === inventions.length) {
    return cached.modifiers;
  }
  const total: TechModifiers = {
    factoryThroughput: 0,
    rgoThroughput: 0,
    taxEfficiency: 0,
    researchRate: 0,
    literacyRate: 0,
    prestigeMonthly: 0,
    popGrowth: 0,
    armyMovement: 0,
    supplyRange: 0,
    factoryProfit: 0,
    tradeEfficiency: 0,
  };
  const techSet = new Set(nation.techs);
  for (const tech of data.techs) {
    if (techSet.has(tech.key)) addModifiers(total, tech.modifiers);
  }
  if (inventions.length > 0 && data.inventions) {
    const owned = new Set(inventions);
    for (const invention of data.inventions) {
      if (owned.has(invention.key)) addModifiers(total, invention.modifiers);
    }
  }
  modifierCache.set(nation, { techCount: nation.techs.length, inventionCount: inventions.length, modifiers: total });
  return total;
}

// ---------------------------------------------------------------------------
// Availability & recipe gating
// ---------------------------------------------------------------------------

export interface TechAvailability {
  available: boolean;
  reason: string;
}

export function techAvailability(nation: Nation, data: GameData, tech: TechDef, year: number): TechAvailability {
  if (nation.techs.includes(tech.key)) return { available: false, reason: 'Already researched' };
  if (tech.prereq && !nation.techs.includes(tech.prereq)) {
    const prereqDef = data.techs.find((candidate) => candidate.key === tech.prereq);
    return { available: false, reason: `Requires ${prereqDef?.name ?? tech.prereq}` };
  }
  if (tech.year !== undefined && year < tech.year) {
    return { available: false, reason: `Not before ${tech.year}` };
  }
  return { available: true, reason: '' };
}

export function availableTechsFor(nation: Nation, data: GameData, year: number): TechDef[] {
  return data.techs.filter((tech) => techAvailability(nation, data, tech, year).available);
}

/** Is this recipe buildable by the nation (tech gate)? Coastal gate is separate. */
export function isRecipeUnlocked(nation: Nation, recipe: { requiresTech?: string }): boolean {
  if (!recipe.requiresTech) return true;
  return nation.techs.includes(recipe.requiresTech);
}

// ---------------------------------------------------------------------------
// Point generation & AI target selection
// ---------------------------------------------------------------------------

const RESEARCH_FLAT_BASE = 1.4;
const RESEARCH_LITERACY_WEIGHT = 4.8;
const RESEARCH_GP_BONUS = 1.5;

/** Formula parts behind monthly research point gain (display + sim). */
export function researchPointBreakdown(nation: Nation, data: GameData): ResearchPointBreakdown {
  const literacy = clamp(nation.literacy, 0, 1);
  const literacyBonus = literacy * RESEARCH_LITERACY_WEIGHT;
  const gpBonus = nation.gpRank > 0 ? RESEARCH_GP_BONUS : 0;
  const base = RESEARCH_FLAT_BASE + literacyBonus + gpBonus;
  const researchRate = Math.max(0, techModifiersFor(nation, data).researchRate);
  return {
    flatBase: RESEARCH_FLAT_BASE,
    literacy,
    literacyBonus,
    gpBonus,
    base,
    researchRate,
    monthly: base * (1 + researchRate),
  };
}

/** Monthly research point gain (pre-0.6.0 formula, scaled by researchRate). */
export function researchPointsPerMonth(nation: Nation, data: GameData): number {
  return researchPointBreakdown(nation, data).monthly;
}

function nationAtWar(world: World, nationId: NationId): boolean {
  return world.wars.some((war) => war.attackers.includes(nationId) || war.defenders.includes(nationId));
}

function partyTechBias(category: TechDef['category'], ideology: string): number {
  if (ideology === 'reactionary' || ideology === 'fascist') {
    if (category === 'army' || category === 'navy') return 1.1;
    if (category === 'culture') return 0.3;
  }
  if (ideology === 'liberal') {
    if (category === 'commerce' || category === 'industry') return 0.9;
  }
  if (ideology === 'socialist' || ideology === 'communist') {
    if (category === 'industry') return 0.9;
    if (category === 'army') return 0.4;
  }
  if (ideology === 'conservative') {
    if (category === 'commerce' || category === 'culture') return 0.45;
  }
  return 0;
}

function pickAiResearch(world: World, data: GameData, nation: Nation, year: number, rng: Rng): string | null {
  const available = availableTechsFor(nation, data, year);
  if (available.length === 0) return null;
  const atWar = nationAtWar(world, nation.id);
  const aggressive = atWar || nation.infamy > getInfamyLimit() * 0.65;
  const party = partyByKey(nation, nation.rulingParty);
  const ideology = party?.ideology ?? 'conservative';
  const weights = available.map((tech) => {
    let weight = 1;
    if (atWar) {
      if (tech.category === 'army' || tech.category === 'navy') weight += 1.8;
    } else if (aggressive) {
      if (tech.category === 'army' || tech.category === 'navy') weight += 1.2;
      if (tech.category === 'industry') weight += 0.45;
    } else {
      if (tech.category === 'industry' || tech.category === 'commerce') weight += 1.35;
    }
    if (nation.gpRank > 0 && tech.category === 'culture') weight += 0.4;
    weight += partyTechBias(tech.category, ideology);
    return weight;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll > 0 && i < available.length - 1) continue;
    return available[i].key;
  }
  return available[available.length - 1]?.key ?? null;
}

// ---------------------------------------------------------------------------
// Monthly tick
// ---------------------------------------------------------------------------

function completeTech(nation: Nation, techKey: string): void {
  if (!nation.techs.includes(techKey)) nation.techs.push(techKey);
  nation.currentResearch = null;
  nation.researchProgress = 0;
}

function rollInventions(nation: Nation, data: GameData, rng: Rng): void {
  const defs = data.inventions;
  if (!defs || defs.length === 0) return;
  if (!nation.inventions) nation.inventions = [];
  const owned = new Set(nation.inventions);
  const techSet = new Set(nation.techs);
  const literacyScale = 0.5 + clamp(nation.literacy, 0, 1);
  for (const invention of defs) {
    if (owned.has(invention.key)) continue;
    if (!techSet.has(invention.prereqTech)) continue;
    // Deterministic: one rng draw per eligible invention, fixed data order.
    if (rng.next() < invention.monthlyChance * literacyScale) {
      nation.inventions.push(invention.key);
      owned.add(invention.key);
    }
  }
}

function tickNationResearch(world: World, data: GameData, nation: Nation, year: number, rng: Rng): void {
  // 1. Point generation.
  const gain = researchPointsPerMonth(nation, data);
  nation.researchPoints = clamp(nation.researchPoints + gain, 0, RESEARCH_POINT_CAP);
  nation.researchProgress = Math.max(0, nation.researchProgress ?? 0);

  // Drop a stale target (e.g. granted by an event or a formable merge).
  if (nation.currentResearch && nation.techs.includes(nation.currentResearch)) {
    nation.currentResearch = null;
    nation.researchProgress = 0;
  }

  // 2. Target selection.
  if (!nation.currentResearch) {
    if (!nation.isPlayer) {
      nation.currentResearch = pickAiResearch(world, data, nation, year, rng) ?? null;
    } else {
      // Player idles by choice — but never forever: once the bank piles up to
      // 1.5x the cheapest available tech, start it automatically.
      const cheapest = availableTechsFor(nation, data, year)
        .reduce<TechDef | null>((best, tech) => (best === null || tech.cost < best.cost ? tech : best), null);
      if (cheapest && nation.researchPoints >= cheapest.cost * AUTO_PICK_BANK_RATIO) {
        nation.currentResearch = cheapest.key;
      }
    }
  }

  // 3. Sink points into the current target.
  if (nation.currentResearch) {
    const tech = data.techs.find((candidate) => candidate.key === nation.currentResearch);
    if (!tech) {
      nation.currentResearch = null;
      nation.researchProgress = 0;
    } else {
      const need = Math.max(0, tech.cost - (nation.researchProgress ?? 0));
      const transfer = Math.min(nation.researchPoints, need);
      nation.researchProgress = (nation.researchProgress ?? 0) + transfer;
      nation.researchPoints -= transfer;
      if ((nation.researchProgress ?? 0) >= tech.cost) completeTech(nation, tech.key);
    }
  }

  // 4. Inventions.
  rollInventions(nation, data, rng);

  // 5. Modifier drips. Literacy soft-lands like politics schools: rate × (1−lit).
  const modifiers = techModifiersFor(nation, data);
  if (modifiers.literacyRate > 0) {
    const literacyGain = modifiers.literacyRate * (1 - clamp(nation.literacy, 0, 1));
    nation.literacy = clamp(nation.literacy + literacyGain, 0, 0.98);
  }
  if (modifiers.prestigeMonthly > 0) {
    nation.prestige = clamp(nation.prestige + modifiers.prestigeMonthly, 0, 10_000);
  }
}

export function runResearchMonthly(world: World, data: GameData, rng: Rng): void {
  const year = currentYear(world.day);
  for (const nation of world.nations) {
    tickNationResearch(world, data, nation, year, rng);
  }
}

// ---------------------------------------------------------------------------
// Command support (setResearch)
// ---------------------------------------------------------------------------

export interface SetResearchResult {
  ok: boolean;
  reason: string;
}

export function setNationResearch(world: World, data: GameData, nationId: NationId, techKey: string | null): SetResearchResult {
  const nation = world.nations[nationId];
  if (!nation) return { ok: false, reason: 'Unknown nation.' };
  if (techKey === null) {
    // Halting refunds sunk progress into the bank — no points are ever lost.
    nation.researchPoints = Math.min(RESEARCH_POINT_CAP, nation.researchPoints + Math.max(0, nation.researchProgress ?? 0));
    nation.researchProgress = 0;
    nation.currentResearch = null;
    return { ok: true, reason: 'Research halted; progress banked as points.' };
  }
  const tech = data.techs.find((candidate) => candidate.key === techKey);
  if (!tech) return { ok: false, reason: `Unknown technology '${techKey}'.` };
  const year = currentYear(world.day);
  const availability = techAvailability(nation, data, tech, year);
  if (!availability.available) return { ok: false, reason: availability.reason };
  if (nation.currentResearch !== tech.key) {
    // Switching refunds any progress sunk into the previous project.
    nation.researchPoints = Math.min(RESEARCH_POINT_CAP, nation.researchPoints + Math.max(0, nation.researchProgress ?? 0));
    nation.currentResearch = tech.key;
    nation.researchProgress = 0;
  }
  return { ok: true, reason: `Now researching ${tech.name}.` };
}

// ---------------------------------------------------------------------------
// Snapshot view (Technology panel)
// ---------------------------------------------------------------------------

function summarizeModifiers(partial?: Partial<TechModifiers>): string[] {
  if (!partial) return [];
  const parts: string[] = [];
  const pct = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  if (partial.factoryThroughput) parts.push(`${pct(partial.factoryThroughput)} factory throughput`);
  if (partial.rgoThroughput) parts.push(`${pct(partial.rgoThroughput)} RGO throughput`);
  if (partial.taxEfficiency) parts.push(`${pct(partial.taxEfficiency)} tax efficiency`);
  if (partial.researchRate) parts.push(`${pct(partial.researchRate)} research`);
  if (partial.literacyRate) parts.push('+literacy growth');
  if (partial.prestigeMonthly) parts.push(`+${partial.prestigeMonthly.toFixed(1)} prestige/mo`);
  if (partial.popGrowth) parts.push('+pop growth');
  if (partial.armyMovement) parts.push(`${pct(partial.armyMovement)} army movement`);
  if (partial.supplyRange) parts.push(`+${partial.supplyRange.toFixed(1)} supply range`);
  if (partial.factoryProfit) parts.push(`${pct(partial.factoryProfit)} factory profit`);
  if (partial.tradeEfficiency) parts.push(`${pct(partial.tradeEfficiency)} tariff yield`);
  return parts;
}

export function buildPlayerTechView(world: World, data: GameData, nationId: NationId): PlayerTechView {
  const nation = world.nations[nationId];
  if (!nation) {
    return {
      researchPoints: 0,
      monthlyResearch: 0,
      researchBreakdown: {
        flatBase: RESEARCH_FLAT_BASE,
        literacy: 0,
        literacyBonus: 0,
        gpBonus: 0,
        base: RESEARCH_FLAT_BASE,
        researchRate: 0,
        monthly: RESEARCH_FLAT_BASE,
      },
      modifiers: { ...ZERO_TECH_MODIFIERS },
      current: null,
      progress: 0,
      currentCost: 0,
      techs: [],
      inventions: [],
      statuses: [],
      inventionStatuses: [],
    };
  }
  const year = currentYear(world.day);
  const techSet = new Set(nation.techs);
  const techNameByKey = new Map(data.techs.map((tech) => [tech.key, tech.name]));
  const recipeNameByKey = new Map(data.recipes.map((recipe) => [recipe.key, recipe.name]));
  const breakdown = researchPointBreakdown(nation, data);
  const monthly = breakdown.monthly;
  const modifiers = techModifiersFor(nation, data);
  const banked = Math.max(0, nation.researchPoints);
  const statuses = data.techs.map((tech) => {
    const researched = techSet.has(tech.key);
    const availability = researched
      ? { available: false, reason: '' }
      : techAvailability(nation, data, tech, year);
    let etaMonths: number | null = null;
    if (!researched && monthly > 0) {
      const isCurrent = nation.currentResearch === tech.key;
      const progress = isCurrent ? Math.max(0, nation.researchProgress ?? 0) : 0;
      const remaining = Math.max(0, tech.cost - progress - (isCurrent || availability.available ? banked : 0));
      etaMonths = Math.max(0, Math.ceil(remaining / monthly));
    }
    return {
      key: tech.key,
      name: tech.name,
      category: tech.category,
      cost: tech.cost,
      year: tech.year ?? EPOCH_YEAR,
      prereq: tech.prereq ?? null,
      prereqName: tech.prereq ? (techNameByKey.get(tech.prereq) ?? tech.prereq) : null,
      researched,
      available: availability.available,
      reason: researched ? '' : availability.reason,
      effectsSummary: tech.effects.slice(),
      unlocksRecipes: (tech.unlocksRecipes ?? []).map((key) => recipeNameByKey.get(key) ?? key),
      etaMonths,
    };
  });
  const inventions = nation.inventions ?? [];
  const owned = new Set(inventions);
  const literacyScale = 0.5 + clamp(nation.literacy, 0, 1);
  const inventionStatuses = (data.inventions ?? []).map((invention) => {
    const isOwned = owned.has(invention.key);
    const prereqMet = techSet.has(invention.prereqTech);
    return {
      key: invention.key,
      name: invention.name,
      description: invention.description,
      prereqTech: techNameByKey.get(invention.prereqTech) ?? invention.prereqTech,
      owned: isOwned,
      prereqMet,
      effectsSummary: summarizeModifiers(invention.modifiers),
      monthlyChance: !isOwned && prereqMet ? invention.monthlyChance * literacyScale : null,
    };
  });
  const currentDef = nation.currentResearch
    ? data.techs.find((tech) => tech.key === nation.currentResearch) ?? null
    : null;
  return {
    researchPoints: banked,
    monthlyResearch: monthly,
    researchBreakdown: breakdown,
    modifiers: { ...modifiers },
    current: currentDef?.key ?? null,
    progress: Math.max(0, nation.researchProgress ?? 0),
    currentCost: currentDef?.cost ?? 0,
    techs: nation.techs.slice(),
    inventions: inventions.slice(),
    statuses,
    inventionStatuses,
  };
}
