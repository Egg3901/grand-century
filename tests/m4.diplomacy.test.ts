import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { applyCommand } from '../src/sim/commands';
import { createWorld } from '../src/sim/bootstrap';
import {
  evaluateAllianceAcceptance,
  getGreatPowerStandings,
  getOrCreateRelation,
  runDiplomacyMonthly,
  setRelationKindByCommand,
} from '../src/sim/systems/diplomacy';
import { advanceDay } from '../src/sim/world';
import { Rng } from '../src/sim/rng';

function noopPost() {
  // command log sink for tests
}

function firstTarget(worldPlayer: number, length: number): number {
  for (let i = 0; i < length; i++) if (i !== worldPlayer) return i;
  return 0;
}

describe('M4 diplomacy layer', () => {
  it('proposeAlliance succeeds at high opinion and fails at low opinion', () => {
    const world = createWorld(GAME_DATA, 4401);
    const target = world.nations
      .filter((nation) => nation.id !== world.playerNation)
      .map((nation) => {
        const relation = getOrCreateRelation(world, world.playerNation, nation.id);
        relation.kind = 'neutral';
        relation.opinion = 150;
        return { nationId: nation.id, score: evaluateAllianceAcceptance(world, world.playerNation, nation.id).score };
      })
      .sort((a, b) => b.score - a.score)[0]?.nationId ?? firstTarget(world.playerNation, world.nations.length);
    const relation = getOrCreateRelation(world, world.playerNation, target);

    relation.kind = 'neutral';
    relation.opinion = 150;
    applyCommand(world, GAME_DATA, { t: 'proposeAlliance', target }, noopPost);
    expect(getOrCreateRelation(world, world.playerNation, target).kind).toBe('alliance');

    relation.kind = 'neutral';
    relation.opinion = -120;
    applyCommand(world, GAME_DATA, { t: 'proposeAlliance', target }, noopPost);
    expect(getOrCreateRelation(world, world.playerNation, target).kind).not.toBe('alliance');
  });

  it('declareWar applies no-CB infamy and CB wars pull allied attackers', () => {
    const worldNoCb = createWorld(GAME_DATA, 4402);
    const noCbTarget = firstTarget(worldNoCb.playerNation, worldNoCb.nations.length);
    const infamyBefore = worldNoCb.nations[worldNoCb.playerNation].infamy;
    applyCommand(worldNoCb, GAME_DATA, { t: 'declareWar', target: noCbTarget, goal: 'humiliate', state: -1 }, noopPost);
    expect(worldNoCb.nations[worldNoCb.playerNation].infamy).toBeGreaterThan(infamyBefore);

    const world = createWorld(GAME_DATA, 4403);
    const target = firstTarget(world.playerNation, world.nations.length);
    const ally = world.nations.find((nation) => nation.id !== world.playerNation && nation.id !== target)?.id ?? target;
    setRelationKindByCommand(world, world.playerNation, ally, 'alliance');
    getOrCreateRelation(world, ally, target).kind = 'neutral';

    applyCommand(world, GAME_DATA, { t: 'fabricateCB', target, goal: 'humiliate', state: -1 }, noopPost);
    for (let day = 0; day < 100; day++) advanceDay(world, GAME_DATA);
    applyCommand(world, GAME_DATA, { t: 'declareWar', target, goal: 'humiliate', state: -1 }, noopPost);

    // Find the player's declared war rather than sampling wars[0] — the AI can
    // legitimately open its own war (e.g. a unification war) during the 100
    // fabrication days.
    const war = world.wars.find((candidate) => (
      candidate.goals.some((goal) => goal.holder === world.playerNation && goal.type === 'humiliate' && goal.target === target)
    ));
    expect(war).toBeTruthy();
    expect(war!.attackers.includes(world.playerNation)).toBe(true);
    expect(war!.attackers.includes(ally)).toBe(true);
  });

  it('great power ranking returns up to eight in score order', () => {
    const world = createWorld(GAME_DATA, 4404);
    runDiplomacyMonthly(world, GAME_DATA, new Rng(world.rngState));
    const standings = getGreatPowerStandings(world);
    expect(standings.length).toBe(Math.min(8, world.nations.length));
    for (let i = 0; i < standings.length; i++) {
      expect(standings[i].rank).toBe(i + 1);
      if (i < standings.length - 1) expect(standings[i].score).toBeGreaterThanOrEqual(standings[i + 1].score);
      expect(world.nations[standings[i].nation].gpRank).toBe(i + 1);
    }
  });

  it('fabricating aggressive CB raises infamy', () => {
    const world = createWorld(GAME_DATA, 4405);
    const target = firstTarget(world.playerNation, world.nations.length);
    const targetState = world.provinces.find((province) => province.owner === target)?.stateId ?? -1;
    const infamyBefore = world.nations[world.playerNation].infamy;
    applyCommand(world, GAME_DATA, { t: 'fabricateCB', target, goal: 'annex_state', state: targetState }, noopPost);
    expect(world.nations[world.playerNation].infamy).toBeGreaterThan(infamyBefore);
  });

  it('remains deterministic for same seed and command log', () => {
    const a = createWorld(GAME_DATA, 4406);
    const b = createWorld(GAME_DATA, 4406);
    const target = firstTarget(a.playerNation, a.nations.length);
    const ally = a.nations.find((nation) => nation.id !== a.playerNation && nation.id !== target)?.id ?? target;

    setRelationKindByCommand(a, a.playerNation, ally, 'alliance');
    setRelationKindByCommand(b, b.playerNation, ally, 'alliance');

    applyCommand(a, GAME_DATA, { t: 'fabricateCB', target, goal: 'humiliate', state: -1 }, noopPost);
    applyCommand(b, GAME_DATA, { t: 'fabricateCB', target, goal: 'humiliate', state: -1 }, noopPost);

    for (let day = 0; day < 120; day++) {
      advanceDay(a, GAME_DATA);
      advanceDay(b, GAME_DATA);
    }

    applyCommand(a, GAME_DATA, { t: 'declareWar', target, goal: 'humiliate', state: -1 }, noopPost);
    applyCommand(b, GAME_DATA, { t: 'declareWar', target, goal: 'humiliate', state: -1 }, noopPost);

    expect(getGreatPowerStandings(a)).toEqual(getGreatPowerStandings(b));
    expect(a.wars).toEqual(b.wars);
    expect(
      a.nations.map((nation) => ({
        id: nation.id,
        gpRank: nation.gpRank,
        infamy: Number(nation.infamy.toFixed(4)),
        spheredBy: nation.spheredBy,
        sphereMembers: nation.sphereMembers.slice(),
      })),
    ).toEqual(
      b.nations.map((nation) => ({
        id: nation.id,
        gpRank: nation.gpRank,
        infamy: Number(nation.infamy.toFixed(4)),
        spheredBy: nation.spheredBy,
        sphereMembers: nation.sphereMembers.slice(),
      })),
    );
  });
});
