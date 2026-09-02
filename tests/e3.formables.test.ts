import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { applyCommand } from '../src/sim/commands';
import { evaluateNationFormable } from '../src/sim/formables';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

function noopPost() {
  // test log sink
}

function nationIdByTag(world: ReturnType<typeof createWorld>, tag: string): number {
  return world.nations.find((nation) => nation.tag === tag)?.id ?? -1;
}

function germanFormable() {
  const formable = GAME_DATA.formables?.find((entry) => entry.key === 'GERMANY');
  if (!formable) throw new Error('GERMANY formable is missing from GAME_DATA.');
  return formable;
}

function jumpToYear(world: ReturnType<typeof createWorld>, year: number): void {
  world.day = Math.max(world.day, (year - 1830) * 365 + 10);
}

function setPlayerNation(world: ReturnType<typeof createWorld>, nationId: number): void {
  world.playerNation = nationId;
  for (const nation of world.nations) nation.isPlayer = nation.id === nationId;
}

function satisfyGermanCoreControlBySphere(world: ReturnType<typeof createWorld>, prussiaId: number): void {
  const formable = germanFormable();
  const prussia = world.nations[prussiaId];
  const owners = new Set<number>();
  for (const stateId of formable.coreStateIds) {
    const owner = world.states[stateId]?.owner;
    if (owner === undefined || owner < 0 || owner === prussiaId) continue;
    owners.add(owner);
  }
  prussia.sphereMembers = Array.from(owners).sort((a, b) => a - b);
  for (const ownerId of prussia.sphereMembers) {
    const nation = world.nations[ownerId];
    if (!nation) continue;
    nation.spheredBy = prussiaId;
  }
}

function transferGermanCoresToPrussia(world: ReturnType<typeof createWorld>, prussiaId: number): void {
  const formable = germanFormable();
  for (const stateId of formable.coreStateIds) {
    const state = world.states[stateId];
    if (!state) continue;
    state.owner = prussiaId;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      province.owner = prussiaId;
      province.controller = prussiaId;
      province.occupationProgress = 0;
    }
  }
}

function assertWorldValidity(world: ReturnType<typeof createWorld>): void {
  for (const province of world.provinces) {
    expect(world.nations[province.owner]).toBeTruthy();
    expect(province.neighbors.length).toBeGreaterThanOrEqual(1);
  }
}

describe('E3 formable nations', () => {
  it('gates Germany requirements by core control and great-power rank', () => {
    const world = createWorld(GAME_DATA, 8301);
    const prussiaId = nationIdByTag(world, 'PRU');
    expect(prussiaId).toBeGreaterThanOrEqual(0);
    const formable = germanFormable();

    const earlyStatus = evaluateNationFormable(world, GAME_DATA, prussiaId, formable);
    expect(earlyStatus.ready).toBe(false);
    expect(earlyStatus.requirements.find((entry) => entry.key === 'core_control')?.met).toBe(false);

    for (const stateId of formable.coreStateIds) {
      const state = world.states[stateId];
      if (!state) continue;
      state.owner = prussiaId;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        province.owner = prussiaId;
        province.controller = prussiaId;
      }
    }
    world.nations[prussiaId].gpRank = 0;
    const noGpStatus = evaluateNationFormable(world, GAME_DATA, prussiaId, formable);
    expect(noGpStatus.ready).toBe(false); // era still gates in 1830
    // Post-world-overhaul: a Prussia holding every German core is within
    // striking distance of the eighth seat, so the #34 near-GP clause admits
    // it even at gpRank 0. The strict-rank path is covered by weaker tags.
    expect(noGpStatus.requirements.find((entry) => entry.key === 'power')?.met).toBe(true);

    world.nations[prussiaId].gpRank = 1;
    const preEraStatus = evaluateNationFormable(world, GAME_DATA, prussiaId, formable);
    expect(preEraStatus.ready).toBe(false); // era gate: no Germany in 1830
    expect(preEraStatus.requirements.find((entry) => entry.key === 'era')?.met).toBe(false);

    jumpToYear(world, 1849);
    const readyStatus = evaluateNationFormable(world, GAME_DATA, prussiaId, formable);
    expect(readyStatus.ready).toBe(true);
  });

  it('forming Germany via sphere meets requirements but does not free-annex sphered cores', () => {
    const world = createWorld(GAME_DATA, 8302);
    const prussiaId = nationIdByTag(world, 'PRU');
    expect(prussiaId).toBeGreaterThanOrEqual(0);
    const formable = germanFormable();
    setPlayerNation(world, prussiaId);
    satisfyGermanCoreControlBySphere(world, prussiaId);
    world.nations[prussiaId].gpRank = Math.max(1, world.nations[prussiaId].gpRank);
    jumpToYear(world, 1849);
    const prestigeBefore = world.nations[prussiaId].prestige;

    const ownersBefore = new Map(
      formable.coreStateIds.map((stateId) => [stateId, world.states[stateId]?.owner ?? -1]),
    );

    const precheck = evaluateNationFormable(world, GAME_DATA, prussiaId, formable);
    expect(precheck.ready).toBe(true);
    expect((precheck.spheredCoreCount ?? 0)).toBeGreaterThan(0);

    applyCommand(world, GAME_DATA, { t: 'formNation', key: 'GERMANY' }, noopPost);

    const prussia = world.nations[prussiaId];
    expect(prussia.tag).toBe('GER');
    expect(prussia.name).toBe('German Empire');
    expect(prussia.prestige).toBeGreaterThan(prestigeBefore);

    // Sphered cores must remain with their owners — no free annex on proclaim.
    for (const stateId of formable.coreStateIds) {
      const state = world.states[stateId];
      const beforeOwner = ownersBefore.get(stateId);
      expect(state?.owner).toBe(beforeOwner);
    }

    assertWorldValidity(world);
  });

  it('forming Germany with owned cores keeps those cores and world valid', () => {
    const world = createWorld(GAME_DATA, 8305);
    const prussiaId = nationIdByTag(world, 'PRU');
    expect(prussiaId).toBeGreaterThanOrEqual(0);
    const formable = germanFormable();
    setPlayerNation(world, prussiaId);
    transferGermanCoresToPrussia(world, prussiaId);
    world.nations[prussiaId].gpRank = Math.max(1, world.nations[prussiaId].gpRank);
    jumpToYear(world, 1849);

    applyCommand(world, GAME_DATA, { t: 'formNation', key: 'GERMANY' }, noopPost);

    const prussia = world.nations[prussiaId];
    expect(prussia.tag).toBe('GER');
    for (const stateId of formable.coreStateIds) {
      expect(world.states[stateId]?.owner).toBe(prussiaId);
    }
    assertWorldValidity(world);
  });

  it('AI Prussia forms Germany once requirements are met', () => {
    const world = createWorld(GAME_DATA, 8303);
    const prussiaId = nationIdByTag(world, 'PRU');
    expect(prussiaId).toBeGreaterThanOrEqual(0);
    world.nations[prussiaId].isPlayer = false;
    world.nations[world.playerNation].isPlayer = true;
    transferGermanCoresToPrussia(world, prussiaId);
    world.nations[prussiaId].gpRank = 1;
    world.nations[prussiaId].prestige = 500;
    world.nations[prussiaId].spheredBy = -1;
    jumpToYear(world, 1849);

    let formed = false;
    for (let day = 0; day < 365 * 3; day++) {
      advanceDay(world, GAME_DATA);
      if (world.nations[prussiaId].tag === 'GER') {
        formed = true;
        break;
      }
    }
    expect(formed).toBe(true);
  });

  it('produces deterministic formation outcomes for same seed', () => {
    const a = createWorld(GAME_DATA, 8304);
    const b = createWorld(GAME_DATA, 8304);
    const prussiaA = nationIdByTag(a, 'PRU');
    const prussiaB = nationIdByTag(b, 'PRU');
    expect(prussiaA).toBe(prussiaB);
    transferGermanCoresToPrussia(a, prussiaA);
    transferGermanCoresToPrussia(b, prussiaB);
    a.nations[prussiaA].gpRank = 1;
    b.nations[prussiaB].gpRank = 1;
    a.nations[prussiaA].prestige = 500;
    b.nations[prussiaB].prestige = 500;
    jumpToYear(a, 1849);
    jumpToYear(b, 1849);

    for (let day = 0; day < 365; day++) {
      advanceDay(a, GAME_DATA);
      advanceDay(b, GAME_DATA);
    }

    expect(a.nations[prussiaA].tag).toBe(b.nations[prussiaB].tag);
    expect(a.nations[prussiaA].name).toBe(b.nations[prussiaB].name);
    expect(Number(a.nations[prussiaA].prestige.toFixed(4))).toBe(Number(b.nations[prussiaB].prestige.toFixed(4)));
    expect(a.provinces.map((province) => province.owner)).toEqual(b.provinces.map((province) => province.owner));
    expect(a.states.map((state) => state.owner)).toEqual(b.states.map((state) => state.owner));
  }, 60_000);
});
