import { describe, expect, it } from 'vitest';
import { DECISION_DEFS } from '../src/data/decisions';
import { EVENT_DEFS } from '../src/data/events';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { applyCommand } from '../src/sim/commands';
import { Rng } from '../src/sim/rng';
import {
  applyEffects,
  evaluateDecision,
  forceFireEvent,
  getEventDef,
  isEventTriggerMet,
  resolvePendingEvent,
} from '../src/sim/systems/events';
import { advanceDay } from '../src/sim/world';

function noopPost() {
  // test log sink
}

function setPlayer(world: ReturnType<typeof createWorld>, nationId: number): void {
  world.playerNation = nationId;
  for (const nation of world.nations) nation.isPlayer = nation.id === nationId;
}

function raiseMilitancy(world: ReturnType<typeof createWorld>, nationId: number, value: number): void {
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop) continue;
      pop.militancy = value;
    }
  }
}

function jumpToYear(world: ReturnType<typeof createWorld>, year: number): void {
  world.day = Math.max(0, (year - 1830) * 365);
}

function snapshotEventHistory(world: ReturnType<typeof createWorld>): string {
  const fired = Object.entries(world.eventLastFired ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, day]) => `${key}@${day}`)
    .join('|');
  const pending = (world.pendingEvents ?? [])
    .map((event) => `${event.eventKey}:${event.nationId}:${event.instanceId}`)
    .sort()
    .join('|');
  return `${fired}::${pending}::${world.rngState}`;
}

function assertWorldFinite(world: ReturnType<typeof createWorld>, nationId: number): void {
  const nation = world.nations[nationId];
  expect(Number.isFinite(nation.treasury)).toBe(true);
  expect(Number.isFinite(nation.prestige)).toBe(true);
  expect(Number.isFinite(nation.infamy)).toBe(true);
  expect(Number.isFinite(nation.literacy)).toBe(true);
  expect(nation.treasury).toBeGreaterThan(-30_000);
  expect(nation.treasury).toBeLessThan(5_000_000);
  for (const pop of world.pops) {
    expect(Number.isFinite(pop.size)).toBe(true);
    expect(pop.size).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pop.militancy)).toBe(true);
    expect(pop.militancy).toBeGreaterThanOrEqual(0);
    expect(pop.militancy).toBeLessThanOrEqual(10);
  }
  for (const good of world.market) {
    expect(Number.isFinite(good.price)).toBe(true);
    expect(good.price).toBeGreaterThan(0);
    expect(Number.isFinite(good.worldStockpile)).toBe(true);
    expect(good.worldStockpile).toBeGreaterThanOrEqual(0);
  }
}

describe('E4 events & decisions', () => {
  it('fires Springtime of Nations when trigger is met and not otherwise', () => {
    const world = createWorld(GAME_DATA, 4401);
    const nationId = world.playerNation;
    const rng = new Rng(1);

    expect(isEventTriggerMet(world, GAME_DATA, nationId, 'springtime_of_nations')).toBe(false);
    expect(forceFireEvent(world, GAME_DATA, nationId, 'springtime_of_nations', rng)).toBe(false);

    jumpToYear(world, 1848);
    raiseMilitancy(world, nationId, 4.5);
    world.nations[nationId].isCivilized = true;

    expect(isEventTriggerMet(world, GAME_DATA, nationId, 'springtime_of_nations')).toBe(true);
    expect(forceFireEvent(world, GAME_DATA, nationId, 'springtime_of_nations', rng)).toBe(true);
    expect(world.pendingEvents.some((event) => event.eventKey === 'springtime_of_nations')).toBe(true);

    // once: true — cannot fire again for same nation
    expect(forceFireEvent(world, GAME_DATA, nationId, 'springtime_of_nations', rng)).toBe(false);
  });

  it('choosing a choice applies exactly its effects (1848 suppress vs concede differ)', () => {
    const base = createWorld(GAME_DATA, 4402);
    const nationId = base.playerNation;
    jumpToYear(base, 1848);
    raiseMilitancy(base, nationId, 5);
    base.nations[nationId].treasury = 1000;
    base.nations[nationId].prestige = 40;
    base.nations[nationId].reforms.voting_franchise = 0;
    base.nations[nationId].reforms.press_rights = 0;

    const spring = getEventDef('springtime_of_nations');
    expect(spring).toBeTruthy();
    const suppress = spring!.choices.find((choice) => choice.id === 'suppress')!;
    const concede = spring!.choices.find((choice) => choice.id === 'concede')!;

    const milBefore = (world: typeof base) => {
      let sum = 0;
      let count = 0;
      for (const province of world.provinces) {
        if (province.owner !== nationId) continue;
        for (const popId of province.popIds) {
          const pop = world.pops[popId];
          if (!pop || pop.size <= 0) continue;
          sum += pop.militancy;
          count += 1;
        }
      }
      return count > 0 ? sum / count : 0;
    };

    const suppressWorld = createWorld(GAME_DATA, 4402);
    jumpToYear(suppressWorld, 1848);
    raiseMilitancy(suppressWorld, nationId, 5);
    suppressWorld.nations[nationId].treasury = 1000;
    suppressWorld.nations[nationId].prestige = 40;
    suppressWorld.nations[nationId].reforms.voting_franchise = 0;
    suppressWorld.nations[nationId].reforms.press_rights = 0;

    const concedeWorld = createWorld(GAME_DATA, 4402);
    jumpToYear(concedeWorld, 1848);
    raiseMilitancy(concedeWorld, nationId, 5);
    concedeWorld.nations[nationId].treasury = 1000;
    concedeWorld.nations[nationId].prestige = 40;
    concedeWorld.nations[nationId].reforms.voting_franchise = 0;
    concedeWorld.nations[nationId].reforms.press_rights = 0;

    const baseMil = milBefore(suppressWorld);
    applyEffects(suppressWorld, GAME_DATA, nationId, suppress.effects);
    applyEffects(concedeWorld, GAME_DATA, nationId, concede.effects);

    expect(suppressWorld.nations[nationId].treasury).toBeCloseTo(1000 - 180, 5);
    expect(suppressWorld.nations[nationId].prestige).toBeCloseTo(32, 5);
    expect(milBefore(suppressWorld)).toBeGreaterThan(baseMil);

    expect(concedeWorld.nations[nationId].reforms.voting_franchise).toBe(1);
    expect(concedeWorld.nations[nationId].reforms.press_rights).toBe(1);
    expect(milBefore(concedeWorld)).toBeLessThan(baseMil);
    expect(concedeWorld.nations[nationId].treasury).not.toBe(suppressWorld.nations[nationId].treasury);
    expect(milBefore(concedeWorld)).not.toBeCloseTo(milBefore(suppressWorld), 1);

    // resolveEvent command path
    const cmdWorld = createWorld(GAME_DATA, 4403);
    setPlayer(cmdWorld, nationId);
    jumpToYear(cmdWorld, 1848);
    raiseMilitancy(cmdWorld, nationId, 5);
    cmdWorld.nations[nationId].treasury = 1000;
    const fired = forceFireEvent(cmdWorld, GAME_DATA, nationId, 'springtime_of_nations', new Rng(9));
    expect(fired).toBe(true);
    const pending = cmdWorld.pendingEvents.find((event) => event.eventKey === 'springtime_of_nations');
    expect(pending).toBeTruthy();
    applyCommand(cmdWorld, GAME_DATA, {
      t: 'resolveEvent',
      instanceId: pending!.instanceId,
      choiceId: 'concede',
    }, noopPost);
    expect(cmdWorld.pendingEvents.some((event) => event.instanceId === pending!.instanceId)).toBe(false);
    expect(cmdWorld.nations[nationId].reforms.voting_franchise).toBeGreaterThanOrEqual(1);
  });

  it('events are deterministic per seed over a long sim', () => {
    const run = (seed: number) => {
      const world = createWorld(GAME_DATA, seed);
      for (const nation of world.nations) {
        if (!nation.isCivilized) continue;
        raiseMilitancy(world, nation.id, 3.5);
      }
      for (let i = 0; i < 420; i++) advanceDay(world, GAME_DATA);
      return snapshotEventHistory(world);
    };

    expect(run(7711)).toBe(run(7711));
    expect(run(7711)).not.toBe(run(7712));
  }, 60_000);

  it('no event choice causes NaN, negative pop, or treasury explosion', () => {
    const world = createWorld(GAME_DATA, 5501);
    const nationId = world.playerNation;
    world.nations[nationId].treasury = 500;
    world.nations[nationId].prestige = 20;
    world.nations[nationId].isCivilized = true;
    world.nations[nationId].gpRank = 1;

    const popBefore = world.pops.reduce((sum, pop) => sum + Math.max(0, pop.size), 0);

    for (const event of EVENT_DEFS) {
      for (const choice of event.choices) {
        applyEffects(world, GAME_DATA, nationId, choice.effects);
        assertWorldFinite(world, nationId);
      }
    }

    const popAfter = world.pops.reduce((sum, pop) => sum + Math.max(0, pop.size), 0);
    expect(popAfter).toBe(popBefore);
  }, 30_000);

  it('decisions are gated by prerequisites', () => {
    const world = createWorld(GAME_DATA, 6601);
    const nationId = world.playerNation;
    const nation = world.nations[nationId];
    nation.treasury = 50;
    nation.isCivilized = true;

    const industrialization = DECISION_DEFS.find((d) => d.id === 'encourage_industrialization')!;
    const blocked = evaluateDecision(world, GAME_DATA, nationId, industrialization);
    expect(blocked.available).toBe(false);
    expect(blocked.reason.toLowerCase()).toMatch(/treasury|1838|available|factory/);

    jumpToYear(world, 1840);
    nation.treasury = 500;
    // BALANCE: encourage_industrialization now requires an existing factory.
    const ownedState = world.states.find((state) => state.owner === nationId);
    expect(ownedState).toBeTruthy();
    ownedState!.factories.push({
      recipe: 'factory_furniture',
      level: 1,
      employed: 0,
      stockpileIn: 0,
      profitTrend: 0,
      weeklyProfit: 0,
      cashReserve: 0,
      workerShare: 0,
      clerkShare: 0,
      lastOutput: 0,
      profitableWeeks: 0,
      lossWeeks: 0,
      lastInputCost: 0,
      lastWages: 0,
      lastOperating: 0,
      lastCapacity: 0,
      lastInputFill: 0,
    });
    const open = evaluateDecision(world, GAME_DATA, nationId, industrialization);
    expect(open.available).toBe(true);

    applyCommand(world, GAME_DATA, { t: 'takeDecision', decision: 'encourage_industrialization' }, noopPost);
    const after = evaluateDecision(world, GAME_DATA, nationId, industrialization);
    expect(after.available).toBe(false);
    expect(after.reason.toLowerCase()).toContain('cooldown');
  });

  it('resolvePendingEvent rejects unavailable choices', () => {
    const world = createWorld(GAME_DATA, 6701);
    const nationId = world.playerNation;
    jumpToYear(world, 1848);
    raiseMilitancy(world, nationId, 5);
    world.nations[nationId].treasury = 500;
    forceFireEvent(world, GAME_DATA, nationId, 'market_panic', new Rng(4));
    const pending = world.pendingEvents.find((event) => event.eventKey === 'market_panic');
    expect(pending).toBeTruthy();
    world.nations[nationId].treasury = 50;
    const result = resolvePendingEvent(world, GAME_DATA, nationId, pending!.instanceId, 'bailout');
    expect(result.ok).toBe(false);
  });
});
