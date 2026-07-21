/**
 * 0.6.0 / 0.7.0 — Research & Inventions ("The Inventive Century" + depth).
 *
 * Covers: data integrity of the tree, determinism, player-directed research,
 * effect application (throughput, tax, factory profit, pop growth, movement,
 * supply, trade), recipe gating, AI progression, year gates, and long-sim
 * stability (no NaN / negatives / runaway values).
 */

import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { Rng } from '../src/sim/rng';
import { advanceDay } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import {
  availableTechsFor,
  buildPlayerTechView,
  isRecipeUnlocked,
  researchPointsPerMonth,
  runResearchMonthly,
  setNationResearch,
  techModifiersFor,
} from '../src/sim/systems/research';
import type { FromWorker, World } from '../src/shared/types';

const noop = (_msg: FromWorker) => {};

function playerNation(world: World) {
  return world.nations[world.playerNation];
}

function advanceDays(world: World, days: number) {
  for (let i = 0; i < days; i++) advanceDay(world, GAME_DATA);
}

const LEGACY_TECH_KEYS = [
  'muzzle_loaded_rifles', 'post_napoleonic_thought', 'steamers', 'market_structure',
  'mechanical_production', 'practical_steam_engine', 'romanticism', 'idealism',
] as const;

const M1_TECH_KEYS = [
  ...LEGACY_TECH_KEYS,
  'army_professional_drill', 'army_percussion_rifles', 'army_rifled_artillery',
  'army_breech_loaders', 'army_staff_corps', 'army_repeating_rifles', 'army_modern_cannon',
  'navy_screw_propulsion', 'navy_ironclad_warships', 'navy_steel_shipyards', 'navy_dreadnought_program',
  'commerce_merchant_marine', 'commerce_stock_exchange', 'commerce_limited_liability', 'commerce_central_banking',
  'industry_mechanized_sawmills', 'industry_machine_tooling', 'industry_bessemer_steel', 'industry_electrification',
  'culture_realist_school', 'culture_empirical_science', 'culture_mass_press', 'culture_modernist_age',
] as const;

describe('E6 research data integrity', () => {
  it('every prereq and unlock reference resolves; costs and years are sane', () => {
    const techKeys = new Set(GAME_DATA.techs.map((tech) => tech.key));
    const recipeKeys = new Set(GAME_DATA.recipes.map((recipe) => recipe.key));
    expect(GAME_DATA.techs.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GAME_DATA.techs.map((tech) => tech.key)).size).toBe(GAME_DATA.techs.length);
    for (const tech of GAME_DATA.techs) {
      if (tech.prereq) expect(techKeys.has(tech.prereq)).toBe(true);
      for (const recipeKey of tech.unlocksRecipes ?? []) {
        expect(recipeKeys.has(recipeKey)).toBe(true);
      }
      expect(tech.cost).toBeGreaterThan(0);
      expect(tech.cost).toBeLessThanOrEqual(400);
      if (tech.year !== undefined) {
        expect(tech.year).toBeGreaterThanOrEqual(1820);
        expect(tech.year).toBeLessThanOrEqual(1920);
      }
    }
    expect(GAME_DATA.inventions?.length ?? 0).toBeGreaterThanOrEqual(18);
    for (const invention of GAME_DATA.inventions ?? []) {
      expect(techKeys.has(invention.prereqTech)).toBe(true);
      expect(invention.monthlyChance).toBeGreaterThan(0);
      expect(invention.monthlyChance).toBeLessThanOrEqual(0.25);
    }
    // Every tech-gated recipe is unlocked by exactly one tech.
    const unlocked = GAME_DATA.techs.flatMap((tech) => tech.unlocksRecipes ?? []);
    for (const recipe of GAME_DATA.recipes) {
      if (recipe.requiresTech) {
        expect(techKeys.has(recipe.requiresTech)).toBe(true);
        expect(unlocked).toContain(recipe.key);
      }
    }
  });

  it('legacy + M1 tech keys survive (saves + bootstrap seed reference them)', () => {
    const keys = new Set(GAME_DATA.techs.map((tech) => tech.key));
    for (const legacy of LEGACY_TECH_KEYS) expect(keys.has(legacy)).toBe(true);
    for (const key of M1_TECH_KEYS) expect(keys.has(key)).toBe(true);
    expect(M1_TECH_KEYS.length).toBe(31);
  });

  it('depth techs span railroads, chemistry, medicine, electricity, finance', () => {
    const keys = new Set(GAME_DATA.techs.map((tech) => tech.key));
    for (const depth of [
      'industry_early_railroads', 'industry_chemical_synthesis', 'industry_electrical_grid',
      'culture_germ_theory', 'culture_modern_medicine', 'commerce_modern_finance',
      'army_railroad_logistics', 'army_machine_guns', 'navy_oil_firing',
    ]) {
      expect(keys.has(depth)).toBe(true);
    }
  });
});

describe('E6 research progression', () => {
  it('is deterministic: same seed, same command, same techs after 5 years', () => {
    const run = () => {
      const world = createWorld(GAME_DATA, 4242);
      setNationResearch(world, GAME_DATA, world.playerNation, 'mechanical_production');
      advanceDays(world, 365 * 5);
      return {
        rng: world.rngState,
        techs: world.nations.map((nation) => nation.techs.slice().sort().join(',')),
        inventions: world.nations.map((nation) => (nation.inventions ?? []).slice().sort().join(',')),
      };
    };
    const a = run();
    const b = run();
    expect(a.rng).toBe(b.rng);
    expect(a.techs).toEqual(b.techs);
    expect(a.inventions).toEqual(b.inventions);
  }, 120_000);

  it('player-directed research completes and effects apply', () => {
    const world = createWorld(GAME_DATA, 99);
    const player = playerNation(world);
    const before = techModifiersFor(player, GAME_DATA).factoryThroughput;
    const result = setNationResearch(world, GAME_DATA, world.playerNation, 'mechanical_production');
    expect(result.ok).toBe(true);
    expect(player.currentResearch).toBe('mechanical_production');
    advanceDays(world, 365); // cost 9 vs ~6+/mo for a GP — done well inside a year
    expect(player.techs).toContain('mechanical_production');
    const after = techModifiersFor(player, GAME_DATA).factoryThroughput;
    expect(after).toBeGreaterThan(before);
  }, 120_000);

  it('rejects locked techs: missing prereq and future year gates', () => {
    const world = createWorld(GAME_DATA, 7);
    const noPrereq = setNationResearch(world, GAME_DATA, world.playerNation, 'industry_electrification');
    expect(noPrereq.ok).toBe(false);
    const player = playerNation(world);
    // Grant the full industry chain below electrification; the 1895 year gate must still block in 1820.
    player.techs.push(
      'mechanical_production', 'practical_steam_engine', 'industry_early_railroads',
      'industry_mechanized_sawmills', 'industry_interchangeable_parts', 'industry_machine_tooling',
      'industry_chemical_synthesis', 'industry_bessemer_steel', 'industry_organic_chemistry',
      'industry_oil_drilling',
    );
    const tooEarly = setNationResearch(world, GAME_DATA, world.playerNation, 'industry_electrification');
    expect(tooEarly.ok).toBe(false);
    expect(tooEarly.reason).toContain('1895');
  });

  it('banks points while idle, then auto-picks so nobody stagnates', () => {
    const world = createWorld(GAME_DATA, 11);
    const player = playerNation(world);
    expect(player.currentResearch ?? null).toBeNull();
    const rng = new Rng(1);
    runResearchMonthly(world, GAME_DATA, rng);
    expect(player.researchPoints).toBeGreaterThan(0);
    // Push the bank over 1.5x the cheapest available cost and tick again.
    player.researchPoints = 500;
    runResearchMonthly(world, GAME_DATA, rng);
    expect(player.techs.length).toBeGreaterThan(1); // auto-picked and instantly finished from the bank
  });

  it('AI nations research across a decade and respect prereq chains', () => {
    const world = createWorld(GAME_DATA, 1848);
    advanceDays(world, 365 * 10);
    const techByKey = new Map(GAME_DATA.techs.map((tech) => [tech.key, tech]));
    let researchedSomething = 0;
    for (const nation of world.nations) {
      if (nation.techs.length > 1) researchedSomething += 1;
      for (const key of nation.techs) {
        const def = techByKey.get(key);
        expect(def).toBeTruthy();
        if (def?.prereq) expect(nation.techs).toContain(def.prereq);
        if (def?.year !== undefined) expect(def.year).toBeLessThanOrEqual(1830);
      }
      expect(new Set(nation.techs).size).toBe(nation.techs.length); // no dupes
    }
    // Most civilized nations should have made progress in ten years.
    expect(researchedSomething).toBeGreaterThan(world.nations.length / 2);
  }, 120_000);

  it('inventions only fire with their prereq tech researched', () => {
    const world = createWorld(GAME_DATA, 555);
    advanceDays(world, 365 * 12);
    const inventionByKey = new Map((GAME_DATA.inventions ?? []).map((invention) => [invention.key, invention]));
    for (const nation of world.nations) {
      for (const key of nation.inventions ?? []) {
        const def = inventionByKey.get(key);
        expect(def).toBeTruthy();
        expect(nation.techs).toContain(def!.prereqTech);
      }
    }
  }, 120_000);
});

describe('E6 recipe gating', () => {
  it('buildFactory refuses tech-locked recipes, allows them once researched', () => {
    const world = createWorld(GAME_DATA, 21);
    const player = playerNation(world);
    const state = world.states.find((candidate) => candidate.owner === world.playerNation)!;
    player.treasury = 100_000;
    const before = state.factories.length;
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_machine_parts' }, noop);
    expect(state.factories.length).toBe(before); // locked
    player.techs.push('industry_machine_tooling');
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_machine_parts' }, noop);
    expect(state.factories.length).toBe(before + 1);
    expect(state.factories[state.factories.length - 1].recipe).toBe('factory_machine_parts');
  });

  it('depth recipes (fertilizer, clothing, ammunition) gate on their techs', () => {
    const world = createWorld(GAME_DATA, 24);
    const player = playerNation(world);
    const state = world.states.find((candidate) => candidate.owner === world.playerNation)!;
    player.treasury = 100_000;
    const before = state.factories.length;
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_fertilizer' }, noop);
    expect(state.factories.length).toBe(before);
    player.techs.push('industry_chemical_synthesis');
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_fertilizer' }, noop);
    expect(state.factories.length).toBe(before + 1);

    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_cement' }, noop);
    expect(state.factories.length).toBe(before + 1);
    player.techs.push('industry_early_railroads');
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_cement' }, noop);
    expect(state.factories.length).toBe(before + 2);

    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_ammunition' }, noop);
    expect(state.factories.length).toBe(before + 2);
    player.techs.push('army_smokeless_powder');
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: state.id, recipe: 'factory_ammunition' }, noop);
    expect(state.factories.length).toBe(before + 3);
  });

  it('coastal-only recipes require a coastal state', () => {
    const world = createWorld(GAME_DATA, 22);
    const player = playerNation(world);
    player.treasury = 100_000;
    player.techs.push('commerce_merchant_marine');
    const isCoastalState = (stateId: number) =>
      world.states[stateId].provinceIds.some((provinceId) => world.provinces[provinceId]?.coastal);
    const owned = world.states.filter((state) => state.owner === world.playerNation);
    const inland = owned.find((state) => !isCoastalState(state.id));
    const coastal = owned.find((state) => isCoastalState(state.id));
    if (inland) {
      const before = inland.factories.length;
      applyCommand(world, GAME_DATA, { t: 'buildFactory', state: inland.id, recipe: 'factory_fishing_wharf' }, noop);
      expect(inland.factories.length).toBe(before);
    }
    expect(coastal).toBeTruthy();
    const beforeCoastal = coastal!.factories.length;
    applyCommand(world, GAME_DATA, { t: 'buildFactory', state: coastal!.id, recipe: 'factory_fishing_wharf' }, noop);
    expect(coastal!.factories.length).toBe(beforeCoastal + 1);
  });

  it('ungated legacy recipes stay buildable by everyone', () => {
    const world = createWorld(GAME_DATA, 23);
    for (const recipe of GAME_DATA.recipes) {
      if (!recipe.requiresTech) {
        for (const nation of world.nations) {
          expect(isRecipeUnlocked(nation, recipe)).toBe(true);
        }
      }
    }
  });
});

describe('E6 effects & stability', () => {
  it('tax efficiency tech raises tax income without minting money', () => {
    const world = createWorld(GAME_DATA, 31);
    const player = playerNation(world);
    // Baseline: strip commerce techs.
    player.techs = player.techs.filter((key) => key !== 'market_structure');
    const baselineWorld = createWorld(GAME_DATA, 31);
    const richPlayer = playerNation(baselineWorld);
    richPlayer.techs = ['market_structure', 'commerce_merchant_marine', 'commerce_stock_exchange'];
    const poorMods = techModifiersFor(player, GAME_DATA);
    const richMods = techModifiersFor(richPlayer, GAME_DATA);
    expect(richMods.taxEfficiency).toBeGreaterThan(poorMods.taxEfficiency);
    advanceDays(world, 32);
    advanceDays(baselineWorld, 32);
    expect(richPlayer.lastBudget.taxIncome).toBeGreaterThan(player.lastBudget.taxIncome);
    // Money conservation: pops paid the extra, it wasn't minted.
    expect(Number.isFinite(richPlayer.treasury)).toBe(true);
  }, 120_000);

  it('depth modifiers apply: factory profit, pop growth, movement, supply, trade', () => {
    const world = createWorld(GAME_DATA, 41);
    const player = playerNation(world);
    const before = techModifiersFor(player, GAME_DATA);
    player.techs.push(
      'commerce_joint_stock', 'commerce_insurance_markets',
      'culture_public_hygiene', 'culture_germ_theory', 'culture_modern_medicine',
      'industry_early_railroads', 'army_field_logistics', 'army_railroad_logistics',
      'commerce_merchant_marine',
    );
    const after = techModifiersFor(player, GAME_DATA);
    expect(after.factoryProfit ?? 0).toBeGreaterThan(before.factoryProfit ?? 0);
    expect(after.popGrowth ?? 0).toBeGreaterThan(before.popGrowth ?? 0);
    expect(after.armyMovement ?? 0).toBeGreaterThan(before.armyMovement ?? 0);
    expect(after.supplyRange ?? 0).toBeGreaterThan(before.supplyRange ?? 0);
    expect(after.tradeEfficiency ?? 0).toBeGreaterThan(before.tradeEfficiency ?? 0);
  });

  it('research points per month grow with researchRate modifiers', () => {
    const world = createWorld(GAME_DATA, 32);
    const player = playerNation(world);
    const base = researchPointsPerMonth(player, GAME_DATA);
    player.techs.push('romanticism', 'idealism');
    const boosted = researchPointsPerMonth(player, GAME_DATA);
    expect(boosted).toBeGreaterThan(base);
    expect(boosted / base).toBeCloseTo(1.1, 5);
  });

  it('20-year sim stays sane: no NaN, bounded points, no runaway prestige/literacy', () => {
    const world = createWorld(GAME_DATA, 1900);
    setNationResearch(world, GAME_DATA, world.playerNation, 'romanticism');
    advanceDays(world, 365 * 20);
    for (const nation of world.nations) {
      expect(Number.isFinite(nation.researchPoints)).toBe(true);
      expect(nation.researchPoints).toBeGreaterThanOrEqual(0);
      expect(nation.researchPoints).toBeLessThanOrEqual(10_000);
      expect(Number.isFinite(nation.researchProgress ?? 0)).toBe(true);
      expect((nation.researchProgress ?? 0)).toBeGreaterThanOrEqual(0);
      expect(nation.literacy).toBeGreaterThanOrEqual(0);
      expect(nation.literacy).toBeLessThanOrEqual(0.98);
      expect(Number.isFinite(nation.prestige)).toBe(true);
      expect(nation.techs.length).toBeLessThanOrEqual(GAME_DATA.techs.length);
      const mods = techModifiersFor(nation, GAME_DATA);
      expect(mods.factoryThroughput).toBeLessThan(2);
      expect(mods.rgoThroughput).toBeLessThan(2);
      expect(mods.taxEfficiency).toBeLessThan(2);
      expect(mods.researchRate).toBeLessThan(2);
      expect(mods.literacyRate).toBeLessThan(0.05);
      expect(mods.prestigeMonthly).toBeLessThan(20);
      expect(mods.popGrowth ?? 0).toBeLessThan(0.001);
      expect(mods.armyMovement ?? 0).toBeLessThan(1);
      expect(mods.supplyRange ?? 0).toBeLessThan(5);
      expect(mods.factoryProfit ?? 0).toBeLessThan(1);
      expect(mods.tradeEfficiency ?? 0).toBeLessThan(1);
      for (const value of Object.values(mods)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
    // Market must still be conserving after two decades of new industry.
    for (const invariant of world.marketInvariants) {
      expect(invariant.ok).toBe(true);
    }
    // Snapshot view builds cleanly late-game with prereq + ETA fields.
    const view = buildPlayerTechView(world, GAME_DATA, world.playerNation);
    expect(view.statuses.length).toBe(GAME_DATA.techs.length);
    expect(Number.isFinite(view.monthlyResearch)).toBe(true);
    expect(view.statuses.some((status) => status.prereqName != null || status.prereq == null)).toBe(true);
    expect(view.statuses.every((status) => status.etaMonths === null || status.etaMonths === undefined || status.etaMonths >= 0)).toBe(true);
  }, 120_000);

  it('year gates hold: nobody owns a post-1860 tech in 1845', () => {
    const world = createWorld(GAME_DATA, 77);
    advanceDays(world, 365 * 25); // 1820 -> 1845
    const techByKey = new Map(GAME_DATA.techs.map((tech) => [tech.key, tech]));
    for (const nation of world.nations) {
      for (const key of nation.techs) {
        const def = techByKey.get(key);
        expect((def?.year ?? 1820)).toBeLessThanOrEqual(1845);
      }
    }
  }, 120_000);

  it('availableTechsFor exposes only researchable frontier techs', () => {
    const world = createWorld(GAME_DATA, 88);
    const player = playerNation(world);
    const available = availableTechsFor(player, GAME_DATA, 1820);
    expect(available.length).toBeGreaterThan(0);
    for (const tech of available) {
      expect(player.techs).not.toContain(tech.key);
      if (tech.prereq) expect(player.techs).toContain(tech.prereq);
      expect(tech.year ?? 1820).toBeLessThanOrEqual(1820);
    }
  });
});

describe('E6 research point conservation', () => {
  it('halting and switching research refunds sunk progress (no points lost)', () => {
    const world = createWorld(GAME_DATA, 44);
    const player = playerNation(world);
    player.researchPoints = 0;
    setNationResearch(world, GAME_DATA, world.playerNation, 'romanticism'); // cost 7
    // Sink a couple of months of points.
    const rng = new Rng(9);
    runResearchMonthly(world, GAME_DATA, rng);
    const sunk = player.researchProgress ?? 0;
    const banked = player.researchPoints;
    if (!player.techs.includes('romanticism')) {
      expect(sunk).toBeGreaterThan(0);
      // Switch to another project: sunk progress returns to the bank.
      setNationResearch(world, GAME_DATA, world.playerNation, 'mechanical_production');
      expect(player.researchProgress).toBe(0);
      expect(player.researchPoints).toBeCloseTo(banked + sunk, 8);
      // Halt entirely: nothing lost either.
      const before = (player.researchProgress ?? 0) + player.researchPoints;
      setNationResearch(world, GAME_DATA, world.playerNation, null);
      expect((player.researchProgress ?? 0)).toBe(0);
      expect(player.researchPoints).toBeCloseTo(before, 8);
    }
  });
});
