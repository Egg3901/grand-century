import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { runCampaignMetrics } from '../src/sim/seasonReport';

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
      expect(summary.worldPopGrowthShare).toBeLessThanOrEqual(0.9);
      expect(summary.highMilitancyShareFinal).toBeLessThan(0.9);
    }
  }, 320_000);

  it('is deterministic for repeated same-seed campaigns', () => {
    const first = runCampaignMetrics(GAME_DATA, 6602, 30);
    const second = runCampaignMetrics(GAME_DATA, 6602, 30);
    expect(second).toEqual(first);
  }, 220_000);
});

