/**
 * #34/#35 probe: why the GP table freezes and formables never fire.
 * Runs an AI-only century and prints, per decade:
 *  - top-10 power scores decomposed (industry/military/prestige)
 *  - alive nation count
 *  - formable status per candidate: which requirement fails, core breakdown
 * Throwaway instrumentation, not part of the suite.
 */
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import { evaluateNationFormable } from '../src/sim/formables';
import type { World } from '../src/shared/types';

const seed = Number(process.argv[2] ?? 4711);
const years = Number(process.argv[3] ?? 100);
const data = GAME_DATA;
const world = createWorld(data, seed);
for (const nation of world.nations) nation.isPlayer = false;

function aliveCount(w: World): number {
  const owners = new Set(w.provinces.map((p) => p.owner));
  return w.nations.filter((n) => owners.has(n.id)).length;
}

function checkpoint(w: World, year: number): void {
  const owners = new Set(w.provinces.map((p) => p.owner));
  const scores = w.nations
    .map((n) => {
      let industry = 0;
      for (const s of w.states) {
        if (s.owner !== n.id) continue;
        for (const f of s.factories) industry += f.level * 11 + f.lastOutput * 1.2 + f.employed / 2000;
      }
      let military = 0;
      for (const a of w.armies) {
        if (a.rebel || a.owner !== n.id) continue;
        for (const r of a.regiments) military += 1.9 * Math.min(1.6, Math.max(0, r.strength / 1000));
      }
      const score = Math.sqrt(Math.max(0, industry)) * 9 + military * 2.5 + n.prestige;
      return { tag: n.tag, name: n.name, industry, military, prestige: n.prestige, score, rank: n.gpRank };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  console.log(`\n== ${year} == alive=${aliveCount(w)}/${w.nations.length}`);
  for (const s of scores) {
    console.log(`   #${s.rank || '-'} ${s.tag.padEnd(4)} score=${s.score.toFixed(0).padStart(6)} ind=${s.industry.toFixed(0).padStart(6)} (sqrt*9=${(Math.sqrt(Math.max(0, s.industry)) * 9).toFixed(0).padStart(5)}) mil=${(s.military * 2.5).toFixed(0).padStart(5)} prg=${s.prestige.toFixed(0).padStart(5)}`);
  }
  for (const formable of data.formables ?? []) {
    for (const tag of formable.candidateTags) {
      const nation = w.nations.find((n) => n.tag === tag && owners.has(n.id));
      if (!nation) continue;
      const status = evaluateNationFormable(w, data, nation.id, formable);
      const failing = status.requirements.filter((r) => !r.met).map((r) => r.key);
      const gpOwned = status.coreBreakdown.filter((c) => c.kind === 'missing' && (w.nations[c.owner]?.gpRank ?? 0) > 0).length;
      const missingOwners = Array.from(new Set(status.coreBreakdown
        .filter((c) => c.kind === 'missing')
        .map((c) => w.nations[c.owner]?.tag ?? `#${c.owner}`))).slice(0, 6);
      console.log(`   ${formable.key.padEnd(28)} ${tag.padEnd(4)} ready=${status.ready} ctrl=${status.controlledCoreStates}/${status.requiredCoreStates} of ${status.totalCoreStates} (gp-held cores: ${gpOwned}) fails=[${failing.join(',')}] missing:[${missingOwners.join(',')}]`);
      if (status.ready) console.log(`   ^^^ READY but unformed`);
    }
  }
}

checkpoint(world, 1820);
for (let year = 1; year <= years; year++) {
  for (let day = 0; day < 365; day++) advanceDay(world, data);
  if (year % 10 === 0) checkpoint(world, 1820 + year);
}
