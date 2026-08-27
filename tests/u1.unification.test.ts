import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/generated';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { evaluateNationFormable, getFormableStatusesForNation } from '../src/sim/formables';
import {
  applyBalanceOfPowerPressure,
  evaluateDecision,
  takeDecision,
} from '../src/sim/systems/events';
import { opinionBetween, relationKindBetween } from '../src/sim/systems/diplomacy';
import { DECISION_DEFS } from '../src/data/decisions';

type WorldT = ReturnType<typeof createWorld>;

function noopPost() {
  // test log sink
}

function nationIdByTag(world: WorldT, tag: string): number {
  const id = world.nations.find((nation) => nation.tag === tag)?.id;
  if (id === undefined) throw new Error(`nation ${tag} missing`);
  return id;
}

function decisionById(id: string) {
  const def = DECISION_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`decision ${id} missing`);
  return def;
}

function formableByKey(key: string) {
  const formable = GAME_DATA.formables?.find((entry) => entry.key === key);
  if (!formable) throw new Error(`formable ${key} missing`);
  return formable;
}

function setPlayer(world: WorldT, nationId: number): void {
  world.playerNation = nationId;
  for (const nation of world.nations) nation.isPlayer = nation.id === nationId;
}

function jumpToYear(world: WorldT, year: number): void {
  world.day = Math.max(world.day, (year - 1830) * 365 + 10);
}

function sphereTags(world: WorldT, holderId: number, tags: string[]): void {
  const holder = world.nations[holderId];
  for (const tag of tags) {
    const id = nationIdByTag(world, tag);
    if (!holder.sphereMembers.includes(id)) holder.sphereMembers.push(id);
    world.nations[id].spheredBy = holderId;
  }
}

function transferStates(world: WorldT, stateIds: number[], toId: number): void {
  for (const stateId of stateIds) {
    const state = world.states[stateId];
    if (!state) continue;
    state.owner = toId;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      province.owner = toId;
      province.controller = toId;
      province.occupationProgress = 0;
    }
  }
}

describe('1.0-U1 — the Prussian unification arc', () => {
  it('GERMANY cores are the German Confederation, not the Habsburg empire', () => {
    const germany = formableByKey('GERMANY');
    // Post-overhaul ids are seed-derived: assert by geography, not literals.
    // Habsburg non-German lands must be out; every German-state, Prussian,
    // and Austrian-proper/Bohemian state must be in.
    const stateIds = (tags: string[], names?: string[]) => WORLD_SEED.provinces
      .filter((p) => tags.includes(p.ownerTag) && (!names || names.includes(p.stateName ?? p.name)))
      .map((p) => p.stateId);
    for (const wrong of stateIds(['AUS'], ['Hungary', 'Croatia', 'Galicia', 'Transylvania', 'Dalmatia', 'Lombardy-Venetia'])) {
      expect(germany.coreStateIds).not.toContain(wrong);
    }
    for (const right of [
      ...stateIds(['PRU', 'BAV', 'SAX', 'HAN', 'BAD', 'WUR', 'HES']),
      ...stateIds(['AUS'], ['Lower Austria', 'Upper Austria', 'Bohemia']),
    ]) {
      expect(germany.coreStateIds).toContain(right);
    }
    expect(germany.candidateTags).toContain('NGF');
  });

  it('zollverein is Prussia-only, year-gated, and warms the minor courts', () => {
    const world = createWorld(GAME_DATA, 4242);
    const prussia = nationIdByTag(world, 'PRU');
    const bavaria = nationIdByTag(world, 'BAV');
    setPlayer(world, prussia);
    world.nations[prussia].gpRank = Math.max(1, world.nations[prussia].gpRank);
    world.nations[prussia].treasury = 1_000;

    // year gate
    expect(evaluateDecision(world, GAME_DATA, prussia, decisionById('zollverein')).available).toBe(false);
    jumpToYear(world, 1830);
    expect(evaluateDecision(world, GAME_DATA, prussia, decisionById('zollverein')).available).toBe(true);

    // tag gate — France can never found the Zollverein
    const france = nationIdByTag(world, 'FRA');
    world.nations[france].treasury = 1_000;
    expect(evaluateDecision(world, GAME_DATA, france, decisionById('zollverein')).available).toBe(false);

    const before = opinionBetween(world, prussia, bavaria);
    const result = takeDecision(world, GAME_DATA, prussia, 'zollverein');
    expect(result.ok).toBe(true);
    expect(opinionBetween(world, prussia, bavaria)).toBeGreaterThanOrEqual(before + 40);

    // once: cannot repeat
    expect(evaluateDecision(world, GAME_DATA, prussia, decisionById('zollverein')).available).toBe(false);
  });

  it('the chain gates in order and the Brothers War grants usable free CBs', () => {
    const world = createWorld(GAME_DATA, 777);
    const prussia = nationIdByTag(world, 'PRU');
    const austria = nationIdByTag(world, 'AUS');
    setPlayer(world, prussia);
    const nation = world.nations[prussia];
    nation.gpRank = Math.max(1, nation.gpRank);
    nation.treasury = 1_000;
    nation.prestige = 100;
    jumpToYear(world, 1834);

    // german_question locked before zollverein
    expect(evaluateDecision(world, GAME_DATA, prussia, decisionById('german_question')).available).toBe(false);
    expect(takeDecision(world, GAME_DATA, prussia, 'zollverein').ok).toBe(true);

    // needs a third of the unification cores — sphere the north to cross it
    sphereTags(world, prussia, ['SAX', 'HAN', 'HES']);
    expect(takeDecision(world, GAME_DATA, prussia, 'german_question').ok).toBe(true);
    expect(relationKindBetween(world, prussia, austria)).toBe('rivalry');

    expect(takeDecision(world, GAME_DATA, prussia, 'brothers_war').ok).toBe(true);
    const infamyBefore = nation.infamy;
    applyCommand(world, GAME_DATA, { t: 'declareWar', target: austria, goal: 'humiliate', state: -1 }, noopPost);
    const war = world.wars.find((w) => w.attackers.includes(prussia) && w.defenders.includes(austria));
    expect(war).toBeTruthy();
    // the free CB means the cheap CB infamy cost, not the no-CB penalty (>=4)
    expect(nation.infamy - infamyBefore).toBeLessThan(2);
  });

  it('Prussia forms the North German Confederation, then Germany opens for NGF', () => {
    const world = createWorld(GAME_DATA, 909);
    const prussia = nationIdByTag(world, 'PRU');
    setPlayer(world, prussia);
    const nation = world.nations[prussia];
    nation.gpRank = Math.max(1, nation.gpRank);
    nation.spheredBy = -1;
    jumpToYear(world, 1849); // era gate: no NGF before the Springtime of Nations

    const ngf = formableByKey('NORTH_GERMAN_CONFEDERATION');
    transferStates(world, ngf.coreStateIds, prussia);
    const status = evaluateNationFormable(world, GAME_DATA, prussia, ngf);
    expect(status.ready).toBe(true);

    applyCommand(world, GAME_DATA, { t: 'formNation', key: 'NORTH_GERMAN_CONFEDERATION' }, noopPost);
    expect(nation.tag).toBe('NGF');
    expect(nation.name).toBe('North German Confederation');

    // Germany must list NGF as a candidate and count the same progress
    const germanyStatus = getFormableStatusesForNation(world, GAME_DATA, prussia)
      .find((entry) => entry.key === 'GERMANY');
    expect(germanyStatus).toBeTruthy();
    expect(germanyStatus!.controlledCoreStates).toBeGreaterThanOrEqual(4);
  });

  it('great powers sour on a near-complete unifier (France watches the Rhine)', () => {
    const world = createWorld(GAME_DATA, 1866);
    const prussia = nationIdByTag(world, 'PRU');
    const france = nationIdByTag(world, 'FRA');
    setPlayer(world, prussia);
    const nation = world.nations[prussia];
    nation.gpRank = Math.max(1, nation.gpRank);
    world.nations[france].gpRank = Math.max(1, world.nations[france].gpRank);

    // hand Prussia every German-Confederation core outside Austria proper —
    // rivalry threshold well crossed (ids derived, not literal)
    const confedOutsideAustria = WORLD_SEED.provinces
      .filter((p) => ['BAV', 'SAX', 'HAN', 'BAD', 'WUR', 'HES'].includes(p.ownerTag)
        || (p.ownerTag === 'AUS' && (p.stateName ?? p.name) === 'Bohemia'))
      .map((p) => p.stateId);
    transferStates(world, confedOutsideAustria, prussia);

    const before = opinionBetween(world, france, prussia);
    for (let i = 0; i < 12; i++) applyBalanceOfPowerPressure(world, GAME_DATA);
    const after = opinionBetween(world, france, prussia);
    expect(after).toBeLessThan(before - 20);
    expect(relationKindBetween(world, france, prussia)).toBe('rivalry');

    // fellow candidates of the SAME formable are exempt — Austria competes
    // for Germany rather than whining about it. Use a fresh world where only
    // GERMANY (not NGF, where Austria is no candidate) crosses the alarm
    // threshold: Prussia + the four southern/Bohemian cores = 5/9, while NGF
    // stays at 1/4.
    const world2 = createWorld(GAME_DATA, 1867);
    const prussia2 = nationIdByTag(world2, 'PRU');
    const austria2 = nationIdByTag(world2, 'AUS');
    const france2 = nationIdByTag(world2, 'FRA');
    world2.nations[prussia2].gpRank = Math.max(1, world2.nations[prussia2].gpRank);
    world2.nations[austria2].gpRank = Math.max(1, world2.nations[austria2].gpRank);
    world2.nations[france2].gpRank = Math.max(1, world2.nations[france2].gpRank);
    const southernCores = WORLD_SEED.provinces
      .filter((p) => ['BAV', 'BAD', 'WUR'].includes(p.ownerTag)
        || (p.ownerTag === 'AUS' && (p.stateName ?? p.name) === 'Bohemia'))
      .map((p) => p.stateId);
    transferStates(world2, southernCores, prussia2);
    const austriaBefore = opinionBetween(world2, austria2, prussia2);
    const franceBefore = opinionBetween(world2, france2, prussia2);
    applyBalanceOfPowerPressure(world2, GAME_DATA);
    expect(opinionBetween(world2, austria2, prussia2)).toBe(austriaBefore);
    expect(opinionBetween(world2, france2, prussia2)).toBeLessThan(franceBefore);
  });
});
