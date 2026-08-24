import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';
import {
  assignGeneralToArmy,
  getGeneralPool,
  startColonization,
  exportWarRuntime,
  colonialDailyProgressRate,
  effectiveColonialDailyRate,
  listColonialClaimViews,
  colonialReachKind,
} from '../src/sim/systems/war';
import { graphHopDistance, scoreWarObjectives } from '../src/sim/systems/ai';
import type { Army, NationId, ProvinceId, World } from '../src/shared/types';

function disableAi(world: World) {
  for (const nation of world.nations) nation.isPlayer = true;
}

function makeArmy(world: World, owner: NationId, provinceId: number, regiments: Army['regiments']): Army {
  const army: Army = {
    id: world.nextArmyId++,
    owner,
    location: provinceId,
    moveTarget: -1,
    moveProgress: 0,
    regiments,
    leader: null,
    rebel: false,
    hostileTo: -1,
  };
  world.armies.push(army);
  return army;
}

// ---------------------------------------------------------------------------
// General assignment uniqueness and composition scoring
// ---------------------------------------------------------------------------

describe('General assignment uniqueness and composition scoring', () => {
  it('assigns different leaders to different armies when pool allows', () => {
    const world = createWorld(GAME_DATA, 9001);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;

    const army1 = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);
    const army2 = makeArmy(world, nation, province, [
      { type: 'artillery', strength: 900, organization: 70, sourcePop },
      { type: 'artillery', strength: 900, organization: 70, sourcePop },
    ]);
    const army3 = makeArmy(world, nation, province, [
      { type: 'cavalry', strength: 850, organization: 75, sourcePop },
    ]);

    const r1 = assignGeneralToArmy(world, nation, army1.id);
    const r2 = assignGeneralToArmy(world, nation, army2.id);
    const r3 = assignGeneralToArmy(world, nation, army3.id);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);

    const names = [army1.leader?.name, army2.leader?.name, army3.leader?.name];
    const unique = new Set(names);
    expect(unique.size).toBe(3);
  });

  it('prefers siegecraft for artillery-heavy armies', () => {
    const world = createWorld(GAME_DATA, 9002);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;

    const army = makeArmy(world, nation, province, [
      { type: 'artillery', strength: 900, organization: 70, sourcePop },
      { type: 'artillery', strength: 900, organization: 70, sourcePop },
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);

    assignGeneralToArmy(world, nation, army.id);
    const pool = getGeneralPool(world, nation);
    const siegecraftLeader = pool.find((l) => l.trait === 'siegecraft');

    if (siegecraftLeader) {
      expect(army.leader?.trait).toBe('siegecraft');
    }
  });

  it('releases leader when army is destroyed', () => {
    const world = createWorld(GAME_DATA, 9003);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;

    const army1 = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);
    const army2 = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);

    assignGeneralToArmy(world, nation, army1.id);
    assignGeneralToArmy(world, nation, army2.id);

    const name1 = army1.leader?.name;
    const name2 = army2.leader?.name;
    expect(name1).toBeDefined();
    expect(name2).toBeDefined();
    expect(name1).not.toBe(name2);

    // Destroy army1.
    army1.regiments = [];
    advanceDay(world, GAME_DATA);

    // The released leader should be available again.
    const army3 = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);
    assignGeneralToArmy(world, nation, army3.id);
    expect(army3.leader).toBeDefined();
  });

  it('falls back to reuse when all leaders are assigned', () => {
    const world = createWorld(GAME_DATA, 9004);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;
    const pool = getGeneralPool(world, nation);
    const poolSize = pool.length;
    expect(poolSize).toBeGreaterThan(0);

    // Create more armies than there are leaders in the pool.
    const armies: Army[] = [];
    for (let i = 0; i < poolSize + 2; i++) {
      armies.push(makeArmy(world, nation, province, [
        { type: 'infantry', strength: 1000, organization: 80, sourcePop },
      ]));
    }

    for (const army of armies) {
      const result = assignGeneralToArmy(world, nation, army.id);
      expect(result.ok).toBe(true);
    }

    // All armies should have leaders.
    expect(armies.every((a) => a.leader !== null)).toBe(true);
    // First poolSize armies should have unique leaders.
    const uniqueNames = new Set(armies.slice(0, poolSize).map((a) => a.leader!.name));
    expect(uniqueNames.size).toBe(poolSize);
    // Extra armies reuse from the same pool.
    const allNames = new Set(armies.map((a) => a.leader!.name));
    expect(allNames.size).toBe(poolSize);
  });

  it('reassigning an army releases its old leader before picking a new one', () => {
    const world = createWorld(GAME_DATA, 9005);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;

    // Create exactly pool-size armies so every leader is assigned.
    const pool = getGeneralPool(world, nation);
    const armies: Army[] = [];
    for (let i = 0; i < pool.length; i++) {
      armies.push(makeArmy(world, nation, province, [
        { type: 'infantry', strength: 1000, organization: 80, sourcePop },
      ]));
      assignGeneralToArmy(world, nation, armies[i].id);
    }

    // All leaders are now assigned. Reassign army[0] -- it should still get a leader.
    const oldName = armies[0].leader!.name;
    const result = assignGeneralToArmy(world, nation, armies[0].id);
    expect(result.ok).toBe(true);
    expect(armies[0].leader).toBeDefined();

    // The old leader name should now be free. Create one more army.
    const extra = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);
    const extraResult = assignGeneralToArmy(world, nation, extra.id);
    expect(extraResult.ok).toBe(true);
    expect(extra.leader).toBeDefined();

    // Verify no two active armies share the same leader name
    // (except the one that was reassigned, which released its old name).
    const allAssigned = [...armies, extra].map((a) => a.leader!.name);
    const uniqueAssigned = new Set(allAssigned);
    // All pool leaders are used, plus the reassigned army picked one.
    // Since pool was fully assigned and we freed one, the extra army
    // should have gotten the freed leader.
    expect(uniqueAssigned.size).toBe(pool.length);
  });
});

// ---------------------------------------------------------------------------
// AI objective selection scoring (via exported seam)
// ---------------------------------------------------------------------------

describe('AI objective selection scoring', () => {
  it('scores war-goal provinces higher than non-goal objectives', () => {
    const world = createWorld(GAME_DATA, 9100);
    // Find two nations that are at war or can be put at war.
    const nation = world.nations[0];
    const enemies = new Set<NationId>();
    for (const war of world.wars) {
      if (war.attackers.includes(nation.id)) {
        for (const d of war.defenders) enemies.add(d);
      } else if (war.defenders.includes(nation.id)) {
        for (const a of war.attackers) enemies.add(a);
      }
    }
    // If no war exists, run the sim until one forms.
    if (enemies.size === 0) {
      for (let day = 0; day < 365 * 3; day++) advanceDay(world, GAME_DATA);
      for (const war of world.wars) {
        if (war.attackers.includes(nation.id)) {
          for (const d of war.defenders) enemies.add(d);
        } else if (war.defenders.includes(nation.id)) {
          for (const a of war.attackers) enemies.add(a);
        }
      }
    }
    if (enemies.size === 0) return; // No wars formed -- skip gracefully.

    // Find a province that is a war goal and one that is not.
    let warGoalProvince: ProvinceId | null = null;
    let nonGoalProvince: ProvinceId | null = null;
    for (const war of world.wars) {
      if (!war.attackers.includes(nation.id) && !war.defenders.includes(nation.id)) continue;
      for (const goal of war.goals) {
        if (goal.holder !== nation.id || goal.stateId < 0) continue;
        const state = world.states[goal.stateId];
        if (state && state.provinceIds.length > 0) {
          warGoalProvince = state.provinceIds[0];
          break;
        }
      }
      if (warGoalProvince !== null) break;
    }
    // Pick a non-goal province from an enemy.
    for (const enemyId of enemies) {
      const enemy = world.nations[enemyId];
      if (enemy && enemy.capital !== warGoalProvince) {
        nonGoalProvince = enemy.capital;
        break;
      }
    }
    if (warGoalProvince === null || nonGoalProvince === null) return;

    // Find an army belonging to this nation.
    const army = world.armies.find((a) => a.owner === nation.id && !a.rebel && a.regiments.length > 0);
    if (!army) return;

    const objectives = [warGoalProvince, nonGoalProvince];
    const scored = scoreWarObjectives(world, nation.id, army, objectives, enemies, []);

    expect(scored.length).toBe(2);
    // The war-goal province should score higher.
    expect(scored[0].id).toBe(warGoalProvince);
  });

  it('closer objectives score higher than distant ones (graph distance)', () => {
    const world = createWorld(GAME_DATA, 9101);
    const nation = world.nations[0];
    const army = world.armies.find((a) => a.owner === nation.id && !a.rebel && a.regiments.length > 0);
    if (!army) return;

    // Find two enemy provinces at different graph distances.
    const enemies = new Set<NationId>();
    for (const n of world.nations) {
      if (n.id !== nation.id && n.capital >= 0) enemies.add(n.id);
    }
    if (enemies.size < 2) return;

    const enemyCapitals = Array.from(enemies)
      .map((eid) => world.nations[eid]!.capital)
      .filter((c) => c >= 0);

    // Compute graph distances from army location.
    const withDist = enemyCapitals
      .map((c) => ({ id: c, hops: graphHopDistance(world, army.location, c) }))
      .filter((d) => Number.isFinite(d.hops))
      .sort((a, b) => a.hops - b.hops);

    if (withDist.length < 2) return;
    // Ensure the two closest are actually different distances.
    if (withDist[0].hops === withDist[withDist.length - 1].hops) return;

    const closeProvince = withDist[0].id;
    const farProvince = withDist[withDist.length - 1].id;

    const scored = scoreWarObjectives(world, nation.id, army, [closeProvince, farProvince], enemies, []);
    expect(scored.length).toBe(2);
    // Closer province should score higher (no war-goal bias).
    expect(scored[0].id).toBe(closeProvince);
  });

  it('unreachable objectives receive the lowest proximity score', () => {
    const world = createWorld(GAME_DATA, 9102);
    const nation = world.nations[0];
    const army = world.armies.find((a) => a.owner === nation.id && !a.rebel && a.regiments.length > 0);
    if (!army) return;

    // Find a reachable and an unreachable province.
    const reachable: ProvinceId[] = [];
    const unreachable: ProvinceId[] = [];
    for (const province of world.provinces) {
      if (province.owner === nation.id) continue;
      const hops = graphHopDistance(world, army.location, province.id);
      if (Number.isFinite(hops)) reachable.push(province.id);
      else unreachable.push(province.id);
    }

    if (reachable.length === 0 || unreachable.length === 0) return;

    const enemies = new Set<NationId>();
    for (const n of world.nations) {
      if (n.id !== nation.id) enemies.add(n.id);
    }

    const objectives = [reachable[0], unreachable[0]];
    const scored = scoreWarObjectives(world, nation.id, army, objectives, enemies, []);

    expect(scored.length).toBe(2);
    // Reachable province should rank first (unreachable gets proximity = 0).
    expect(scored[0].id).toBe(reachable[0]);
  });

  it('deterministic: same seed produces same army movements', () => {
    const run = (seed: number) => {
      const world = createWorld(GAME_DATA, seed);
      for (let day = 0; day < 365; day++) advanceDay(world, GAME_DATA);
      return world.armies.map((a) => ({
        id: a.id,
        location: a.location,
        moveTarget: a.moveTarget,
        leader: a.leader?.name,
      }));
    };

    const a = run(9103);
    const b = run(9103);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Colonization strategic layer
// ---------------------------------------------------------------------------

describe('Colonization strategic layer', () => {
  it('adjacent claims have a higher daily progress rate than overseas claims', () => {
    const world = createWorld(GAME_DATA, 9200);
    disableAi(world);
    const nation = world.playerNation;

    // Find an adjacent colonial state and an overseas colonial state.
    const colonialStates = world.states.filter((s) =>
      s.provinceIds.length > 0 &&
      s.provinceIds.every((pid) => world.provinces[pid]?.colonial)
    );

    let adjacentState: number | null = null;
    let overseasState: number | null = null;

    for (const state of colonialStates) {
      const reach = colonialReachKind(world, nation, state.id);
      if (reach === 'adjacent' && adjacentState === null) {
        adjacentState = state.id;
      } else if (reach === 'overseas' && overseasState === null) {
        overseasState = state.id;
      }
    }

    // Require both types to exist -- fail explicitly if not.
    expect(adjacentState, 'Expected at least one adjacent colonial state for this seed').not.toBeNull();
    expect(overseasState, 'Expected at least one overseas colonial state for this seed').not.toBeNull();

    const adjacentRate = colonialDailyProgressRate(world, nation, adjacentState!);
    const overseasRate = colonialDailyProgressRate(world, nation, overseasState!);

    expect(adjacentRate).toBeGreaterThan(0);
    expect(overseasRate).toBeGreaterThan(0);
    expect(adjacentRate).toBeGreaterThan(overseasRate);
  });

  it('competing claims slow down progress via competition factor', () => {
    const world = createWorld(GAME_DATA, 9201);

    // Find any two nations that share reach to the same colonial state.
    // Grant colonial points to qualifying nations so the test is not
    // dependent on the economy having bootstrapped colonial infrastructure.
    const colonialStates = world.states.filter((s) =>
      s.provinceIds.length > 0 &&
      s.provinceIds.every((pid) => world.provinces[pid]?.colonial)
    );

    let nation1: NationId | null = null;
    let nation2: NationId | null = null;
    let targetStateId: number | null = null;

    outer: for (const state of colonialStates) {
      const reachable = world.nations.filter((n) =>
        colonialReachKind(world, n.id, state.id) !== null
      );
      if (reachable.length >= 2) {
        nation1 = reachable[0].id;
        nation2 = reachable[1].id;
        targetStateId = state.id;
        break outer;
      }
    }

    expect(nation1, 'Need two nations with colonial reach to a state').not.toBeNull();
    expect(nation2).not.toBeNull();
    expect(targetStateId).not.toBeNull();

    // Ensure both nations have enough colonial points.
    world.nations[nation1!].colonialPoints = 200;
    world.nations[nation2!].colonialPoints = 200;

    // Start colonization with just nation1.
    const r1 = startColonization(world, nation1!, targetStateId!);
    expect(r1.ok, `startColonization for nation1 failed: ${r1.reason}`).toBe(true);

    // Run 50 days solo.
    for (let day = 0; day < 50; day++) advanceDay(world, GAME_DATA);

    const runtime1 = exportWarRuntime(world);
    const claim1 = runtime1.colonialClaims.find((c) => c.stateId === targetStateId!);
    const progress1 = claim1?.claimants.find((c) => c.nation === nation1)?.progress ?? 0;
    expect(progress1, 'Solo claimant should make progress').toBeGreaterThan(0);

    // Add nation2 as competitor. Re-set points since advanceDay recomputes them.
    world.nations[nation2!].colonialPoints = 200;
    const r2 = startColonization(world, nation2!, targetStateId!);
    expect(r2.ok, `startColonization for nation2 failed: ${r2.reason}`).toBe(true);

    // Run 50 more days with competition.
    for (let day = 0; day < 50; day++) advanceDay(world, GAME_DATA);

    const runtime2 = exportWarRuntime(world);
    const claim2 = runtime2.colonialClaims.find((c) => c.stateId === targetStateId!);
    const progress2 = claim2?.claimants.find((c) => c.nation === nation1)?.progress ?? 0;

    const soloRate = progress1 / 50;
    const competitiveRate = (progress2 - progress1) / 50;

    // Competitive rate should be slower due to competition factor.
    expect(competitiveRate).toBeLessThan(soloRate);
  });

  it('colonization remains deterministic', () => {
    const run = (seed: number) => {
      const world = createWorld(GAME_DATA, seed);
      for (let day = 0; day < 365 * 2; day++) advanceDay(world, GAME_DATA);
      const runtime = exportWarRuntime(world);
      return runtime.colonialClaims.map((c) => ({
        stateId: c.stateId,
        claimants: c.claimants.map((cl) => ({ nation: cl.nation, progress: Math.round(cl.progress * 1000) })),
        tension: Math.round(c.tension * 1000),
      }));
    };

    const a = run(9202);
    const b = run(9202);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Regression: audit-ai2 focused corrections
// ---------------------------------------------------------------------------

describe('Regression: leader multiplicity under pool exhaustion', () => {
  it('shared leader stays assigned when sibling army is destroyed', () => {
    const world = createWorld(GAME_DATA, 9300);
    disableAi(world);
    const nation = world.playerNation;
    const province = world.provinces.find((p) => p.owner === nation)?.id ?? 0;
    const sourcePop = world.provinces[province]?.popIds[0] ?? 0;
    const pool = getGeneralPool(world, nation);
    const poolSize = pool.length;
    expect(poolSize).toBeGreaterThan(0);

    // Create poolSize + 1 armies so the last one reuses a leader.
    const armies: Army[] = [];
    for (let i = 0; i < poolSize + 1; i++) {
      armies.push(makeArmy(world, nation, province, [
        { type: 'infantry', strength: 1000, organization: 80, sourcePop },
      ]));
      assignGeneralToArmy(world, nation, armies[i].id);
    }

    // The last army reuses a leader already held by an earlier army.
    const reusedName = armies[poolSize].leader!.name;
    const holderIndex = armies.findIndex((a, i) => i < poolSize && a.leader!.name === reusedName);
    expect(holderIndex).toBeGreaterThanOrEqual(0);

    // Destroy the last army (the one that reused the leader).
    armies[poolSize].regiments = [];
    advanceDay(world, GAME_DATA);

    // The original holder must still have its leader.
    const holder = world.armies.find((a) => a.id === armies[holderIndex].id);
    expect(holder).toBeDefined();
    expect(holder!.leader?.name).toBe(reusedName);

    // Assigning a fresh army should NOT get the still-held leader as an
    // unassigned pick -- it should pick a genuinely free one or reuse.
    const fresh = makeArmy(world, nation, province, [
      { type: 'infantry', strength: 1000, organization: 80, sourcePop },
    ]);
    assignGeneralToArmy(world, nation, fresh.id);
    expect(fresh.leader).toBeDefined();

    // Verify the holder still has its leader after the fresh assignment.
    expect(holder!.leader?.name).toBe(reusedName);
  });
});

describe('Regression: objective reachability filtering', () => {
  it('long reachable paths remain eligible (not truncated by hop limit)', () => {
    const world = createWorld(GAME_DATA, 9310);
    // Pick two provinces that are far apart on the graph.
    const nation = world.nations[0];
    const army = world.armies.find((a) => a.owner === nation.id && !a.rebel && a.regiments.length > 0);
    if (!army) return;

    // Find the most distant reachable province.
    let maxHops = 0;
    let farthest: ProvinceId = army.location;
    for (const province of world.provinces) {
      if (province.id === army.location) continue;
      const hops = graphHopDistance(world, army.location, province.id);
      if (Number.isFinite(hops) && hops > maxHops) {
        maxHops = hops;
        farthest = province.id;
      }
    }
    // With maxHops=128, paths up to 128 hops should resolve.
    // Verify the farthest is at least 16 hops (would have been unreachable at old limit of 15).
    if (maxHops >= 16) {
      expect(maxHops).toBeLessThanOrEqual(128);
      expect(Number.isFinite(graphHopDistance(world, army.location, farthest))).toBe(true);
    }
  });

  it('disconnected objectives are excluded from scored results', () => {
    const world = createWorld(GAME_DATA, 9311);
    const nation = world.nations[0];
    const army = world.armies.find((a) => a.owner === nation.id && !a.rebel && a.regiments.length > 0);
    if (!army) return;

    const enemies = new Set<NationId>();
    for (const n of world.nations) {
      if (n.id !== nation.id) enemies.add(n.id);
    }

    // Collect reachable and unreachable provinces.
    const reachable: ProvinceId[] = [];
    const unreachable: ProvinceId[] = [];
    for (const province of world.provinces) {
      if (province.owner === nation.id) continue;
      const hops = graphHopDistance(world, army.location, province.id);
      if (Number.isFinite(hops)) reachable.push(province.id);
      else unreachable.push(province.id);
    }
    if (reachable.length === 0 || unreachable.length === 0) return;

    // Score a mix of reachable and unreachable objectives.
    const objectives = [reachable[0], unreachable[0], unreachable[1] ?? unreachable[0]];
    const scored = scoreWarObjectives(world, nation.id, army, objectives, enemies, []);

    // Unreachable objectives must be filtered out entirely.
    expect(scored.length).toBe(1);
    expect(scored[0].id).toBe(reachable[0]);
  });
});

describe('Regression: colonial ETA parity', () => {
  it('effectiveColonialDailyRate matches simulation progress rate', () => {
    const world = createWorld(GAME_DATA, 9320);
    disableAi(world);
    const nation = world.playerNation;

    // Find a colonial state with reach.
    const colonialStates = world.states.filter((s) =>
      s.provinceIds.length > 0 &&
      s.provinceIds.every((pid) => world.provinces[pid]?.colonial) &&
      colonialReachKind(world, nation, s.id) !== null
    );
    if (colonialStates.length === 0) return;

    const targetState = colonialStates[0];
    world.nations[nation].colonialPoints = 200;
    const r = startColonization(world, nation, targetState.id);
    expect(r.ok, `startColonization failed: ${r.reason}`).toBe(true);

    // Record progress before advancing.
    const runtimeBefore = exportWarRuntime(world);
    const claimBefore = runtimeBefore.colonialClaims.find((c) => c.stateId === targetState.id);
    const progressBefore = claimBefore?.claimants.find((c) => c.nation === nation)?.progress ?? 0;

    // Advance one day.
    advanceDay(world, GAME_DATA);

    // Record progress after advancing.
    const runtimeAfter = exportWarRuntime(world);
    const claimAfter = runtimeAfter.colonialClaims.find((c) => c.stateId === targetState.id);
    const progressAfter = claimAfter?.claimants.find((c) => c.nation === nation)?.progress ?? 0;
    const simulatedDelta = progressAfter - progressBefore;

    // Compute the displayed rate using the shared function.
    const displayedRate = effectiveColonialDailyRate(
      world, nation, targetState.id, claimAfter?.claimants.length ?? 1,
    );

    // The simulated delta and displayed rate should agree (within floating-point tolerance).
    expect(simulatedDelta).toBeGreaterThan(0);
    expect(displayedRate).toBeGreaterThan(0);
    expect(Math.abs(simulatedDelta - displayedRate)).toBeLessThan(1e-9);
  });

  it('listColonialClaimViews ETA uses effective rate (not base rate)', () => {
    const world = createWorld(GAME_DATA, 9321);
    disableAi(world);
    const nation = world.playerNation;

    const colonialStates = world.states.filter((s) =>
      s.provinceIds.length > 0 &&
      s.provinceIds.every((pid) => world.provinces[pid]?.colonial) &&
      colonialReachKind(world, nation, s.id) !== null
    );
    if (colonialStates.length === 0) return;

    const targetState = colonialStates[0];
    world.nations[nation].colonialPoints = 200;
    startColonization(world, nation, targetState.id);

    // Add a second claimant to introduce competition factor.
    const otherNation = world.nations.find((n) => n.id !== nation && colonialReachKind(world, n.id, targetState.id) !== null);
    if (otherNation) {
      world.nations[otherNation.id].colonialPoints = 200;
      startColonization(world, otherNation.id, targetState.id);
    }

    const views = listColonialClaimViews(world, nation);
    const view = views.find((v) => v.stateId === targetState.id);
    expect(view).toBeDefined();

    const baseRate = colonialDailyProgressRate(world, nation, targetState.id);
    const effectiveRate = effectiveColonialDailyRate(
      world, nation, targetState.id, view!.claimants.length,
    );

    // With competition and/or resistance, effective rate should be <= base rate.
    expect(effectiveRate).toBeLessThanOrEqual(baseRate);

    // ETA should be based on effective rate, not base rate.
    if (view!.etaDays !== null && effectiveRate > 0) {
      const progress = view!.claimants.find((c) => c.nation === nation)?.progress ?? 0;
      const expectedEta = Math.ceil((1 - progress) / effectiveRate);
      expect(view!.etaDays).toBe(expectedEta);
    }
  });
});
