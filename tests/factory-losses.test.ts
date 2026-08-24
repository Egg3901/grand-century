import { describe, expect, it } from 'vitest';
import { applyFactoryProfit } from '../src/sim/systems/economy';
import type { Factory } from '../src/shared/types';

/** Minimal factory stub with zeroed counters. */
function stubFactory(overrides: Partial<Factory> = {}): Factory {
  return {
    recipe: 'test',
    level: 3,
    employed: 500,
    stockpileIn: 0,
    profitTrend: 0,
    weeklyProfit: 0,
    cashReserve: 0,
    workerShare: 400,
    clerkShare: 100,
    lastOutput: 0,
    profitableWeeks: 0,
    lossWeeks: 0,
    lastInputCost: 0,
    lastWages: 0,
    lastOperating: 0,
    lastCapacity: 0,
    lastInputFill: 0,
    ...overrides,
  };
}

describe('applyFactoryProfit - negative profit accounting', () => {
  it('records negative rawProfit as weeklyProfit without a floor', () => {
    const factory = stubFactory();
    applyFactoryProfit(factory, -2.5, 500, false);
    expect(factory.weeklyProfit).toBe(-2.5);
  });

  it('records zero rawProfit as weeklyProfit', () => {
    const factory = stubFactory();
    applyFactoryProfit(factory, 0, 500, false);
    expect(factory.weeklyProfit).toBe(0);
  });

  it('records positive rawProfit as weeklyProfit', () => {
    const factory = stubFactory();
    applyFactoryProfit(factory, 1.8, 500, false);
    expect(factory.weeklyProfit).toBe(1.8);
  });

  it('decreases cashReserve on negative profit', () => {
    const factory = stubFactory({ cashReserve: 50 });
    applyFactoryProfit(factory, -3.0, 500, false);
    expect(factory.cashReserve).toBe(47);
  });

  it('clamps cashReserve at -400', () => {
    const factory = stubFactory({ cashReserve: -398 });
    applyFactoryProfit(factory, -5.0, 500, false);
    expect(factory.cashReserve).toBe(-400);
  });

  it('increments lossWeeks on negative profit', () => {
    const factory = stubFactory({ lossWeeks: 2 });
    applyFactoryProfit(factory, -1.0, 500, false);
    expect(factory.lossWeeks).toBe(3);
  });

  it('resets lossWeeks to 0 on non-negative profit', () => {
    const factory = stubFactory({ lossWeeks: 5 });
    applyFactoryProfit(factory, 0.01, 500, false);
    expect(factory.lossWeeks).toBe(0);
  });

  it('increments profitableWeeks on non-negative profit', () => {
    const factory = stubFactory({ profitableWeeks: 10 });
    applyFactoryProfit(factory, 0.5, 500, false);
    expect(factory.profitableWeeks).toBe(11);
  });

  it('resets profitableWeeks to 0 on negative profit', () => {
    const factory = stubFactory({ profitableWeeks: 20 });
    applyFactoryProfit(factory, -0.5, 500, false);
    expect(factory.profitableWeeks).toBe(0);
  });

  it('smooths profitTrend toward the raw profit', () => {
    const factory = stubFactory({ profitTrend: 1.0 });
    applyFactoryProfit(factory, -2.0, 500, false);
    // trend = 1.0 * 0.72 + (-2.0) * 0.28 = 0.72 - 0.56 = 0.16
    expect(factory.profitTrend).toBeCloseTo(0.16, 10);
  });

  it('accumulates multiple consecutive losses correctly', () => {
    const factory = stubFactory({ cashReserve: 100 });
    applyFactoryProfit(factory, -1.0, 500, false);
    applyFactoryProfit(factory, -1.0, 500, false);
    applyFactoryProfit(factory, -1.0, 500, false);
    expect(factory.weeklyProfit).toBe(-1.0);
    expect(factory.lossWeeks).toBe(3);
    expect(factory.profitableWeeks).toBe(0);
    expect(factory.cashReserve).toBe(97);
  });
});
