/**
 * Central tuning constants for world balance and AI behavior.
 *
 * Keep major economy/war stability knobs here so test failures can be tuned
 * from one place during milestone balancing passes.
 */

export const BALANCE = {
  economy: {
    minPrice: 0.05,
    maxPrice: 1_000_000,
    treasuryFloor: -25_000,
    treasurySoftCap: 180_000,
    inflationGuard: 22,
    deflationGuard: 0.08,
  },
  population: {
    minGrowthRate: -0.008,
    maxGrowthRate: 0.01,
    believableAnnualGrowthCap: 0.02,
  },
  ai: {
    heavyPlanningStride: 3,
    factoryTreasuryReserve: 1200,
    minTax: 0.1,
    maxTax: 0.8,
    warChestMonths: 5,
    desiredArmySpendShare: 0.24,
    desiredNavySpendShare: 0.12,
    baseArmyRatio: 0.022,
    baseFleetRatio: 0.006,
    peaceScorePush: 26,
    peaceExhaustionPush: 58,
  },
  verification: {
    hegemonProvinceShareLimitYear10: 0.6,
    stabilityYears: 20,
  },
} as const;

