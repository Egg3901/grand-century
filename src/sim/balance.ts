/**
 * Central tuning constants for world balance and AI behavior.
 *
 * Keep major economy/war stability knobs here so test failures can be tuned
 * from one place during milestone balancing passes.
 */

export const BALANCE = {
  economy: {
    minPrice: 0.08,
    maxPrice: 500,
    treasuryFloor: -30_000,
    treasurySoftCap: 600_000,
    // Hard ratio clamps against each good's base price.
    inflationGuard: 6,
    deflationGuard: 0.35,
    // Market pricing response.
    marketUnmetDemandWeight: 0.32,
    marketStockpileWeight: 0.75,
    marketPressureClamp: 0.55,
    marketDamping: 0.09,
    marketSmoothing: 0.32,
    marketBaseReversion: 0.06,
    // Tariffs should matter without overwhelming base pricing.
    importTariffPriceImpact: 0.3,
    exportTariffPriceImpact: 0.1,
    // Factory operating model.
    factoryIdleLoss: 0.1,
    rgoEmploymentPerLevel: 4200,
    rgoOutputBoost: 1.2,
    rgoWageShare: 0.8,
    rgoOwnerShare: 0.12,
    factoryOperatingBase: 1,
    factoryOperatingPerLevel: 0.3,
    factoryWageShare: 0.28,
    factoryInputIntensity: 0.15,
    factoryOutputBoost: 2.2,
    factoryRevenueMultiplier: 2.2,
    factoryProfitFloor: 0.15,
    // National budget posture.
    armyUpkeepPerRegiment: 2.5,
    navyUpkeepPerShip: 1.7,
    constructionSpendPerProvince: 0.75,
    adminSpendPerPopulation: 0.00011,
    adminSpendPerProvince: 0.85,
    reformUpkeepPerLevel: 4.2,
    bankruptcyEnterTreasury: -1800,
    bankruptcyExitTreasury: 550,
  },
  population: {
    minGrowthRate: -0.006,
    maxGrowthRate: 0.00022,
    believableAnnualGrowthCap: 0.02,
    passiveIncomeScale: 1.7,
    weeklyNeedsPreviousWeight: 0.6,
    weeklyNeedsCurrentWeight: 0.4,
    weeklyMilitancyFromUnmet: 0.025,
    weeklyMilitancyFromMetRelief: 0.05,
    monthlyMilitancyBaseline: 0.47,
    monthlyMilitancyPressure: 0.05,
    monthlyMilitancyDecay: 0.06,
    monthlyConsciousnessLiteracy: 0.11,
    monthlyConsciousnessUrban: 0.035,
    monthlyConsciousnessNeedPenalty: 0.012,
    suppressionMilitancyImpact: 0.04,
    deniedReformBasePressure: 0.05,
    deniedReformSupportPressure: 0.08,
    legalReformRelief: 0.01,
  },
  rebellion: {
    worldActiveCap: 8,
    nationActiveCap: 2,
    stateCooldownDays: 900,
    unrestRiskThreshold: 0.5,
    stateMilitancyThreshold: 5.95,
    sustainedUnrestMonths: 6,
    spawnRegimentScale: 1.8,
    spawnRegimentMin: 1,
    spawnRegimentMax: 3,
    postSpawnUnrestMultiplier: 0.55,
    postResolutionUnrestMultiplier: 0.35,
    crushedMilitancyRelief: 1.1,
    enforcedMilitancyRelief: 0.6,
    maxRebelArmiesWorld: 32,
  },
  ai: {
    // Stagger expensive AI planning work by nation/month to protect perf.
    heavyPlanningStride: 3,
    // Economic baseline.
    factoryTreasuryReserve: 1200,
    minTax: 0.1,
    maxTax: 0.8,
    minTariff: -0.25,
    maxTariff: 0.35,
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

