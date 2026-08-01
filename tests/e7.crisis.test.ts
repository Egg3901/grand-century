/**
 * 0.7.0 Concert of Europe — crisis system tests.
 *
 * Covers: tension bounds & determinism, crisis spawn from an engineered
 * flashpoint, congress resolution (lopsided blocs, demand enforced), crisis
 * war ignition (balanced blocs), player commands, old-save self-healing, and
 * long-run stability.
 */
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay, dayToDate } from '../src/sim/world';
import { buildSnapshot } from '../src/sim/snapshot';
import { serializeWorld, deserializeWorld } from '../src/sim/persistence';
import { Rng } from '../src/sim/rng';
import {
  computeTensionContributions,
  crisisLeadBackDown,
  joinCrisisSide,
  pressCrisisDemand,
} from '../src/sim/systems/crisis';
import type { Crisis, World } from '../src/shared/types';

function advanceMonths(world: World, months: number, perMonth?: (world: World) => void): void {
  let seen = 0;
  while (seen < months) {
    advanceDay(world, GAME_DATA);
    if (dayToDate(world.day).day === 1) {
      seen += 1;
      perMonth?.(world);
    }
  }
}

function nationByTag(world: World, tag: string) {
  const nation = world.nations.find((candidate) => candidate.tag === tag);
  if (!nation) throw new Error(`missing nation ${tag}`);
  return nation;
}

function makeCrisis(world: World, partial: Partial<Crisis> & Pick<Crisis, 'attackerLead' | 'defenderLead' | 'subject'>): Crisis {
  const crisis: Crisis = {
    id: world.nextCrisisId ?? 1,
    type: 'sphere_contest',
    demand: 'add_to_sphere',
    stateId: -1,
    attackerBackers: [partial.attackerLead],
    defenderBackers: [partial.defenderLead],
    startDay: world.day,
    deadlineDay: world.day + 360,
    temperature: 20,
    pressedBy: [],
    ...partial,
  };
  world.nextCrisisId = crisis.id + 1;
  world.crisis = crisis;
  return crisis;
}

describe('E7 Concert of Europe — crises', () => {
  it('keeps tension finite and bounded over a long sim, singleton crisis, capped history', () => {
    const world = createWorld(GAME_DATA, 4207);
    for (let year = 0; year < 20; year++) {
      advanceMonths(world, 12);
      expect(Number.isFinite(world.tension)).toBe(true);
      expect(world.tension).toBeGreaterThanOrEqual(0);
      expect(world.tension).toBeLessThanOrEqual(100);
      expect(world.congresses!.length).toBeLessThanOrEqual(16);
      if (world.crisis) {
        const crisis = world.crisis;
        expect(crisis.attackerBackers).toContain(crisis.attackerLead);
        expect(crisis.defenderBackers).toContain(crisis.defenderLead);
        expect(crisis.attackerBackers.some((id) => crisis.defenderBackers.includes(id))).toBe(false);
        expect(crisis.temperature).toBeGreaterThanOrEqual(0);
        expect(crisis.temperature).toBeLessThanOrEqual(100);
      }
      for (const contribution of computeTensionContributions(world)) {
        expect(Number.isFinite(contribution.value)).toBe(true);
      }
    }
  }, 220_000);

  it('is deterministic: same seed, same crisis history', () => {
    const runOnce = () => {
      const world = createWorld(GAME_DATA, 9911);
      advanceMonths(world, 12 * 12);
      return {
        tension: world.tension,
        crisis: world.crisis,
        congresses: world.congresses,
        wars: world.wars.length,
        rng: world.rngState,
      };
    };
    expect(runOnce()).toEqual(runOnce());
  }, 220_000);

  it('spawns a crisis from a hot flashpoint under high tension', () => {
    const world = createWorld(GAME_DATA, 5150);
    const eng = nationByTag(world, 'ENG');
    const fra = nationByTag(world, 'FRA');
    // Engineer a humiliation flashpoint: bitter GP rivalry.
    const relation = world.relations.find((entry) => (
      (entry.a === eng.id && entry.b === fra.id) || (entry.a === fra.id && entry.b === eng.id)
    ))!;
    relation.kind = 'rivalry';
    relation.opinion = -120;
    world.tension = 90;
    world.crisisCooldownUntil = 0;

    let sawCrisis = false;
    advanceMonths(world, 48, (w) => {
      if (w.crisis || (w.congresses?.length ?? 0) > 0) sawCrisis = true;
      // Keep the pot boiling so the spawn gate stays open — tension AND the
      // flashpoint itself (AI rival management otherwise re-picks rivals and
      // quietly clears the engineered rivalry, making this test fragile to
      // any unrelated sim change).
      if (!w.crisis) {
        w.tension = Math.max(w.tension ?? 0, 85);
        relation.kind = 'rivalry';
        relation.opinion = Math.min(relation.opinion, -120);
      }
    });
    expect(sawCrisis).toBe(true);
  }, 220_000);

  it('resolves lopsided crises at the congress table and enforces the demand', () => {
    const world = createWorld(GAME_DATA, 3033);
    const eng = nationByTag(world, 'ENG');
    const rus = nationByTag(world, 'RUS');
    const minor = world.nations.find((nation) => nation.gpRank === 0
      && world.provinces.some((province) => province.owner === nation.id))!;
    eng.prestige = 4000; // dwarf every other power score -> attacker bloc wins showdown
    const crisis = makeCrisis(world, {
      attackerLead: eng.id,
      defenderLead: rus.id,
      subject: minor.id,
      type: 'sphere_contest',
      demand: 'add_to_sphere',
      temperature: 96,
      deadlineDay: world.day + 20,
    });
    const beforePrestige = eng.prestige;

    advanceMonths(world, 2);

    expect(world.crisis).toBeNull();
    const record = world.congresses!.find((entry) => entry.id === crisis.id);
    expect(record).toBeDefined();
    expect(record!.outcome).toBe('congress');
    expect(record!.winnerLead).toBe(eng.id);
    expect(record!.loserLead).toBe(rus.id);
    expect(world.nations[minor.id].spheredBy).toBe(eng.id);
    expect(eng.sphereMembers).toContain(minor.id);
    // Prestige decays 0.5%/month (#35), so compare against the decayed
    // counterfactual, not the raw starting stock: the win must leave England
    // with more prestige than sitting the crisis out would have.
    const decayedBaseline = beforePrestige * Math.pow(0.995, 2);
    expect(eng.prestige).toBeGreaterThan(decayedBaseline);
    expect(world.crisisCooldownUntil).toBeGreaterThan(world.day);
  }, 60_000);

  it('ignites a bloc war when balanced sides both press the demand', () => {
    const world = createWorld(GAME_DATA, 7777);
    const eng = nationByTag(world, 'ENG');
    const fra = nationByTag(world, 'FRA');
    // Equalize the leads so neither side clears the showdown ratio.
    eng.prestige = 2000;
    fra.prestige = 2000;
    const crisis = makeCrisis(world, {
      attackerLead: eng.id,
      defenderLead: fra.id,
      subject: fra.id,
      type: 'humiliation',
      demand: 'humiliate',
      temperature: 100,
      deadlineDay: world.day + 20,
      pressedBy: [eng.id, fra.id].sort((a, b) => a - b),
    });
    const warsBefore = world.wars.length;

    advanceMonths(world, 2);

    expect(world.crisis).toBeNull();
    const record = world.congresses!.find((entry) => entry.id === crisis.id);
    expect(record).toBeDefined();
    expect(record!.outcome).toBe('war');
    const crisisWar = world.wars.find((war) => (
      war.attackers.includes(eng.id)
      && war.defenders.includes(fra.id)
      && war.goals.some((goal) => goal.type === 'humiliate' && goal.holder === eng.id && goal.target === fra.id)
    ));
    expect(world.wars.length).toBeGreaterThan(warsBefore);
    expect(crisisWar).toBeDefined();
    // Defenders get a reciprocal goal so the war is winnable both ways.
    expect(crisisWar!.goals.some((goal) => goal.holder === fra.id && goal.target === eng.id)).toBe(true);
  }, 60_000);

  it('handles player commands: back a side, press, back down', () => {
    const world = createWorld(GAME_DATA, 1212);
    const eng = nationByTag(world, 'ENG');
    const fra = nationByTag(world, 'FRA');
    const rus = nationByTag(world, 'RUS');
    const minor = world.nations.find((nation) => nation.gpRank === 0)!;

    const crisis = makeCrisis(world, {
      attackerLead: fra.id,
      defenderLead: rus.id,
      subject: minor.id,
    });

    // ENG (player, GP, uninvolved) backs the attacker.
    const join = joinCrisisSide(world, eng.id, crisis.id, 'attacker');
    expect(join.ok).toBe(true);
    expect(crisis.attackerBackers).toContain(eng.id);
    expect(joinCrisisSide(world, eng.id, crisis.id, 'defender').ok).toBe(false);

    // Only leads may press or back down.
    expect(pressCrisisDemand(world, eng.id, crisis.id).ok).toBe(false);
    const press = pressCrisisDemand(world, fra.id, crisis.id);
    expect(press.ok).toBe(true);
    expect(pressCrisisDemand(world, fra.id, crisis.id).ok).toBe(false);
    expect(crisis.pressedBy).toContain(fra.id);

    const rng = new Rng(world.rngState);
    expect(crisisLeadBackDown(world, rng, eng.id, crisis.id).ok).toBe(false);
    const backDown = crisisLeadBackDown(world, rng, fra.id, crisis.id);
    expect(backDown.ok).toBe(true);
    expect(world.crisis).toBeNull();
    const record = world.congresses!.find((entry) => entry.id === crisis.id);
    expect(record!.outcome).toBe('congress');
    expect(record!.winnerLead).toBe(rus.id);
    // Attacker backed down: the demand must NOT be enforced.
    expect(world.nations[minor.id].spheredBy).not.toBe(fra.id);
  });

  it('round-trips crisis state through save/load and self-heals pre-0.7.0 saves', () => {
    const world = createWorld(GAME_DATA, 6161);
    const eng = nationByTag(world, 'ENG');
    const rus = nationByTag(world, 'RUS');
    const minor = world.nations.find((nation) => nation.gpRank === 0)!;
    makeCrisis(world, { attackerLead: eng.id, defenderLead: rus.id, subject: minor.id, temperature: 42 });
    world.tension = 61.5;

    const loaded = deserializeWorld(serializeWorld(world)).world;
    expect(loaded.tension).toBe(61.5);
    expect(loaded.crisis).toEqual(world.crisis);
    expect(loaded.congresses).toEqual(world.congresses);

    // Simulate a pre-0.7.0 save: strip every Concert field, then run a year.
    const legacy = deserializeWorld(serializeWorld(createWorld(GAME_DATA, 6161))).world;
    delete legacy.tension;
    delete legacy.crisis;
    delete legacy.congresses;
    delete legacy.nextCrisisId;
    delete legacy.crisisCooldownUntil;
    advanceMonths(legacy, 12);
    expect(Number.isFinite(legacy.tension)).toBe(true);
    expect(Array.isArray(legacy.congresses)).toBe(true);

    const snap = buildSnapshot(legacy, GAME_DATA);
    expect(Number.isFinite(snap.worldTension)).toBe(true);
    expect(snap.activeCrisis === null || typeof snap.activeCrisis === 'object').toBe(true);
  }, 120_000);
});
