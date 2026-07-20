import type { GameData, PopType, StateId, World } from '../shared/types';
import { createWorld } from './bootstrap';
import { applyCommand } from './commands';
import { computeReformLegality } from './politics';
import { advanceDay, dayToDate } from './world';

const EPOCH_YEAR = 1836;
const DEFAULT_SEEDS = [6602, 6614, 6626];
const URBAN_TYPES = new Set<PopType>(['craftsman', 'clerk', 'capitalist']);
const MILITANCY_BANDS = [
  { key: '0-2', min: 0, max: 2 },
  { key: '2-4', min: 2, max: 4 },
  { key: '4-6', min: 4, max: 6 },
  { key: '6-8', min: 6, max: 8 },
  { key: '8-10', min: 8, max: 10.000001 },
] as const;

export interface ScalarPoint {
  year: number;
  value: number;
}

export interface TreasuryPoint {
  year: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MilitancyDistributionPoint {
  year: number;
  bands: Record<(typeof MILITANCY_BANDS)[number]['key'], number>;
}

export interface DecadeCount {
  decade: number;
  count: number;
}

export interface SteerabilityScenarioResult {
  name: string;
  treasury: number;
  avgNeedsMet: number;
  avgMilitancy: number;
  factoryCount: number;
  productionIncome: number;
  playerPopulation: number;
  enactedReforms: number;
}

export interface SteerabilityReport {
  seed: number;
  years: number;
  baseline: SteerabilityScenarioResult;
  scenarios: SteerabilityScenarioResult[];
  effects: Array<{
    lever: string;
    visible: boolean;
    summary: string;
  }>;
  inertLevers: string[];
}

export interface CampaignSummary {
  seed: number;
  years: number;
  priceIndexStart: number;
  priceIndexEnd: number;
  priceIndexAnnualizedInflation: number;
  avgFactoryProfit: number;
  peakBankruptShare: number;
  finalBankruptShare: number;
  warsStarted: number;
  warsResolved: number;
  hegemonyShareYear20: number;
  hegemonyShareFinal: number;
  worldPopGrowthShare: number;
  highMilitancyShareFinal: number;
}

export interface CampaignMetrics {
  seed: number;
  years: number;
  economy: {
    worldPriceIndex: ScalarPoint[];
    worldInflationYoY: ScalarPoint[];
    priceRatioByGood: Record<string, ScalarPoint[]>;
    inflationYoYByGood: Record<string, ScalarPoint[]>;
    avgFactoryProfit: ScalarPoint[];
    bankruptShare: ScalarPoint[];
    treasuryDistribution: TreasuryPoint[];
  };
  population: {
    totalWorldPop: ScalarPoint[];
    annualGrowthRate: ScalarPoint[];
    urbanShare: ScalarPoint[];
    popTypeShareStart: Record<string, number>;
    popTypeShareEnd: Record<string, number>;
    militancyDistribution: MilitancyDistributionPoint[];
  };
  geopolitics: {
    warsStartedPerDecade: DecadeCount[];
    warsResolvedPerDecade: DecadeCount[];
    provincesChangedHandsPerDecade: DecadeCount[];
    greatPowerRankingChurnPerDecade: DecadeCount[];
    hegemonyShare: ScalarPoint[];
    unifications: string[];
  };
  summary: CampaignSummary;
}

export interface SeasonReportArtifact {
  generatedAt: string;
  years: number;
  seeds: number[];
  perSeed: CampaignMetrics[];
  aggregate: {
    meanAnnualizedInflation: number;
    meanFactoryProfit: number;
    meanPeakBankruptShare: number;
    meanWarsStarted: number;
    meanWarsResolved: number;
    meanHegemonyYear20: number;
    meanWorldPopGrowthShare: number;
  };
  determinism: {
    checkedSeed: number;
    deterministic: boolean;
  };
  steerability: SteerabilityReport;
}

export interface SeasonReportOptions {
  years?: number;
  seeds?: number[];
  steerabilityYears?: number;
  checkDeterminism?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower] ?? 0;
  const ratio = pos - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * ratio;
}

function decadeOfYear(year: number): number {
  return Math.floor(year / 10) * 10;
}

function incDecade(map: Map<number, number>, year: number, delta = 1): void {
  const decade = decadeOfYear(year);
  map.set(decade, (map.get(decade) ?? 0) + delta);
}

function toDecadeCounts(map: Map<number, number>): DecadeCount[] {
  return Array.from(map.entries())
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade - b.decade);
}

function firstDayOfYear(world: World): boolean {
  const date = dayToDate(world.day);
  return date.day === 1 && date.month === 1;
}

function totalPopulation(world: World): number {
  let total = 0;
  for (const pop of world.pops) total += Math.max(0, pop.size);
  return total;
}

function playerPopulation(world: World): number {
  const player = world.playerNation;
  const owned = new Set(world.provinces.filter((province) => province.owner === player).map((province) => province.id));
  let total = 0;
  for (const pop of world.pops) {
    if (owned.has(pop.provinceId)) total += Math.max(0, pop.size);
  }
  return total;
}

function urbanPopulationShare(world: World): number {
  let urban = 0;
  let total = 0;
  for (const pop of world.pops) {
    const size = Math.max(0, pop.size);
    total += size;
    if (URBAN_TYPES.has(pop.type)) urban += size;
  }
  return total > 0 ? urban / total : 0;
}

function popTypeShare(world: World): Record<string, number> {
  const totals = new Map<string, number>();
  let all = 0;
  for (const pop of world.pops) {
    const size = Math.max(0, pop.size);
    all += size;
    totals.set(pop.type, (totals.get(pop.type) ?? 0) + size);
  }
  const result: Record<string, number> = {};
  for (const [type, size] of totals.entries()) result[type] = all > 0 ? size / all : 0;
  return result;
}

function avgFactoryProfit(world: World): number {
  let total = 0;
  let count = 0;
  for (const state of world.states) {
    for (const factory of state.factories) {
      total += factory.weeklyProfit;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function bankruptShare(world: World): number {
  if (world.nations.length === 0) return 0;
  const bankrupt = world.nations.filter((nation) => nation.isBankrupt).length;
  return bankrupt / world.nations.length;
}

function worldPriceIndex(world: World, data: GameData): number {
  if (world.market.length === 0) return 1;
  let sum = 0;
  for (const good of world.market) {
    const def = data.goods[good.good];
    const base = def?.basePrice ?? 1;
    sum += base > 0 ? good.price / base : 1;
  }
  return sum / world.market.length;
}

function hegemonyShare(world: World): number {
  if (world.provinces.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const province of world.provinces) counts.set(province.owner, (counts.get(province.owner) ?? 0) + 1);
  const largest = Math.max(...counts.values());
  return largest / world.provinces.length;
}

function treasuryPoint(world: World, year: number): TreasuryPoint {
  const treasuries = world.nations.map((nation) => nation.treasury);
  return {
    year,
    mean: mean(treasuries),
    p10: quantile(treasuries, 0.1),
    p50: quantile(treasuries, 0.5),
    p90: quantile(treasuries, 0.9),
  };
}

function militancyDistribution(world: World, year: number): MilitancyDistributionPoint {
  const weighted: Record<(typeof MILITANCY_BANDS)[number]['key'], number> = {
    '0-2': 0,
    '2-4': 0,
    '4-6': 0,
    '6-8': 0,
    '8-10': 0,
  };
  let total = 0;
  for (const pop of world.pops) {
    const size = Math.max(0, pop.size);
    total += size;
    for (const band of MILITANCY_BANDS) {
      if (pop.militancy >= band.min && pop.militancy < band.max) {
        weighted[band.key] += size;
        break;
      }
    }
  }
  const bands: Record<(typeof MILITANCY_BANDS)[number]['key'], number> = {
    '0-2': total > 0 ? weighted['0-2'] / total : 0,
    '2-4': total > 0 ? weighted['2-4'] / total : 0,
    '4-6': total > 0 ? weighted['4-6'] / total : 0,
    '6-8': total > 0 ? weighted['6-8'] / total : 0,
    '8-10': total > 0 ? weighted['8-10'] / total : 0,
  };
  return { year, bands };
}

function gpTopEight(world: World): number[] {
  return world.nations
    .filter((nation) => nation.gpRank > 0)
    .slice()
    .sort((a, b) => a.gpRank - b.gpRank || a.id - b.id)
    .map((nation) => nation.id)
    .slice(0, 8);
}

function countRankChurn(prev: number[] | null, next: number[]): number {
  if (!prev) return 0;
  const len = Math.max(prev.length, next.length);
  let churn = 0;
  for (let i = 0; i < len; i++) {
    if ((prev[i] ?? -1) !== (next[i] ?? -1)) churn += 1;
  }
  return churn;
}

function toInflationCurve(series: ScalarPoint[]): ScalarPoint[] {
  if (series.length <= 1) return [];
  const inflation: ScalarPoint[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    const rate = prev.value > 0 ? (cur.value / prev.value) - 1 : 0;
    inflation.push({ year: cur.year, value: rate });
  }
  return inflation;
}

function worldForAi(seed: number, data: GameData): World {
  const world = createWorld(data, seed);
  for (const nation of world.nations) nation.isPlayer = false;
  return world;
}

export function runCampaignMetrics(data: GameData, seed: number, years: number): CampaignMetrics {
  const world = worldForAi(seed, data);
  const days = years * 365;
  const owners = world.provinces.map((province) => province.owner);
  const initialNames = world.nations.map((nation) => nation.name);

  const worldPriceIndexSeries: ScalarPoint[] = [];
  const priceRatioByGood: Record<string, ScalarPoint[]> = Object.fromEntries(
    data.goods.map((good) => [good.key, [] as ScalarPoint[]]),
  );
  const factoryProfitSeries: ScalarPoint[] = [];
  const bankruptSeries: ScalarPoint[] = [];
  const treasurySeries: TreasuryPoint[] = [];
  const totalPopSeries: ScalarPoint[] = [];
  const urbanShareSeries: ScalarPoint[] = [];
  const militancySeries: MilitancyDistributionPoint[] = [];
  const hegemonySeries: ScalarPoint[] = [];

  const warsStartedByDecade = new Map<number, number>();
  const warsResolvedByDecade = new Map<number, number>();
  const provincesChangedByDecade = new Map<number, number>();
  const gpChurnByDecade = new Map<number, number>();

  const unifications: string[] = [];
  let previousWarIds = new Set(world.wars.map((war) => war.id));
  let previousGpTop8: number[] | null = null;

  for (let day = 0; day < days; day++) {
    advanceDay(world, data);
    const year = EPOCH_YEAR + Math.floor(world.day / 365);

    const currentWarIds = new Set(world.wars.map((war) => war.id));
    for (const warId of currentWarIds) if (!previousWarIds.has(warId)) incDecade(warsStartedByDecade, year, 1);
    for (const warId of previousWarIds) if (!currentWarIds.has(warId)) incDecade(warsResolvedByDecade, year, 1);
    previousWarIds = currentWarIds;

    for (let provinceId = 0; provinceId < world.provinces.length; provinceId++) {
      const owner = world.provinces[provinceId]?.owner ?? -1;
      if (owners[provinceId] === owner) continue;
      owners[provinceId] = owner;
      incDecade(provincesChangedByDecade, year, 1);
    }

    if (!firstDayOfYear(world)) continue;

    const indexValue = worldPriceIndex(world, data);
    worldPriceIndexSeries.push({ year, value: indexValue });
    for (const good of world.market) {
      const def = data.goods[good.good];
      if (!def) continue;
      const ratio = def.basePrice > 0 ? good.price / def.basePrice : 1;
      const points = priceRatioByGood[def.key];
      if (points) points.push({ year, value: ratio });
    }
    factoryProfitSeries.push({ year, value: avgFactoryProfit(world) });
    bankruptSeries.push({ year, value: bankruptShare(world) });
    treasurySeries.push(treasuryPoint(world, year));
    totalPopSeries.push({ year, value: totalPopulation(world) });
    urbanShareSeries.push({ year, value: urbanPopulationShare(world) });
    militancySeries.push(militancyDistribution(world, year));
    hegemonySeries.push({ year, value: hegemonyShare(world) });

    const gpTop8 = gpTopEight(world);
    incDecade(gpChurnByDecade, year, countRankChurn(previousGpTop8, gpTop8));
    previousGpTop8 = gpTop8;

    for (let nationId = 0; nationId < world.nations.length; nationId++) {
      const nation = world.nations[nationId];
      if (nation.name === initialNames[nationId]) continue;
      const lowered = nation.name.toLowerCase();
      if (!lowered.includes('german') && !lowered.includes('ital') && !lowered.includes('scandin') && !lowered.includes('iber')) {
        continue;
      }
      const marker = `${year}: ${nation.name}`;
      if (!unifications.includes(marker)) unifications.push(marker);
    }
  }

  const popTypeShareStart = popTypeShare(worldForAi(seed, data));
  const popTypeShareEnd = popTypeShare(world);
  const annualGrowthRate = toInflationCurve(totalPopSeries);
  const inflationYoY = toInflationCurve(worldPriceIndexSeries);
  const inflationYoYByGood: Record<string, ScalarPoint[]> = {};
  for (const [good, points] of Object.entries(priceRatioByGood)) inflationYoYByGood[good] = toInflationCurve(points);

  const hegemonyAtYear20 = hegemonySeries.find((point) => point.year >= EPOCH_YEAR + 20)?.value ?? hegemonySeries[0]?.value ?? 0;
  const finalMil = militancySeries[militancySeries.length - 1]?.bands['8-10'] ?? 0;
  const startPop = totalPopSeries[0]?.value ?? 0;
  const endPop = totalPopSeries[totalPopSeries.length - 1]?.value ?? startPop;
  const startIndex = worldPriceIndexSeries[0]?.value ?? 1;
  const endIndex = worldPriceIndexSeries[worldPriceIndexSeries.length - 1]?.value ?? startIndex;
  const annualizedInflation = years > 0 && startIndex > 0 ? Math.pow(endIndex / startIndex, 1 / Math.max(1, years)) - 1 : 0;

  const summary: CampaignSummary = {
    seed,
    years,
    priceIndexStart: startIndex,
    priceIndexEnd: endIndex,
    priceIndexAnnualizedInflation: annualizedInflation,
    avgFactoryProfit: mean(factoryProfitSeries.map((point) => point.value)),
    peakBankruptShare: Math.max(0, ...bankruptSeries.map((point) => point.value)),
    finalBankruptShare: bankruptSeries[bankruptSeries.length - 1]?.value ?? 0,
    warsStarted: Array.from(warsStartedByDecade.values()).reduce((sum, value) => sum + value, 0),
    warsResolved: Array.from(warsResolvedByDecade.values()).reduce((sum, value) => sum + value, 0),
    hegemonyShareYear20: hegemonyAtYear20,
    hegemonyShareFinal: hegemonySeries[hegemonySeries.length - 1]?.value ?? hegemonyAtYear20,
    worldPopGrowthShare: startPop > 0 ? (endPop / startPop) - 1 : 0,
    highMilitancyShareFinal: finalMil,
  };

  return {
    seed,
    years,
    economy: {
      worldPriceIndex: worldPriceIndexSeries,
      worldInflationYoY: inflationYoY,
      priceRatioByGood,
      inflationYoYByGood,
      avgFactoryProfit: factoryProfitSeries,
      bankruptShare: bankruptSeries,
      treasuryDistribution: treasurySeries,
    },
    population: {
      totalWorldPop: totalPopSeries,
      annualGrowthRate,
      urbanShare: urbanShareSeries,
      popTypeShareStart,
      popTypeShareEnd,
      militancyDistribution: militancySeries,
    },
    geopolitics: {
      warsStartedPerDecade: toDecadeCounts(warsStartedByDecade),
      warsResolvedPerDecade: toDecadeCounts(warsResolvedByDecade),
      provincesChangedHandsPerDecade: toDecadeCounts(provincesChangedByDecade),
      greatPowerRankingChurnPerDecade: toDecadeCounts(gpChurnByDecade),
      hegemonyShare: hegemonySeries,
      unifications,
    },
    summary,
  };
}

function playerAverages(world: World): { avgNeedsMet: number; avgMilitancy: number } {
  const player = world.playerNation;
  const owned = new Set(world.provinces.filter((province) => province.owner === player).map((province) => province.id));
  let popWeight = 0;
  let needsWeighted = 0;
  let milWeighted = 0;
  for (const pop of world.pops) {
    if (!owned.has(pop.provinceId)) continue;
    const size = Math.max(0, pop.size);
    popWeight += size;
    needsWeighted += pop.needsMet * size;
    milWeighted += pop.militancy * size;
  }
  if (popWeight <= 0) return { avgNeedsMet: 0, avgMilitancy: 0 };
  return {
    avgNeedsMet: needsWeighted / popWeight,
    avgMilitancy: milWeighted / popWeight,
  };
}

function playerFactoryCount(world: World): number {
  const player = world.playerNation;
  return world.states
    .filter((state) => state.owner === player)
    .reduce((sum, state) => sum + state.factories.length, 0);
}

function pickPlayerState(world: World): StateId {
  const player = world.playerNation;
  const state = world.states
    .filter((candidate) => candidate.owner === player)
    .sort((a, b) => a.factories.length - b.factories.length || a.id - b.id)[0];
  return state?.id ?? -1;
}

function pickReformCommand(world: World, data: GameData): { reform: string; level: number } | null {
  const nation = world.nations[world.playerNation];
  if (!nation) return null;
  const healthcare = data.reforms.find((reform) => reform.key === 'healthcare');
  if (healthcare) {
    const current = nation.reforms.healthcare ?? 0;
    const target = Math.min(current + 1, healthcare.options.length - 1);
    if (target > current) {
      const legality = computeReformLegality(world, data, nation, healthcare, target);
      if (legality.legal) return { reform: healthcare.key, level: target };
    }
  }
  for (const reform of data.reforms) {
    const current = nation.reforms[reform.key] ?? 0;
    const target = Math.min(current + 1, reform.options.length - 1);
    if (target <= current) continue;
    const legality = computeReformLegality(world, data, nation, reform, target);
    if (legality.legal) return { reform: reform.key, level: target };
  }
  return null;
}

function runPlayerScenario(
  data: GameData,
  seed: number,
  years: number,
  applyMonthly: (world: World, year: number) => void,
): SteerabilityScenarioResult {
  const world = createWorld(data, seed);
  const days = years * 365;
  let enactedReforms = 0;

  for (let day = 0; day < days; day++) {
    const upcomingDate = dayToDate(world.day + 1);
    if (upcomingDate.day === 1) {
      const before = { ...(world.nations[world.playerNation]?.reforms ?? {}) };
      applyMonthly(world, upcomingDate.year);
      const after = world.nations[world.playerNation]?.reforms ?? {};
      for (const key of Object.keys(after)) {
        if ((after[key] ?? 0) > (before[key] ?? 0)) enactedReforms += 1;
      }
    }
    advanceDay(world, data);
  }

  const nation = world.nations[world.playerNation];
  const averages = playerAverages(world);
  return {
    name: 'scenario',
    treasury: nation?.treasury ?? 0,
    avgNeedsMet: averages.avgNeedsMet,
    avgMilitancy: averages.avgMilitancy,
    factoryCount: playerFactoryCount(world),
    productionIncome: nation?.lastBudget?.productionIncome ?? 0,
    playerPopulation: playerPopulation(world),
    enactedReforms,
  };
}

function evaluatePlayerSteerability(data: GameData, seed: number, years: number): SteerabilityReport {
  const noop = () => undefined;
  const post = () => undefined;
  const baseline = runPlayerScenario(data, seed, years, noop);
  baseline.name = 'baseline';

  const austerity = runPlayerScenario(data, seed, years, (world) => {
    applyCommand(world, data, { t: 'setTax', bracket: 'poor', rate: 0.16 }, post);
    applyCommand(world, data, { t: 'setTax', bracket: 'middle', rate: 0.12 }, post);
    applyCommand(world, data, { t: 'setTax', bracket: 'rich', rate: 0.1 }, post);
    applyCommand(world, data, { t: 'setTariff', rate: -0.25 }, post);
  });
  austerity.name = 'tax_tariff_relief';

  const factoryPush = runPlayerScenario(data, seed, years, (world, year) => {
    if ((year - EPOCH_YEAR) % 2 !== 0) return;
    const state = pickPlayerState(world);
    if (state < 0) return;
    const recipe = data.recipes
      .filter((candidate) => candidate.building === 'factory')
      .map((candidate) => {
        const outputPrice = world.market[candidate.output.good]?.price ?? 0;
        const outputValue = outputPrice * candidate.output.amount;
        const inputValue = candidate.inputs.reduce((sum, input) => (
          sum + (world.market[input.good]?.price ?? 0) * input.amount
        ), 0);
        return { recipe: candidate, score: outputValue - inputValue };
      })
      .sort((a, b) => b.score - a.score || a.recipe.key.localeCompare(b.recipe.key))[0]?.recipe;
    if (!recipe) return;
    applyCommand(world, data, { t: 'buildFactory', state, recipe: recipe.key }, post);
  });
  factoryPush.name = 'factory_build_push';

  const reformPush = runPlayerScenario(data, seed, years, (world, year) => {
    if ((year - EPOCH_YEAR) % 3 !== 0) return;
    const reform = pickReformCommand(world, data);
    if (!reform) return;
    applyCommand(world, data, { t: 'enactReform', reform: reform.reform, level: reform.level }, post);
  });
  reformPush.name = 'reform_push';

  const effects = [
    {
      lever: 'tax/tariff',
      visible: Math.abs(austerity.avgNeedsMet - baseline.avgNeedsMet) >= 0.008
        || Math.abs(austerity.avgMilitancy - baseline.avgMilitancy) > 0.05,
      summary: `needs delta ${(austerity.avgNeedsMet - baseline.avgNeedsMet).toFixed(3)}, militancy delta ${(austerity.avgMilitancy - baseline.avgMilitancy).toFixed(3)}`,
    },
    {
      lever: 'build factory',
      visible: factoryPush.factoryCount > baseline.factoryCount
        && Math.abs(factoryPush.avgNeedsMet - baseline.avgNeedsMet) > 0.005,
      summary: `factory delta ${factoryPush.factoryCount - baseline.factoryCount}, needs delta ${(factoryPush.avgNeedsMet - baseline.avgNeedsMet).toFixed(3)}`,
    },
    {
      lever: 'reforms',
      visible: reformPush.enactedReforms > 0
        && Math.abs(reformPush.playerPopulation - baseline.playerPopulation) / Math.max(1, baseline.playerPopulation) > 0.01,
      summary: `reforms enacted ${reformPush.enactedReforms}, population delta ${Math.round(reformPush.playerPopulation - baseline.playerPopulation)}`,
    },
  ];

  return {
    seed,
    years,
    baseline,
    scenarios: [austerity, factoryPush, reformPush],
    effects,
    inertLevers: effects.filter((entry) => !entry.visible).map((entry) => entry.lever),
  };
}

function summarizeAggregate(perSeed: CampaignMetrics[]): SeasonReportArtifact['aggregate'] {
  return {
    meanAnnualizedInflation: mean(perSeed.map((item) => item.summary.priceIndexAnnualizedInflation)),
    meanFactoryProfit: mean(perSeed.map((item) => item.summary.avgFactoryProfit)),
    meanPeakBankruptShare: mean(perSeed.map((item) => item.summary.peakBankruptShare)),
    meanWarsStarted: mean(perSeed.map((item) => item.summary.warsStarted)),
    meanWarsResolved: mean(perSeed.map((item) => item.summary.warsResolved)),
    meanHegemonyYear20: mean(perSeed.map((item) => item.summary.hegemonyShareYear20)),
    meanWorldPopGrowthShare: mean(perSeed.map((item) => item.summary.worldPopGrowthShare)),
  };
}

export function runSeasonReport(data: GameData, options: SeasonReportOptions = {}): SeasonReportArtifact {
  const years = options.years ?? 60;
  const seeds = options.seeds && options.seeds.length > 0 ? options.seeds : DEFAULT_SEEDS;
  const perSeed = seeds.map((seed) => runCampaignMetrics(data, seed, years));
  const checkDeterminism = options.checkDeterminism ?? true;
  let deterministic = true;
  const checkedSeed = seeds[0] ?? 6602;
  if (checkDeterminism && seeds.length > 0) {
    const first = runCampaignMetrics(data, checkedSeed, years);
    deterministic = JSON.stringify(first) === JSON.stringify(perSeed[0]);
  }
  const steerability = evaluatePlayerSteerability(data, checkedSeed, options.steerabilityYears ?? 12);
  return {
    generatedAt: new Date().toISOString(),
    years,
    seeds,
    perSeed,
    aggregate: summarizeAggregate(perSeed),
    determinism: {
      checkedSeed,
      deterministic,
    },
    steerability,
  };
}

