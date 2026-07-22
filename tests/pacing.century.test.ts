import { describe, expect, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

/**
 * U3 pacing harness — an AI-driven century, scored per decade.
 *
 * Opt-in (PACING=1 npm run probe:pacing): a full century per seed is minutes
 * of wall-clock, not CI material. Emits JSON to scratch reports + a summary
 * assertion set that encodes the pacing contract:
 *  - no decade after 1830 with zero wars AND zero battles (dead world)
 *  - price index stays within a sane band (no runaway inflation/deflation)
 *  - unification is possible but not instant: if Germany forms, 1848+.
 */

const RUN = process.env.PACING === '1';
const SEEDS = (process.env.PACING_SEEDS ?? '1836,4711').split(',').map(Number);
const OUT = process.env.PACING_OUT ?? '/tmp/claude-0/-root/fb7aa2c6-7a3e-4b15-b4dd-1a1351f1dda7/scratchpad/pacing';

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

    type Decade = {
      startYear: number;
      warsStarted: number;
      battles: number;
      priceIndexEnd: number;
      techsUnlockedTotal: number;
      formed: string[];
      gpChurn: number;
    };
    const decades: Decade[] = [];
    let warIdAtDecadeStart = 0;
    let seenBattles = 0;
    let lastGpSet = new Set<string>();
    let formedTags = new Set<string>();
    const formedYears: Record<string, number> = {};

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
        decades.push({
          startYear: 1820 + year - 9,
          warsStarted,
          battles: battlesNow - seenBattles >= 0 ? battlesNow : battlesNow,
          priceIndexEnd: priceIndex(),
          techsUnlockedTotal: techsTotal,
          formed: [...formedTags],
          gpChurn: churn,
        });
        seenBattles = battlesNow;
      }
    }

    const report = {
      seed,
      formedYears,
      finalYear: 1820 + YEARS,
      decades,
      aliveNations: world.nations.filter((nation) =>
        world.states.some((state) => state.owner === nation.id)).length,
    };
    writeFileSync(`${OUT}-${seed}.json`, JSON.stringify(report, null, 1));
    appendFileSync(`${OUT}-summary.txt`,
      `seed ${seed}: formed=${JSON.stringify(formedYears)} `
      + `warsTotal=${world.nextWarId} alive=${report.aliveNations} `
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
  }, 3_600_000);
});
