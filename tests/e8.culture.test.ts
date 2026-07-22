/**
 * 0.8.0 Age of Nationalism — culture system tests.
 *
 * Covers: minority seeding (cultural geography), non-accepted unrest pressure,
 * assimilation (flow, conservation, policy scaling, movement resistance),
 * national movement formation -> independence uprising (under the existing
 * BALANCE.rebellion caps), acceptance commands, old-save self-healing,
 * determinism and multi-year stability (no NaN, bounded rebellions).
 */
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import { buildSnapshot } from '../src/sim/snapshot';
import { Rng } from '../src/sim/rng';
import { BALANCE } from '../src/sim/balance';
import {
  CULTURE_TUNING,
  ensureCultureState,
  runCultureMonthly,
  setCultureAccepted,
  setCulturePolicy,
  buildCultureLedger,
  buildMovementViews,
} from '../src/sim/systems/culture';
import type { World } from '../src/shared/types';

function cultureIdx(key: string): number {
  const index = GAME_DATA.cultures.findIndex((culture) => culture.key === key);
  if (index < 0) throw new Error(`missing culture ${key}`);
  return index;
}

function nationByTag(world: World, tag: string) {
  const nation = world.nations.find((candidate) => candidate.tag === tag);
  if (!nation) throw new Error(`missing nation ${tag}`);
  return nation;
}

function nationCultureSize(world: World, nationId: number, culture: number): number {
  let total = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0 || pop.culture !== culture) continue;
    const province = world.provinces[pop.provinceId];
    if (!province || province.owner !== nationId) continue;
    total += pop.size;
  }
  return total;
}

function nationPopTotal(world: World, nationId: number): number {
  let total = 0;
  for (const pop of world.pops) {
    if (pop.size <= 0) continue;
    const province = world.provinces[pop.provinceId];
    if (!province || province.owner !== nationId) continue;
    total += pop.size;
  }
  return total;
}

function runMonths(world: World, months: number): void {
  const rng = new Rng(world.rngState);
  for (let i = 0; i < months; i++) runCultureMonthly(world, GAME_DATA, rng);
  world.rngState = rng.state;
}

describe('E8 culture — seeding', () => {
  const world = createWorld(GAME_DATA, 4242);

  it('seeds historical minorities inside the great empires', () => {
    const eng = nationByTag(world, 'ENG');
    const aus = nationByTag(world, 'AUS');
    const rus = nationByTag(world, 'RUS');
    const ott = nationByTag(world, 'OTT');
    expect(nationCultureSize(world, eng.id, cultureIdx('irish'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, eng.id, cultureIdx('south_asian'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, aus.id, cultureIdx('hungarian'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, aus.id, cultureIdx('italian'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, rus.id, cultureIdx('polish'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, rus.id, cultureIdx('finnish'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, ott.id, cultureIdx('greek'))).toBeGreaterThan(0);
    expect(nationCultureSize(world, ott.id, cultureIdx('arabic'))).toBeGreaterThan(0);
  });

  it('keeps minorities non-accepted at start (only the primary culture is accepted)', () => {
    const aus = nationByTag(world, 'AUS');
    expect(aus.acceptedCultures).toEqual([aus.primaryCulture]);
    expect(aus.acceptedCultures).not.toContain(cultureIdx('hungarian'));
  });

  it('gives every pop a valid culture and religion index', () => {
    for (const pop of world.pops) {
      expect(GAME_DATA.cultures[pop.culture]).toBeDefined();
      expect(GAME_DATA.religions[pop.religion]).toBeDefined();
    }
  });

  it('fixes coarse primary cultures (Spain is Iberian, Sardinia is Italian)', () => {
    expect(nationByTag(world, 'ESP').primaryCulture).toBe(cultureIdx('iberian'));
    expect(nationByTag(world, 'SAR').primaryCulture).toBe(cultureIdx('italian'));
    expect(nationByTag(world, 'PER').primaryCulture).toBe(cultureIdx('persian'));
  });

  it('seeds soldiers only from the state nation (accepted culture recruits)', () => {
    const aus = nationByTag(world, 'AUS');
    for (const pop of world.pops) {
      if (pop.type !== 'soldier' || pop.size <= 0) continue;
      const province = world.provinces[pop.provinceId];
      if (!province || province.owner !== aus.id) continue;
      expect(pop.culture).toBe(aus.primaryCulture);
    }
  });
});

describe('E8 culture — non-accepted pressure & assimilation', () => {
  it('raises militancy for non-accepted pops but not accepted ones', () => {
    const world = createWorld(GAME_DATA, 555);
    const aus = nationByTag(world, 'AUS');
    const hungarian = cultureIdx('hungarian');
    // Stabilize inputs.
    for (const pop of world.pops) {
      pop.militancy = 1;
      pop.consciousness = 2;
      pop.needsMet = 0.7;
    }
    const before = world.pops.map((pop) => pop.militancy);
    runMonths(world, 1);
    let sawMinorityRise = false;
    for (const pop of world.pops) {
      const province = world.provinces[pop.provinceId];
      if (!province || province.owner !== aus.id || pop.size <= 0) continue;
      if (pop.culture === hungarian) {
        expect(pop.militancy).toBeGreaterThan(before[pop.id] ?? 1);
        sawMinorityRise = true;
      } else if (pop.culture === aus.primaryCulture) {
        expect(pop.militancy).toBeLessThanOrEqual(before[pop.id] ?? 1);
      }
    }
    expect(sawMinorityRise).toBe(true);
  });

  it('assimilates isolated minorities toward the primary culture, conserving people', () => {
    const world = createWorld(GAME_DATA, 777);
    const rus = nationByTag(world, 'RUS');
    const germanIdx = cultureIdx('north_german');
    // Kaliningrad Germans: a minority mostly surrounded by Russians.
    const startMinority = nationCultureSize(world, rus.id, germanIdx);
    const startTotal = nationPopTotal(world, rus.id);
    expect(startMinority).toBeGreaterThan(0);
    // Keep pops calm so no movement forms and sizes only change via assimilation.
    for (const pop of world.pops) {
      pop.consciousness = 0.5;
      pop.militancy = 0.5;
      pop.needsMet = 0.8;
    }
    runMonths(world, 24);
    const endMinority = nationCultureSize(world, rus.id, germanIdx);
    const endTotal = nationPopTotal(world, rus.id);
    expect(endMinority).toBeLessThan(startMinority);
    expect(endTotal).toBe(startTotal); // assimilation moves people, never creates or destroys them
    const primaryEnd = nationCultureSize(world, rus.id, rus.primaryCulture);
    expect(primaryEnd).toBeGreaterThan(0);
  });

  it('melts minorities faster under exclusionary policy than pluralist', () => {
    const measure = (policy: 'exclusionary' | 'pluralist'): number => {
      const world = createWorld(GAME_DATA, 888);
      const rus = nationByTag(world, 'RUS');
      // Policy flips now cost prestige + cooldown (intentional balance change).
      rus.prestige = 50;
      rus.culturePolicyChangedDay = -1;
      setCulturePolicy(world, rus.id, policy);
      for (const pop of world.pops) {
        pop.consciousness = 0.5;
        pop.militancy = 0.5;
        pop.needsMet = 0.8;
      }
      const idx = cultureIdx('ukrainian');
      const start = nationCultureSize(world, rus.id, idx);
      runMonths(world, 24);
      return start - nationCultureSize(world, rus.id, idx);
    };
    const exclusionary = measure('exclusionary');
    const pluralist = measure('pluralist');
    expect(exclusionary).toBeGreaterThan(pluralist);
  });

  it('produces no NaN and keeps militancy/consciousness in bounds', () => {
    const world = createWorld(GAME_DATA, 999);
    runMonths(world, 36);
    for (const pop of world.pops) {
      expect(Number.isFinite(pop.size)).toBe(true);
      expect(pop.size).toBeGreaterThanOrEqual(0);
      expect(pop.militancy).toBeGreaterThanOrEqual(0);
      expect(pop.militancy).toBeLessThanOrEqual(10);
      expect(pop.consciousness).toBeGreaterThanOrEqual(0);
      expect(pop.consciousness).toBeLessThanOrEqual(10);
      expect(Number.isFinite(pop.money)).toBe(true);
    }
  });
});

describe('E8 culture — national movements & uprisings', () => {
  function angryHungary(seed: number): World {
    const world = createWorld(GAME_DATA, seed);
    const aus = nationByTag(world, 'AUS');
    const hungarian = cultureIdx('hungarian');
    // Policy flips now cost prestige + cooldown (intentional balance change).
    aus.prestige = 50;
    aus.culturePolicyChangedDay = -1;
    setCulturePolicy(world, aus.id, 'exclusionary');
    for (const pop of world.pops) {
      const province = world.provinces[pop.provinceId];
      if (!province || province.owner !== aus.id || pop.size <= 0) continue;
      if (pop.culture === hungarian) {
        pop.consciousness = 6;
        pop.militancy = 6;
        pop.needsMet = 0.3;
      }
    }
    return world;
  }

  it('forms a movement for a large conscious non-accepted culture', () => {
    const world = angryHungary(1848);
    runMonths(world, 2);
    const aus = nationByTag(world, 'AUS');
    const movement = (world.movements ?? []).find(
      (candidate) => candidate.nation === aus.id && candidate.culture === cultureIdx('hungarian'),
    );
    expect(movement).toBeDefined();
    expect(movement!.heartlandStateIds.length).toBeGreaterThan(0);
    expect(movement!.adherents).toBeGreaterThan(0);
  });

  it('escalates radicalism and launches an independence uprising within the rebellion caps', () => {
    const world = angryHungary(1849);
    const aus = nationByTag(world, 'AUS');
    const hungarian = cultureIdx('hungarian');
    runMonths(world, 60);
    const rebellion = world.rebellions.find(
      (candidate) => candidate.targetNation === aus.id
        && candidate.demand.type === 'independence'
        && candidate.demand.culture === hungarian,
    );
    expect(rebellion).toBeDefined();
    expect(rebellion!.demand.stateIds!.length).toBeGreaterThan(0);
    expect(rebellion!.demand.stateIds!.length).toBeLessThanOrEqual(CULTURE_TUNING.uprisingMaxStates);
    const rebelArmy = world.armies.find((army) => army.rebel && army.rebellionId === rebellion!.id);
    expect(rebelArmy).toBeDefined();
    expect(rebelArmy!.regiments.length).toBeLessThanOrEqual(BALANCE.rebellion.spawnRegimentMax);
    // Caps hold: never more active rebellions than the per-nation cap.
    const active = world.rebellions.filter(
      (candidate) => candidate.status === 'active' && candidate.targetNation === aus.id,
    );
    expect(active.length).toBeLessThanOrEqual(BALANCE.rebellion.nationActiveCap);
    // Movement cooled down after marching.
    const movement = (world.movements ?? []).find(
      (candidate) => candidate.nation === aus.id && candidate.culture === hungarian,
    );
    expect(movement).toBeDefined();
    expect(movement!.lastUprisingDay).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds world/nation rebellion caps even with many angry minorities', () => {
    const world = createWorld(GAME_DATA, 1850);
    // Policy flips now cost prestige + cooldown (intentional balance change).
    for (const nation of world.nations) {
      nation.prestige = 50;
      nation.culturePolicyChangedDay = -1;
      setCulturePolicy(world, nation.id, 'exclusionary');
    }
    for (const pop of world.pops) {
      pop.consciousness = 7;
      pop.militancy = 7;
      pop.needsMet = 0.2;
    }
    runMonths(world, 72);
    const active = world.rebellions.filter((candidate) => candidate.status === 'active');
    expect(active.length).toBeLessThanOrEqual(BALANCE.rebellion.worldActiveCap);
    const byNation = new Map<number, number>();
    for (const rebellion of active) {
      byNation.set(rebellion.targetNation, (byNation.get(rebellion.targetNation) ?? 0) + 1);
    }
    for (const count of byNation.values()) {
      expect(count).toBeLessThanOrEqual(BALANCE.rebellion.nationActiveCap);
    }
  });

  it('grant acceptance calms the minority and unwinds its movement', () => {
    const world = angryHungary(1867); // the Ausgleich test
    const aus = nationByTag(world, 'AUS');
    const hungarian = cultureIdx('hungarian');
    runMonths(world, 6);
    const movement = (world.movements ?? []).find(
      (candidate) => candidate.nation === aus.id && candidate.culture === hungarian,
    );
    expect(movement).toBeDefined();
    const radicalBefore = movement!.radicalism;
    const milBefore = world.pops
      .filter((pop) => pop.culture === hungarian && world.provinces[pop.provinceId]?.owner === aus.id && pop.size > 0)
      .map((pop) => pop.militancy);

    const result = setCultureAccepted(world, GAME_DATA, aus.id, hungarian, true);
    expect(result.ok).toBe(true);
    expect(aus.acceptedCultures).toContain(hungarian);
    const milAfter = world.pops
      .filter((pop) => pop.culture === hungarian && world.provinces[pop.provinceId]?.owner === aus.id && pop.size > 0)
      .map((pop) => pop.militancy);
    expect(Math.max(...milAfter)).toBeLessThan(Math.max(...milBefore));
    expect(movement!.radicalism).toBeLessThan(radicalBefore);

    // Accepted culture no longer assimilates and the movement winds down.
    const sizeBefore = nationCultureSize(world, aus.id, hungarian);
    runMonths(world, 30);
    expect(nationCultureSize(world, aus.id, hungarian)).toBe(sizeBefore);
    const remaining = (world.movements ?? []).find(
      (candidate) => candidate.nation === aus.id && candidate.culture === hungarian,
    );
    expect(remaining).toBeUndefined();
  });

  it('refuses acceptance of cultures without a real community, and protects the primary', () => {
    const world = createWorld(GAME_DATA, 31);
    const fra = nationByTag(world, 'FRA');
    expect(setCultureAccepted(world, GAME_DATA, fra.id, fra.primaryCulture, false).ok).toBe(false);
    expect(setCultureAccepted(world, GAME_DATA, fra.id, cultureIdx('japanese'), true).ok).toBe(false);
  });
});

describe('E8 culture — snapshot, self-healing, determinism, stability', () => {
  it('exposes the culture ledger and movements in the snapshot', () => {
    const world = createWorld(GAME_DATA, 64);
    world.playerNation = nationByTag(world, 'AUS').id;
    runMonths(world, 1);
    const snapshot = buildSnapshot(world, GAME_DATA);
    expect(snapshot.playerCulturePolicy).toBe('assimilationist');
    expect(snapshot.playerCultures!.length).toBeGreaterThan(1);
    const total = snapshot.playerCultures!.reduce((sum, entry) => sum + entry.share, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
    const primaryRow = snapshot.playerCultures!.find((entry) => entry.primary);
    expect(primaryRow).toBeDefined();
    expect(primaryRow!.accepted).toBe(true);
  });

  it('self-heals a pre-0.8.0 world (no culture fields)', () => {
    const world = createWorld(GAME_DATA, 12);
    delete world.movements;
    delete world.nextMovementId;
    for (const nation of world.nations) {
      delete nation.culturePolicy;
      delete nation.assimilationByCulture;
    }
    expect(() => runMonths(world, 2)).not.toThrow();
    expect(Array.isArray(world.movements)).toBe(true);
    for (const nation of world.nations) {
      expect(nation.culturePolicy).toBe('assimilationist');
    }
    // View builders tolerate healed state too.
    ensureCultureState(world);
    expect(() => buildCultureLedger(world, GAME_DATA, world.playerNation)).not.toThrow();
    expect(() => buildMovementViews(world, GAME_DATA, world.playerNation)).not.toThrow();
  });

  it('is deterministic: same seed twice gives identical culture state', () => {
    const runOnce = () => {
      const world = createWorld(GAME_DATA, 90210);
      for (let day = 0; day < 365 * 2; day++) advanceDay(world, GAME_DATA);
      const cultureSizes = new Map<string, number>();
      for (const pop of world.pops) {
        if (pop.size <= 0) continue;
        const key = `${world.provinces[pop.provinceId]?.owner}:${pop.culture}`;
        cultureSizes.set(key, (cultureSizes.get(key) ?? 0) + pop.size);
      }
      return {
        movements: JSON.parse(JSON.stringify(world.movements ?? [])),
        cultures: Array.from(cultureSizes.entries()).sort(),
        rebellions: world.rebellions.length,
      };
    };
    const first = runOnce();
    const second = runOnce();
    expect(second).toEqual(first);
  }, 30_000);

  it('stays stable over a 4-year full-sim run (bounded rebellions, finite state)', () => {
    const world = createWorld(GAME_DATA, 20260720);
    for (let day = 0; day < 365 * 4; day++) {
      advanceDay(world, GAME_DATA);
      if (day % 90 === 0) {
        const active = world.rebellions.filter((rebellion) => rebellion.status === 'active');
        expect(active.length).toBeLessThanOrEqual(BALANCE.rebellion.worldActiveCap);
      }
    }
    for (const movement of world.movements ?? []) {
      expect(movement.radicalism).toBeGreaterThanOrEqual(0);
      expect(movement.radicalism).toBeLessThanOrEqual(100);
      expect(Number.isFinite(movement.adherents)).toBe(true);
    }
    for (const pop of world.pops) {
      expect(Number.isFinite(pop.size)).toBe(true);
      expect(Number.isFinite(pop.militancy)).toBe(true);
    }
    // The snapshot stays serializable (MP/worker boundary).
    const snapshot = buildSnapshot(world, GAME_DATA);
    expect(() => structuredClone(snapshot)).not.toThrow();
  }, 120_000);
});
