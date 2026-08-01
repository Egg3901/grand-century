import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { runCampaignMetrics } from '../src/sim/seasonReport';
import { advanceDay } from '../src/sim/world';

const LONG_RUN_YEARS = 60;
const LONG_RUN_SEEDS = [6602, 6614];

describe('M6 balance envelope', () => {
  it('keeps economy, population, and geopolitics within tuned long-run bands', () => {
    const reports = LONG_RUN_SEEDS.map((seed) => runCampaignMetrics(GAME_DATA, seed, LONG_RUN_YEARS));

    for (const report of reports) {
      const summary = report.summary;
      expect(summary.priceIndexAnnualizedInflation).toBeGreaterThanOrEqual(-0.01);
      expect(summary.priceIndexAnnualizedInflation).toBeLessThanOrEqual(0.05);
      expect(summary.avgFactoryProfit).toBeGreaterThanOrEqual(0.1);
      expect(summary.peakBankruptShare).toBeLessThan(0.4);
      expect(summary.warsStarted).toBeGreaterThanOrEqual(60);
      expect(summary.warsResolved).toBeGreaterThanOrEqual(55);
      expect(summary.warsResolved).toBeGreaterThanOrEqual(Math.floor(summary.warsStarted * 0.85));
      expect(summary.hegemonyShareYear20).toBeLessThanOrEqual(0.35);
      expect(summary.worldPopGrowthShare).toBeGreaterThanOrEqual(0.2);
      // 1820-start + corrected coastal flags yield slightly stronger 60y growth than the old 1836 tune.
      expect(summary.worldPopGrowthShare).toBeLessThanOrEqual(1.05);
      // 1.5.0: the old 0.9 ceilings dated from the broken economy, where the
      // year-30 supply decay (#41) dragged the mean to ~0.75 as an artifact.
      // With labor and farm capacity answering scarcity, a fed century is the
      // WORKING state; scarcity tension now lives per-good (8-9 of 30 goods
      // run short at any checkpoint) and in rising expectations, not in
      // aggregate famine. The ceilings stay only to catch exact-saturation
      // pathologies (a flat 1.0 means demand registration broke).
      expect(summary.avgNeedsMetMean).toBeGreaterThanOrEqual(0.6);
      expect(summary.avgNeedsMetMean).toBeLessThanOrEqual(0.995);
      expect(summary.avgNeedsMetFinal).toBeGreaterThanOrEqual(0.55);
      expect(summary.avgNeedsMetFinal).toBeLessThanOrEqual(0.998);
      expect(summary.highMilitancyShareFinal).toBeLessThan(0.45);
      expect(summary.peakActiveRebellions).toBeLessThanOrEqual(12);
      expect(summary.peakRebelArmies).toBeLessThanOrEqual(32);
    }
  }, 320_000);

  it('is deterministic for repeated same-seed campaigns', () => {
    const first = runCampaignMetrics(GAME_DATA, 6602, 30);
    const second = runCampaignMetrics(GAME_DATA, 6602, 30);
    expect(second).toEqual(first);
  }, 220_000);

  it('keeps a fed and reformed nation rebellion-free', () => {
    const world = createWorld(GAME_DATA, 6626);
    for (const nation of world.nations) nation.isPlayer = true;
    const player = world.playerNation;
    const nation = world.nations[player];
    nation.treasury = 120_000;
    nation.prestige = 200;
    nation.government = 'democracy';
    nation.taxRatePoor = 0.08;
    nation.taxRateMiddle = 0.08;
    nation.taxRateRich = 0.08;
    nation.tariffRate = -0.2;
    for (const reform of GAME_DATA.reforms) nation.reforms[reform.key] = Math.max(0, reform.options.length - 1);

    const owned = new Set(world.provinces.filter((province) => province.owner === player).map((province) => province.id));
    for (const pop of world.pops) {
      if (!owned.has(pop.provinceId)) continue;
      pop.needsMet = 0.94;
      pop.militancy = 0.2;
      pop.consciousness = Math.min(pop.consciousness, 3);
    }

    for (let day = 0; day < 365 * 12; day++) advanceDay(world, GAME_DATA);
    const playerRebellions = world.rebellions.filter((rebellion) => rebellion.targetNation === player && rebellion.status === 'active');
    const playerRebelArmies = world.armies.filter((army) => army.rebel && army.hostileTo === player && army.regiments.length > 0);
    expect(playerRebellions).toHaveLength(0);
    expect(playerRebelArmies).toHaveLength(0);
  }, 220_000);
});

