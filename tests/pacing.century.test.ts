import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import type { World } from '../src/shared/types';

/**
 * U3 / H3 pacing harness — an AI-driven century, scored per decade.
 *
 * Opt-in (PACING=1 npm run probe:pacing): a full century per seed is minutes
 * of wall-clock, not CI material. Emits JSON to scratch reports + a summary
 * assertion set that encodes the pacing contract.
 *
 * Regenerate the committed baseline (after a clean probe run):
 *   PACING=1 PACING_WRITE_BASELINE=1 npm run probe:pacing
 * That writes tests/baselines/pacing.baseline.json from the default seeds.
 * Review the diff before committing — the baseline is the reviewable drift signal.
 */

const RUN = process.env.PACING === '1';
const SEEDS = (process.env.PACING_SEEDS ?? '1836,4711').split(',').map(Number);
const OUT = process.env.PACING_OUT
  ?? '/tmp/claude-0/-root/fb7aa2c6-7a3e-4b15-b4dd-1a1351f1dda7/scratchpad/pacing';
const WRITE_BASELINE = process.env.PACING_WRITE_BASELINE === '1';
const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'baselines/pacing.baseline.json',
);

/**
 * Thresholds derived from PACING=1 runs on seeds 1836 & 4711 (H3, 2026-07-27).
 * Each comment records the observed value and the headroom left.
 */
const THRESHOLDS = {
  /**
   * Min techsUnlockedTotal delta between consecutive decade checkpoints.
   * Observed min delta = 240 (both seeds, every decade). Floor 150 ≈ 37% headroom.
   */
  minTechDeltaPerDecade: 150,
  /**
   * Min nations still owning ≥1 state at year 1920.
   * Observed finals = 46 (seed 1836) and 32 (seed 4711). Floor 28 ≈ 12% under the weaker seed.
   */
  minAliveNations: 28,
  /**
   * Aspirational content-coverage floor (distinct nations with ≥1 event/decision
   * fire per decade, 1830s+). Observed min = 34 / max = 49 across default seeds.
   * Gate at 48 (full starting roster every decade) — fails today; see it.skip below.
   */
  minNationsWithContentPerDecade: 48,
};

type Decade = {
  startYear: number;
  warsStarted: number;
  battles: number;
  priceIndexEnd: number;
  techsUnlockedTotal: number;
  techDelta: number;
  formed: string[];
  gpChurn: number;
  aliveNations: number;
  /** Distinct nation ids that fired an event or took a decision this decade. */
  nationsWithContent: number;
};

type SeedReport = {
  seed: number;
  formedYears: Record<string, number>;
  finalYear: number;
  decades: Decade[];
  aliveNations: number;
  /** Unique nation ids with any event/decision history by end of run. */
  centuryContentNations: number;
  totalGpChurnAfter1820s: number;
};

const seedReports: SeedReport[] = [];

function aliveNationCount(world: World): number {
  return world.nations.filter((nation) =>
    world.states.some((state) => state.owner === nation.id)).length;
}

/** Nation id is the suffix after the last ':' in historyKey(`${id}:${nationId}`). */
function nationIdFromHistoryKey(key: string): number | null {
  const idx = key.lastIndexOf(':');
  if (idx < 0) return null;
  const id = Number(key.slice(idx + 1));
  return Number.isFinite(id) ? id : null;
}

function nationsWithContentInDayRange(world: World, dayLo: number, dayHi: number): Set<number> {
  const nations = new Set<number>();
  for (const [key, day] of Object.entries(world.eventLastFired ?? {})) {
    if (day >= dayLo && day < dayHi) {
      const id = nationIdFromHistoryKey(key);
      if (id !== null) nations.add(id);
    }
  }
  for (const [key, day] of Object.entries(world.decisionLastTaken ?? {})) {
    if (day >= dayLo && day < dayHi) {
      const id = nationIdFromHistoryKey(key);
      if (id !== null) nations.add(id);
    }
  }
  return nations;
}

function centuryContentNationCount(world: World): number {
  const nations = new Set<number>();
  for (const key of Object.keys(world.eventLastFired ?? {})) {
    const id = nationIdFromHistoryKey(key);
    if (id !== null) nations.add(id);
  }
  for (const key of Object.keys(world.decisionLastTaken ?? {})) {
    const id = nationIdFromHistoryKey(key);
    if (id !== null) nations.add(id);
  }
  return nations.size;
}

describe.skipIf(!RUN)('U3 pacing — AI century runs', () => {
  it.each(SEEDS)('century probe, seed %i', (seed) => {
    const world = createWorld(GAME_DATA, seed);
    const basket = GAME_DATA.goods.map((good) => good.id);
    const priceIndex = () => {
      let acc = 0;
      let base = 0;
      for (const id of basket) {
        acc += world.market[id]?.price ?? 0;
        base += GAME_DATA.goods[id]?.basePrice ?? 1;
      }
      return acc / Math.max(1, base);
    };

    const decades: Decade[] = [];
    let warIdAtDecadeStart = 0;
    let seenBattles = 0;
    let lastGpSet = new Set<string>();
    let formedTags = new Set<string>();
    const formedYears: Record<string, number> = {};
    let prevTechsTotal = 0;
    let decadeDayLo = 0;

    const YEARS = 100;
    for (let year = 0; year < YEARS; year++) {
      for (let day = 0; day < 365; day++) advanceDay(world, GAME_DATA);
      for (const tag of ['GER', 'ITA', 'NGF']) {
        if (!formedTags.has(tag) && world.nations.some((nation) => nation.tag === tag)) {
          formedTags.add(tag);
          // year+1 full years have elapsed since the 1820 start
          formedYears[tag] = 1820 + year + 1;
        }
      }
      if ((year + 1) % 10 === 0) {
        const warsStarted = world.nextWarId - warIdAtDecadeStart;
        warIdAtDecadeStart = world.nextWarId;
        const battlesNow = world.recentBattles?.length ?? 0;
        const gpSet = new Set(
          world.nations.filter((nation) => nation.gpRank > 0).map((nation) => nation.tag),
        );
        const churn = [...gpSet].filter((tag) => !lastGpSet.has(tag)).length
          + [...lastGpSet].filter((tag) => !gpSet.has(tag)).length;
        lastGpSet = gpSet;
        const techsTotal = world.nations.reduce((sum, nation) => sum + nation.techs.length, 0);
        const dayHi = world.day;
        const contentNations = nationsWithContentInDayRange(world, decadeDayLo, dayHi);
        decades.push({
          startYear: 1820 + year - 9,
          warsStarted,
          battles: battlesNow - seenBattles >= 0 ? battlesNow : battlesNow,
          priceIndexEnd: priceIndex(),
          techsUnlockedTotal: techsTotal,
          techDelta: techsTotal - prevTechsTotal,
          formed: [...formedTags],
          gpChurn: churn,
          aliveNations: aliveNationCount(world),
          nationsWithContent: contentNations.size,
        });
        prevTechsTotal = techsTotal;
        seenBattles = battlesNow;
        decadeDayLo = dayHi;
      }
    }

    const totalGpChurnAfter1820s = decades.slice(1).reduce((sum, d) => sum + d.gpChurn, 0);
    const report: SeedReport = {
      seed,
      formedYears,
      finalYear: 1820 + YEARS,
      decades,
      aliveNations: aliveNationCount(world),
      centuryContentNations: centuryContentNationCount(world),
      totalGpChurnAfter1820s,
    };
    seedReports.push(report);

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(`${OUT}-${seed}.json`, JSON.stringify(report, null, 1));
    appendFileSync(`${OUT}-summary.txt`,
      `seed ${seed}: formed=${JSON.stringify(formedYears)} `
      + `warsTotal=${world.nextWarId} alive=${report.aliveNations} `
      + `contentNations=${report.centuryContentNations} `
      + `gpChurnAfter1820s=${totalGpChurnAfter1820s} `
      + `priceIdxFinal=${decades[decades.length - 1].priceIndexEnd.toFixed(2)}\n`);

    // ---- the pacing contract ----------------------------------------------
    // world must not go dead: every decade from the 1830s has some conflict
    for (const decade of decades.slice(1)) {
      expect(decade.warsStarted, `dead decade ${decade.startYear} (seed ${seed})`).toBeGreaterThan(0);
    }
    // prices anchored: index within [0.4, 2.5] of base at every checkpoint
    for (const decade of decades) {
      expect(decade.priceIndexEnd).toBeGreaterThan(0.4);
      expect(decade.priceIndexEnd).toBeLessThan(2.5);
    }
    // era gate respected
    for (const tag of ['GER', 'ITA', 'NGF']) {
      if (formedYears[tag] !== undefined) expect(formedYears[tag]).toBeGreaterThanOrEqual(1848);
    }

    // tech cadence — unlocked-tech totals must keep rising each decade (no flatline).
    // Observed min delta 240; threshold 150 leaves ~37% headroom.
    for (const decade of decades) {
      expect(
        decade.techDelta,
        `tech flatline in ${decade.startYear}s (seed ${seed}): delta=${decade.techDelta}`,
      ).toBeGreaterThanOrEqual(THRESHOLDS.minTechDeltaPerDecade);
    }

    // nation-death ceiling — map must not collapse to a handful of survivors.
    // Observed finals 46 / 32; threshold 28 leaves ~12% under the weaker seed.
    expect(
      report.aliveNations,
      `nation collapse (seed ${seed}): alive=${report.aliveNations}`,
    ).toBeGreaterThanOrEqual(THRESHOLDS.minAliveNations);

    // GP churn & formable diversity are recorded in the report/baseline but NOT
    // hard-gated: see describe-level notes below (too seed-noisy on 1836/4711).
  }, 3_600_000);

  it('writes baseline artifact when PACING_WRITE_BASELINE=1', () => {
    if (!WRITE_BASELINE) return;
    expect(seedReports.length).toBe(SEEDS.length);
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    const baseline = {
      generatedBy: 'tests/pacing.century.test.ts',
      regenerate: 'PACING=1 PACING_WRITE_BASELINE=1 npm run probe:pacing',
      // Harness-only timestamp (not sim-facing; sim stays on seeded rng).
      generatedAt: new Date().toISOString(),
      seeds: SEEDS,
      thresholds: THRESHOLDS,
      // H3 observations recorded in reports but not hard-gated (seed-noisy):
      // GP churn after 1820s: 1836=6, 4711=0; formations: both seeds {}.
      reports: seedReports,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  });

  /**
   * Content coverage gate — intentionally skipped; will fail on today's numbers.
   *
   * Observed (H3 probe 2026-07-27, seeds 1836 & 4711):
   *   - per-decade nationsWithContent (1830s+): min=34, max=49
   *   - century-unique content nations: 70 (seed 1836), 45 (seed 4711)
   * Generic events fire widely, but 44/48 starting nations still have zero
   * nation-scoped defs (only 3/26 events and 7/13 decisions are tag-gated to the
   * Prussia / Piedmont arcs). Aspirational bar = full starting roster (48) active
   * every decade from the 1830s. Flip `it.skip` → `it` once content lands.
   */
  it.skip(
    `content coverage: ≥${THRESHOLDS.minNationsWithContentPerDecade} nations with event/decision activity per decade (1830s+) — observed min=34 max=49`,
    () => {
      expect(seedReports.length).toBe(SEEDS.length);
      for (const report of seedReports) {
        for (const decade of report.decades.slice(1)) {
          expect(
            decade.nationsWithContent,
            `content-thin decade ${decade.startYear} (seed ${report.seed}): `
              + `${decade.nationsWithContent} < ${THRESHOLDS.minNationsWithContentPerDecade}`,
          ).toBeGreaterThanOrEqual(THRESHOLDS.minNationsWithContentPerDecade);
        }
      }
    },
  );

  /**
   * Formable diversity — enabled 1.5.0: unification wars + sphere defection
   * put formations back on the default seeds (1836 forms GER at 1848; 4711
   * forms nothing with an idle player but GER+ITA when Britain is AI-driven).
   * Requires the sorted-tag signatures across seeds to differ.
   */
  it('formable diversity across default seeds', () => {
    expect(seedReports.length).toBeGreaterThanOrEqual(2);
    const signatures = seedReports.map((r) =>
      JSON.stringify(Object.keys(r.formedYears).sort()));
    expect(
      new Set(signatures).size,
      `identical formations across seeds: ${signatures.join(' | ')}`,
    ).toBeGreaterThan(1);
  });

  /**
   * GP rank churn — enabled 1.5.0: prestige decay (0.5%/month) broke the
   * incumbency moat. Observed after the change: 1836=10, 4711=2 (was 6 and 0).
   */
  it('GP churn after 1820s ≥ 1 on every default seed', () => {
    expect(seedReports.length).toBe(SEEDS.length);
    for (const report of seedReports) {
      expect(
        report.totalGpChurnAfter1820s,
        `frozen GP table (seed ${report.seed})`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
