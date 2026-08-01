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
    // 0.6.0: raised 1.2 -> 1.5 so raw-good (esp. food) supply keeps pace with a
    // century of population growth now that factories actually consume inputs.
    rgoOutputBoost: 1.5,
    rgoWageShare: 0.8,
    rgoOwnerShare: 0.12,
    factoryOperatingBase: 1,
    factoryOperatingPerLevel: 0.3,
    // 0.6.0: raised 0.28 -> 0.45. With factories finally producing, more of the
    // value must reach the craftsman/clerk/laborer pops that buy food, instead
    // of pooling in capitalist/aristocrat pops. Keeps late-game pops fed.
    factoryWageShare: 0.45,
    factoryInputIntensity: 0.15,
    factoryOutputBoost: 2.2,
    factoryRevenueMultiplier: 2.0,
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
    /**
     * What it takes for a factory to add a storey (#40 rebalance).
     * Expansion used to be automatic: 10 profitable weeks and 70 in reserve, at
     * a flat cost, so every plant climbed to the level cap and then lost money.
     * The bar now scales with size so growth is funded by its own success.
     */
    factoryExpansion: {
      profitableWeeks: 26,
      cashBase: 90,
      cashPerLevel: 55,
      cashSpentShare: 0.8,
      downsizeLossWeeks: 6,
      maxLevel: 10,
    },
    // National stockpile buy/sell standing orders.
    stockpileOrderMaxDaily: 40,
    /**
     * How producers are paid for what they make.
     *
     * 'fcfs'   — legacy. `computeSaleRevenue` pays for the FULL output at the
     *            moment of production, before any buyer exists. Unsold goods
     *            roll into worldStockpile and the money to pay for them is
     *            created from nothing. Measured at seed 6602: the market paid
     *            producers 7.5x what buyers spent by 1825, minting ~4M/year and
     *            growing. That is the money fountain behind #33 (nobody is ever
     *            money-constrained) and very likely #36 (prices stuck at ~2x
     *            base for a century).
     * 'settle' — producers register supply during the production pass and are
     *            paid AFTER the market clears, in proportion to what actually
     *            sold. Money entering the economy is bounded by money spent.
     *
     * Default stays 'fcfs' until the rebalance lands, so the change can be
     * reviewed for correctness with the suite bit-identical.
     */
    clearingMode: 'settle' as 'fcfs' | 'settle',
    // Agricultural investment (#41): an RGO at near-full employment whose good
    // prices above base for this many consecutive weeks gains a level. Growth
    // is price-gated, so it self-limits once supply catches up.
    rgoSaturationEmployment: 0.92,
    rgoGrowthPriceFloor: 1.05,
    rgoSaturationWeeks: 12,
    rgoMaxLevel: 12,
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
    // Ideology drift (pop.ideology was frozen forever at bootstrap otherwise —
    // elections/upper-house would converge on a random-at-seed lottery instead
    // of reflecting a century of rising consciousness/militancy/hardship). This
    // rolls once per pop per MONTH for up to 1200 months in a century, so even
    // small per-month probabilities compound hard — tuned so a genuinely
    // miserable, radicalized cohort can plausibly reach socialist within its
    // lifetime, while a comfortable cohort stays put or slowly mellows.
    ideologyConsciousnessWeight: 0.02,
    ideologyMilitancyWeight: 0.015,
    ideologyUnmetNeedsWeight: 0.08,
    ideologyEliteResistance: 0.3,
    ideologyRadicalDriftScale: 0.008,
    ideologyReactionaryBaselineChance: 0.0006,
    ideologyEliteReactionaryChance: 0.01,
    // Labor-market wage signal (#41). Promotion out of agriculture only happens
    // while factory pay beats farm pay; when scarcity pushes raw-good prices up,
    // farm wages rise and the drain stops — and reverses once the land pays a
    // clear premium. Without this, a century of one-way promotion emptied the
    // countryside (farmers 50% -> 1.6%) and needs-met decayed from year 30 on.
    promoteWageAdvantage: 1.05,
    demoteWageAdvantage: 1.3,
    demoteReturnRate: 0.01,
    // Rising expectations: everyday/luxury need quantities scale with pop
    // consciousness (0-10), up to +60% at full consciousness. Keeps late-game
    // scarcity tension alive once industry solves the 1820 basket.
    expectationPerConsciousness: 0.06,
  },
  diplomacy: {
    // #35: monthly proportional prestige fade. See runDiplomacyMonthly.
    prestigeMonthlyDecayRate: 0.005,
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
    /** How much an unmet-demand good outranks a well-supplied one (#40). */
    factoryScarcityWeight: 2.5,
    /** Score multiplier for a good whose demand is already fully met (#40). */
    factorySaturatedFloor: 0.25,
    /** Diminishing returns per copy of a recipe a nation already owns (#40). */
    factorySaturationPenalty: 0.35,
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

/**
 * Tariff slider band from trade_policy reform level (0–3).
 * Nested inside the AI min/max envelope so free-trade / protectionism matter.
 */
export function tariffBandForTradePolicy(level: number): { min: number; max: number } {
  const aiMin = BALANCE.ai.minTariff;
  const aiMax = BALANCE.ai.maxTariff;
  const safe = Math.max(0, Math.min(3, Math.floor(Number.isFinite(level) ? level : 2)));
  const bands: [number, number][] = [
    [0.05, aiMax],   // protectionism
    [-0.05, 0.30],   // mercantilism
    [-0.15, 0.25],   // balanced_trade
    [aiMin, 0.10],   // free_trade
  ];
  const [lo, hi] = bands[safe]!;
  return { min: Math.max(aiMin, lo), max: Math.min(aiMax, Math.max(lo, hi)) };
}

