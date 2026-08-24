import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { evaluateNationFormable } from '../src/sim/formables';
import { evaluateDecision, takeDecision } from '../src/sim/systems/events';
import { opinionBetween } from '../src/sim/systems/diplomacy';
import { DECISION_DEFS } from '../src/data/decisions';

type WorldT = ReturnType<typeof createWorld>;

function noopPost() { /* sink */ }
function idByTag(world: WorldT, tag: string): number {
  const id = world.nations.find((nation) => nation.tag === tag)?.id;
  if (id === undefined) throw new Error(`${tag} missing`);
  return id;
}
function decision(id: string) {
  const def = DECISION_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`${id} missing`);
  return def;
}
function jumpToYear(world: WorldT, year: number): void {
  world.day = Math.max(world.day, (year - 1820) * 365 + 10);
}

describe('1.0-U2 — the Risorgimento', () => {
  it('ITALY cores include Austrian constituent Lombardy-Venetia', () => {
    const italy = GAME_DATA.formables?.find((entry) => entry.key === 'ITALY');
    expect(italy).toBeTruthy();
    const lombardy = WORLD_SEED.provinces.find((p) => p.name === 'Lombardy-Venetia')!.stateId;
    expect(italy!.coreStateIds).toContain(lombardy);
    expect(italy!.yearAtLeast).toBe(1848);
  });

  it('the chain gates in order and arms Piedmont against Naples, Rome and Vienna', () => {
    const world = createWorld(GAME_DATA, 1859);
    const sar = idByTag(world, 'SAR');
    const fra = idByTag(world, 'FRA');
    const aus = idByTag(world, 'AUS');
    const tsc = idByTag(world, 'TSC');
    world.playerNation = sar;
    for (const nation of world.nations) nation.isPlayer = nation.id === sar;
    const piedmont = world.nations[sar];
    piedmont.gpRank = Math.max(1, piedmont.gpRank);
    piedmont.treasury = 2_000;
    piedmont.prestige = 100;
    jumpToYear(world, 1842);

    expect(evaluateDecision(world, GAME_DATA, sar, decision('french_entente')).available).toBe(false);
    expect(takeDecision(world, GAME_DATA, sar, 'il_risorgimento').ok).toBe(true);

    const fraBefore = opinionBetween(world, sar, fra);
    expect(takeDecision(world, GAME_DATA, sar, 'french_entente').ok).toBe(true);
    expect(opinionBetween(world, sar, fra)).toBeGreaterThanOrEqual(fraBefore + 60);

    // sphere the northern minors to cross the expedition gate (2 of 7 cores)
    for (const tag of ['MOD', 'PAR']) {
      const id = idByTag(world, tag);
      piedmont.sphereMembers.push(id);
      world.nations[id].spheredBy = sar;
    }
    expect(takeDecision(world, GAME_DATA, sar, 'expedition_of_the_thousand').ok).toBe(true);

    // free CB against Naples is consumable at declare-war prices
    const infamyBefore = piedmont.infamy;
    applyCommand(world, GAME_DATA, { t: 'declareWar', target: tsc, goal: 'add_to_sphere', state: -1 }, noopPost);
    expect(world.wars.some((war) => war.attackers.includes(sar) && war.defenders.includes(tsc))).toBe(true);
    expect(piedmont.infamy - infamyBefore).toBeLessThan(2.5);

    // Austria CB from the entente exists too
    expect(opinionBetween(world, sar, aus)).toBeLessThan(0);
  });

  it('era gate holds for Italy', () => {
    const world = createWorld(GAME_DATA, 1861);
    const sar = idByTag(world, 'SAR');
    const italy = GAME_DATA.formables!.find((entry) => entry.key === 'ITALY')!;
    const nation = world.nations[sar];
    nation.gpRank = Math.max(1, nation.gpRank);
    nation.spheredBy = -1;
    // hand Piedmont everything — still gated before 1848
    for (const stateId of italy.coreStateIds) {
      const state = world.states[stateId];
      if (!state) continue;
      state.owner = sar;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (province) { province.owner = sar; province.controller = sar; }
      }
    }
    expect(evaluateNationFormable(world, GAME_DATA, sar, italy).ready).toBe(false);
    jumpToYear(world, 1849);
    expect(evaluateNationFormable(world, GAME_DATA, sar, italy).ready).toBe(true);
  });
});
