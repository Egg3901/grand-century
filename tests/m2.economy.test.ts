import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { Rng } from '../src/sim/rng';
import { runPopsMonthly } from '../src/sim/systems/pops';
import { advanceDay } from '../src/sim/world';

function disableAi(world: ReturnType<typeof createWorld>) {
  for (const nation of world.nations) nation.isPlayer = true;
}

describe('M2 economy loop', () => {
  it('conserves market flow over one year', () => {
    const world = createWorld(GAME_DATA, 1836);
    disableAi(world);
    const yearlySupply = new Array(world.market.length).fill(0);
    const yearlySold = new Array(world.market.length).fill(0);

    for (let day = 0; day < 365; day++) {
      advanceDay(world, GAME_DATA);
      if (world.day % 7 !== 0) continue;
      for (let i = 0; i < world.market.length; i++) {
        const good = world.market[i];
        yearlySupply[i] += good.supply;
        yearlySold[i] += good.sold;
        expect(Number.isFinite(good.price)).toBe(true);
        expect(Number.isFinite(good.supply)).toBe(true);
        expect(Number.isFinite(good.demand)).toBe(true);
        expect(Number.isFinite(good.sold)).toBe(true);
      }
      for (const invariant of world.marketInvariants) {
        expect(invariant.ok).toBe(true);
        expect(Number.isFinite(invariant.residual)).toBe(true);
      }
    }

    for (let i = 0; i < yearlySupply.length; i++) {
      expect(yearlySupply[i]).toBeCloseTo(yearlySold[i], 6);
    }
  });

  it('bankrupts an overextended nation within years', () => {
    const world = createWorld(GAME_DATA, 45);
    disableAi(world);
    const nationId = world.playerNation;
    const nation = world.nations[nationId];
    nation.taxRatePoor = 0;
    nation.taxRateMiddle = 0;
    nation.taxRateRich = 0;
    nation.tariffRate = -1;
    nation.treasury = 200;

    for (let i = 0; i < 40; i++) {
      world.armies.push({
        id: world.nextArmyId++,
        owner: nationId,
        location: nation.capital,
        moveTarget: -1,
        moveProgress: 0,
        regiments: Array.from({ length: 28 }, () => ({
          type: 'infantry',
          strength: 1000,
          organization: 60,
          sourcePop: 0,
        })),
        leader: null,
        rebel: false,
        hostileTo: -1,
      });
    }

    const years = 8;
    let sawBankruptcy = false;
    for (let day = 0; day < 365 * years; day++) {
      advanceDay(world, GAME_DATA);
      if (world.nations[nationId].isBankrupt) sawBankruptcy = true;
    }
    expect(sawBankruptcy).toBe(true);
  }, 15_000);

  it('grows well-fed pops and shrinks starving pops', () => {
    const world = createWorld(GAME_DATA, 99);
    disableAi(world);
    const wellFed = world.pops[0];
    const starving = world.pops[1];
    wellFed.type = 'aristocrat';
    starving.type = 'aristocrat';
    wellFed.size = 10000;
    starving.size = 10000;
    wellFed.needsMet = 0.95;
    starving.needsMet = 0.1;

    runPopsMonthly(world, GAME_DATA, new Rng(world.rngState));
    expect(wellFed.size).toBeGreaterThan(10000);
    expect(starving.size).toBeLessThan(10000);
  });

  it('is deterministic for identical seed over five years', () => {
    const a = createWorld(GAME_DATA, 1234);
    const b = createWorld(GAME_DATA, 1234);
    disableAi(a);
    disableAi(b);
    const days = 365 * 5;
    for (let i = 0; i < days; i++) {
      advanceDay(a, GAME_DATA);
      advanceDay(b, GAME_DATA);
    }
    const treasuryA = a.nations[a.playerNation].treasury;
    const treasuryB = b.nations[b.playerNation].treasury;
    expect(treasuryA).toBeCloseTo(treasuryB, 9);
  }, 15_000);
});
