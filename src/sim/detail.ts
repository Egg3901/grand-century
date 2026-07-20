import type {
  GameData,
  NationDetail,
  NationId,
  ProvinceDetail,
  ProvinceId,
  PopType,
  World,
} from '../shared/types';
import { computePlayerBudget } from './systems/budget';

interface PopAggregate {
  type: PopType;
  size: number;
  militancy: number;
  needsMet: number;
  count: number;
}

export function detailProvince(world: World, _data: GameData, id: ProvinceId): ProvinceDetail {
  const province = world.provinces[id];
  if (!province) {
    return {
      id,
      name: 'Unknown Province',
      owner: 0,
      controller: 0,
      terrain: 'plains',
      pops: [],
      rgo: {
        recipe: 'rgo_grain',
        level: 1,
        employed: 0,
      },
      fortLevel: 0,
      navalBaseLevel: 0,
    };
  }

  const byType = new Map<PopType, PopAggregate>();
  for (const popId of province.popIds) {
    const pop = world.pops[popId];
    if (!pop) continue;
    const existing = byType.get(pop.type) ?? {
      type: pop.type,
      size: 0,
      militancy: 0,
      needsMet: 0,
      count: 0,
    };
    existing.size += pop.size;
    existing.militancy += pop.militancy;
    existing.needsMet += pop.needsMet;
    existing.count += 1;
    byType.set(pop.type, existing);
  }

  return {
    id: province.id,
    name: province.name,
    owner: province.owner,
    controller: province.controller,
    terrain: province.terrain,
    pops: Array.from(byType.values()).map((entry) => ({
      type: entry.type,
      size: Math.max(0, Math.floor(entry.size)),
      militancy: entry.count > 0 ? entry.militancy / entry.count : 0,
      needsMet: entry.count > 0 ? entry.needsMet / entry.count : 0,
    })),
    rgo: { ...province.rgo },
    fortLevel: province.fortLevel,
    navalBaseLevel: province.navalBaseLevel,
  };
}

export function detailNation(world: World, data: GameData, id: NationId): NationDetail {
  const nation = world.nations[id];
  if (!nation) {
    return {
      id,
      reforms: {},
      techs: [],
      budget: computePlayerBudget(world, data, world.playerNation),
      reformsAvailable: [],
    };
  }

  return {
    id: nation.id,
    reforms: { ...nation.reforms },
    techs: nation.techs.slice(),
    budget: computePlayerBudget(world, data, nation.id),
    reformsAvailable: data.reforms.flatMap((reform) => {
      const current = nation.reforms[reform.key] ?? 0;
      const next = current + 1;
      if (next >= reform.options.length) return [];
      return [{
        reform: reform.key,
        level: next,
        legal: true,
      }];
    }),
  };
}
