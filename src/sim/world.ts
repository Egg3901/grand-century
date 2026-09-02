/**
 * The tick loop and cadence dispatch (master doc §3.1).
 *
 * `advanceDay` is the heart of the sim. It runs the daily systems every day,
 * weekly systems every 7 days, and monthly systems on the 1st. Each system is
 * a pure(ish) function that mutates the World in place. The worker calls
 * `advanceDay` N times per animation frame depending on speed, then builds a
 * snapshot.
 */

import type { GameData, GameDate, GameDay, World, WorldSnapshot } from '../shared/types';
import { Rng } from './rng';
import { beginMarketWeek, runMarketDaily, runMarketWeekly, runStockpileOrders } from './systems/market';
import { runProductionWeekly, settleProductionWeekly } from './systems/economy';
import { runPopsWeekly, runPopsMonthly } from './systems/pops';
import { runPoliticsMonthly } from './systems/politics';
import { runDiplomacyMonthly } from './systems/diplomacy';
import { runWarDaily } from './systems/war';
import { runBudgetMonthly, computePlayerBudget } from './systems/budget';
import { runAiMonthly } from './systems/ai';
import { runEventsMonthly } from './systems/events';
import { runResearchMonthly } from './systems/research';
import { runCrisisMonthly } from './systems/crisis';
import { runCultureMonthly } from './systems/culture';
import { buildSnapshot } from './snapshot';
import { dateAtDay, DEFAULT_START_DATE, firstOfMonth, yearAtDay } from './calendar';

export function dayToDate(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): GameDate {
  return dateAtDay(day, startDate);
}

export function isFirstOfMonth(day: GameDay, startDate: GameDate = DEFAULT_START_DATE): boolean {
  return firstOfMonth(day, startDate);
}

export function advanceDay(world: World, data: GameData): void {
  world.day += 1;
  const rng = new Rng(world.rngState);
  const startDate = world.startDate ?? data.startDate;
  const date = dayToDate(world.day, startDate);

  // --- daily ---
  runMarketDaily(world, data, rng);
  runWarDaily(world, data, rng);

  // --- weekly ---
  if (world.day % 7 === 0) {
    beginMarketWeek(world);
    runProductionWeekly(world, data, rng);
    runPopsWeekly(world, data, rng);
    runStockpileOrders(world, data, rng);
    // Producers are paid here, AFTER buyers have had their turn, for the share
    // of their output that actually sold. Under the legacy 'fcfs' clearing mode
    // this is a no-op because production already paid itself. See #33.
    settleProductionWeekly(world, data, rng);
    runMarketWeekly(world, data, rng);
  }

  // --- monthly (1st of month) ---
  if (date.day === 1) {
    runBudgetMonthly(world, data, rng);
    runPopsMonthly(world, data, rng);
    runCultureMonthly(world, data, rng); // 0.8.0 nationalism (before politics: feeds unrest)
    runPoliticsMonthly(world, data, rng);
    runResearchMonthly(world, data, rng);
    runDiplomacyMonthly(world, data, rng);
    runCrisisMonthly(world, data, rng);
    runEventsMonthly(world, data, rng);
    runAiMonthly(world, data, rng);
  }

  // --- yearly (U5): one chronicle line per elapsed year --------------------
  if (world.day % 365 === 0) recordChronicle(world, startDate);

  world.rngState = rng.state;
}

/** U5: append this year's line of the player's story. Cheap — runs yearly. */
function recordChronicle(world: World, startDate: GameDate): void {
  const nation = world.nations[world.playerNation];
  if (!nation) return;
  world.chronicle = world.chronicle ?? [];
  world.chronicleWarIds = world.chronicleWarIds ?? [];
  const knownWars = new Set(world.chronicleWarIds);
  for (const war of world.wars) {
    if ((war.attackers.includes(world.playerNation) || war.defenders.includes(world.playerNation)) && !knownWars.has(war.id)) {
      world.chronicleWarIds.push(war.id);
      knownWars.add(war.id);
    }
  }
  let provinces = 0;
  let population = 0;
  for (const province of world.provinces) {
    if (province.owner !== world.playerNation) continue;
    provinces += 1;
    for (const popId of province.popIds) population += world.pops[popId]?.size ?? 0;
  }
  world.chronicle.push({
    year: yearAtDay(world.day, startDate),
    tag: nation.tag,
    name: nation.name,
    provinces,
    population,
    treasury: Math.round(nation.treasury),
    prestige: Math.round(nation.prestige),
    gpRank: nation.gpRank,
    techs: nation.techs.length,
    warsActive: world.wars.filter((war) => war.attackers.includes(world.playerNation) || war.defenders.includes(world.playerNation)).length,
    infamy: Number(nation.infamy.toFixed(1)),
  });
  if (world.chronicle.length > 120) world.chronicle.splice(0, world.chronicle.length - 120);
}

export function snapshot(world: World, data: GameData): WorldSnapshot {
  const snap = buildSnapshot(world, data);
  snap.playerBudget = computePlayerBudget(world, data, world.playerNation);
  return snap;
}
