import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { createWorld } from '../src/sim/bootstrap';
import { advanceDay } from '../src/sim/world';

interface NationWarActivity {
  atWarDays: number;
  activeWarDays: number;
  movableWarDays: number;
}

interface AiBehaviorMetrics {
  seed: number;
  maxAllianceCount: number;
  warsSeen: number;
  warsResolved: number;
  provincesChangedOwner: number;
  idleWarNationCount: number;
  trackedWarNations: number;
  bankruptAi: number;
  aiNationCount: number;
  lingeringWarsLong: number;
}

function collectBehaviorMetrics(seed: number, years: number): AiBehaviorMetrics {
  const world = createWorld(GAME_DATA, seed);
  const days = 365 * years;
  const initialOwners = world.provinces.map((province) => province.owner);
  const previousArmyLocation = new Map<number, number>();
  const activity = new Map<number, NationWarActivity>();
  let maxAllianceCount = 0;
  let warsSeen = 0;
  let warsResolved = 0;
  let previousWarIds = new Set<number>();

  for (let day = 0; day < days; day++) {
    const currentWarIds = new Set(world.wars.map((war) => war.id));
    for (const id of currentWarIds) {
      if (!previousWarIds.has(id)) warsSeen++;
    }
    for (const id of previousWarIds) {
      if (!currentWarIds.has(id)) warsResolved++;
    }
    previousWarIds = currentWarIds;

    for (const nation of world.nations) {
      if (nation.isPlayer) continue;
      const involvedWars = world.wars.filter((war) => war.attackers.includes(nation.id) || war.defenders.includes(nation.id));
      const atWar = involvedWars.length > 0;
      if (!atWar) continue;
      const enemies = new Set<number>();
      for (const war of involvedWars) {
        if (war.attackers.includes(nation.id)) for (const defender of war.defenders) enemies.add(defender);
        if (war.defenders.includes(nation.id)) for (const attacker of war.attackers) enemies.add(attacker);
      }
      const armies = world.armies.filter((army) => army.owner === nation.id && !army.rebel && army.regiments.length > 0);
      if (armies.length === 0) continue;
      const entry = activity.get(nation.id) ?? { atWarDays: 0, activeWarDays: 0, movableWarDays: 0 };
      entry.atWarDays++;
      const hasMovableArmy = armies.some((army) => (world.provinces[army.location]?.neighbors.length ?? 0) > 0);
      if (hasMovableArmy) entry.movableWarDays++;
      let active = false;
      for (const army of armies) {
        const prev = previousArmyLocation.get(army.id);
        const province = world.provinces[army.location];
        const siegingEnemyLand = province
          ? enemies.has(province.owner) && province.controller !== nation.id
          : false;
        if (army.moveTarget >= 0 || army.moveProgress > 0 || (prev !== undefined && prev !== army.location) || siegingEnemyLand) {
          active = true;
          break;
        }
      }
      if (active) entry.activeWarDays++;
      activity.set(nation.id, entry);
    }

    for (const army of world.armies) previousArmyLocation.set(army.id, army.location);

    advanceDay(world, GAME_DATA);
    const allianceCount = world.relations.filter((relation) => relation.kind === 'alliance').length;
    if (allianceCount > maxAllianceCount) maxAllianceCount = allianceCount;
  }

  let provincesChangedOwner = 0;
  for (let i = 0; i < world.provinces.length; i++) {
    if (world.provinces[i].owner !== initialOwners[i]) provincesChangedOwner++;
  }

  const trackedWarEntries = Array.from(activity.values()).filter((entry) => entry.atWarDays >= 180 && entry.movableWarDays >= 90);
  const idleWarNationCount = trackedWarEntries.filter((entry) => entry.activeWarDays === 0).length;
  const aiNations = world.nations.filter((nation) => !nation.isPlayer);
  const lingeringWarsLong = world.wars.filter((war) => world.day - war.startDay >= 365 * 8).length;

  return {
    seed,
    maxAllianceCount,
    warsSeen,
    warsResolved,
    provincesChangedOwner,
    idleWarNationCount,
    trackedWarNations: trackedWarEntries.length,
    bankruptAi: aiNations.filter((nation) => nation.isBankrupt).length,
    aiNationCount: aiNations.length,
    lingeringWarsLong,
  };
}

describe('M6 AI behavior quality', () => {
  it('forms alliances, resolves wars decisively, keeps armies active, and avoids mass bankruptcy', () => {
    const seeds = [6602, 6614];
    const metrics = seeds.map((seed) => collectBehaviorMetrics(seed, 16));

    for (const result of metrics) {
      expect(result.maxAllianceCount).toBeGreaterThanOrEqual(1);
      expect(result.warsSeen).toBeGreaterThanOrEqual(8);
      expect(result.warsResolved).toBeGreaterThanOrEqual(Math.floor(result.warsSeen * 0.45));
      expect(result.provincesChangedOwner).toBeGreaterThanOrEqual(14);
      expect(result.idleWarNationCount).toBeLessThanOrEqual(Math.max(3, Math.floor(result.trackedWarNations * 0.3)));
      expect(result.lingeringWarsLong).toBeLessThanOrEqual(2);
      expect(result.bankruptAi).toBeLessThan(Math.ceil(result.aiNationCount * 0.5));
    }

    const combined = metrics.reduce((acc, result) => ({
      alliances: acc.alliances + result.maxAllianceCount,
      wars: acc.wars + result.warsSeen,
      resolved: acc.resolved + result.warsResolved,
      changed: acc.changed + result.provincesChangedOwner,
    }), { alliances: 0, wars: 0, resolved: 0, changed: 0 });

    expect(combined.alliances).toBeGreaterThanOrEqual(3);
    expect(combined.wars).toBeGreaterThanOrEqual(20);
    expect(combined.resolved).toBeGreaterThanOrEqual(Math.floor(combined.wars * 0.5));
    expect(combined.changed).toBeGreaterThanOrEqual(40);
  }, 180_000);
});

