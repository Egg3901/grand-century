import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { GAME_DATA } from '../src/data/gameData';
import { runSeasonReport } from '../src/sim/seasonReport';

interface CliArgs {
  years: number;
  seeds: number[];
  outPath: string;
  steerabilityYears: number;
  checkDeterminism: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {
    years: 60,
    seeds: [6602, 6614, 6626],
    outPath: 'docs/season-report.json',
    steerabilityYears: 12,
    checkDeterminism: true,
  };
  for (const raw of argv) {
    if (raw.startsWith('--years=')) {
      const value = Number(raw.slice('--years='.length));
      if (Number.isFinite(value) && value >= 1) parsed.years = Math.floor(value);
      continue;
    }
    if (raw.startsWith('--seeds=')) {
      const list = raw
        .slice('--seeds='.length)
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item))
        .map((item) => Math.floor(item));
      if (list.length > 0) parsed.seeds = list;
      continue;
    }
    if (raw.startsWith('--out=')) {
      const value = raw.slice('--out='.length).trim();
      if (value) parsed.outPath = value;
      continue;
    }
    if (raw.startsWith('--steerability-years=')) {
      const value = Number(raw.slice('--steerability-years='.length));
      if (Number.isFinite(value) && value >= 1) parsed.steerabilityYears = Math.floor(value);
      continue;
    }
    if (raw === '--no-determinism-check') {
      parsed.checkDeterminism = false;
    }
  }
  return parsed;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = runSeasonReport(GAME_DATA, {
    years: args.years,
    seeds: args.seeds,
    steerabilityYears: args.steerabilityYears,
    checkDeterminism: args.checkDeterminism,
  });

  const summaryRows = report.perSeed.map((entry) => ({
    seed: entry.seed,
    years: entry.years,
    annualizedInflation: pct(entry.summary.priceIndexAnnualizedInflation),
    avgFactoryProfit: entry.summary.avgFactoryProfit.toFixed(2),
    peakBankruptShare: pct(entry.summary.peakBankruptShare),
    finalBankruptShare: pct(entry.summary.finalBankruptShare),
    warsStarted: entry.summary.warsStarted,
    warsResolved: entry.summary.warsResolved,
    hegemonyYear20: pct(entry.summary.hegemonyShareYear20),
    worldPopGrowth: pct(entry.summary.worldPopGrowthShare),
    highMilitancyFinal: pct(entry.summary.highMilitancyShareFinal),
  }));

  console.log('\nGrand Century season report');
  console.log(`Years: ${report.years}`);
  console.log(`Seeds: ${report.seeds.join(', ')}`);
  console.log(`Determinism check (${report.determinism.checkedSeed}): ${report.determinism.deterministic ? 'PASS' : 'FAIL'}`);
  console.table(summaryRows);

  const effectRows = report.steerability.effects.map((effect) => ({
    lever: effect.lever,
    visible: effect.visible ? 'yes' : 'no',
    summary: effect.summary,
  }));
  console.log('\nPlayer steerability checks');
  console.table(effectRows);
  if (report.steerability.inertLevers.length > 0) {
    console.log(`Inert levers: ${report.steerability.inertLevers.join(', ')}`);
  } else {
    console.log('Inert levers: none');
  }

  const outPath = resolve(args.outPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

await main();

