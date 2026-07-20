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
    // Stagger expensive AI planning work by nation/month to protect perf.
    heavyPlanningStride: 3,
    // Economic baseline.
    factoryTreasuryReserve: 1200,
    minTax: 0.1,
    maxTax: 0.8,
    warChestMonths: 5,
    desiredArmySpendShare: 0.24,
    desiredNavySpendShare: 0.12,
    baseArmyRatio: 0.022,
    baseFleetRatio: 0.006,
    // Alliance and rivalry behavior.
    allianceMinOpinion: 35,
    allianceBreakWeakPowerRatio: 0.34,
    allianceBreakHostileOpinion: -25,
    rivalComparablePowerMin: 0.62,
    rivalComparablePowerMax: 1.65,
    rivalMinScore: 15,
    // Great-power influence and colonial contesting.
    sphereContestTargets: 3,
    sphereBackoffLead: 28,
    sphereBackoffPowerMargin: 1.2,
    colonizationPickTop: 8,
    // War declaration and targeting safety.
    warInfamyDeclareFactor: 0.96,
    warDeclareMinAdvantage: 1.08,
    warDeclareStrongAdvantage: 1.25,
    warExhaustionAvoid: 66,
    warTreasuryReserve: 380,
    // War conduct pacing.
    warRetreatOrgThreshold: 18,
    warRetreatStrengthThreshold: 0.42,
    warMoveBudgetPerMonth: 14,
    // Peace heuristics.
    peaceScorePush: 26,
    peaceExhaustionPush: 58,
    peaceWinScore: 32,
    peaceLoseScore: -18,
    peaceStalemateScoreBand: 9,
    peaceStalemateDays: 365 * 4,
    peaceForceExitDays: 365 * 6,
    peaceHoldExhaustionMax: 72,
    // Research and military investment posture.
    aggressiveMilitaryTechBias: 1.4,
    militaryBuildTreasuryFloor: 450,
    militaryBuildMaxIncomeMultiplier: 6,
  },
  verification: {
    hegemonProvinceShareLimitYear10: 0.6,
    stabilityYears: 20,
  },
} as const;

