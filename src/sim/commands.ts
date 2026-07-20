import type { Command, FromWorker, GameData, NationId, Regiment, War, WarGoal, World } from '../shared/types';

type Poster = (msg: FromWorker) => void;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function log(post: Poster, level: 'info' | 'warn' | 'error', msg: string): void {
  post({ t: 'log', level, msg });
}

function createWarGoal(cmd: Extract<Command, { t: 'declareWar' | 'fabricateCB' }>, holder: NationId): WarGoal {
  return {
    holder,
    target: cmd.target,
    type: cmd.goal,
    stateId: cmd.state,
    scoreValue: 25,
  };
}

export function applyCommand(world: World, data: GameData, cmd: Command, post: Poster): void {
  switch (cmd.t) {
    case 'setSpeed':
      world.speed = clamp(cmd.speed, 0, 5);
      return;
    case 'setPlayerNation':
      if (!world.nations[cmd.nation]) return;
      world.playerNation = cmd.nation;
      world.nations.forEach((nation) => {
        nation.isPlayer = nation.id === cmd.nation;
      });
      return;
    case 'setTax': {
      const nation = world.nations[world.playerNation];
      if (!nation) return;
      const rate = clamp(cmd.rate, 0, 1);
      if (cmd.bracket === 'poor') nation.taxRatePoor = rate;
      else if (cmd.bracket === 'middle') nation.taxRateMiddle = rate;
      else nation.taxRateRich = rate;
      return;
    }
    case 'setTariff': {
      const nation = world.nations[world.playerNation];
      if (!nation) return;
      nation.tariffRate = clamp(cmd.rate, -1, 1);
      return;
    }
    case 'enactReform': {
      const nation = world.nations[world.playerNation];
      const reformDef = data.reforms.find((reform) => reform.key === cmd.reform);
      if (!nation || !reformDef) return;
      nation.reforms[cmd.reform] = clamp(cmd.level, 0, reformDef.options.length - 1);
      return;
    }
    case 'buildFactory': {
      const state = world.states[cmd.state];
      const recipe = data.recipes.find((candidate) => candidate.key === cmd.recipe && candidate.building === 'factory');
      if (!state || !recipe) return;
      state.factories.push({
        recipe: recipe.key,
        level: 1,
        employed: 500,
        stockpileIn: 0,
        profitTrend: 0,
      });
      return;
    }
    case 'recruitArmy': {
      const province = world.provinces[cmd.province];
      if (!province || province.owner !== world.playerNation) return;
      const soldierPops = province.popIds.map((id) => world.pops[id]).filter((pop) => pop?.type === 'soldier' && pop.size > 200);
      if (soldierPops.length === 0) {
        log(post, 'warn', 'No soldier pops available for recruitment.');
        return;
      }
      const regiments: Regiment[] = soldierPops.slice(0, 4).map((pop) => {
        pop.size = Math.max(0, pop.size - 80);
        return {
          type: 'infantry',
          strength: 1000,
          organization: 60,
          sourcePop: pop.id,
        };
      });
      world.armies.push({
        id: world.nextArmyId++,
        owner: province.owner,
        location: province.id,
        moveTarget: -1,
        moveProgress: 0,
        regiments,
        leader: null,
      });
      return;
    }
    case 'moveArmy': {
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!army) return;
      const target = world.provinces[cmd.target];
      if (!target) return;
      army.moveTarget = cmd.target;
      army.moveProgress = 0;
      return;
    }
    case 'moveFleet': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      if (!fleet || !world.provinces[cmd.target]) return;
      fleet.moveTarget = cmd.target;
      fleet.moveProgress = 0;
      return;
    }
    case 'embarkArmy': {
      const fleet = world.fleets.find((candidate) => candidate.id === cmd.fleet);
      const army = world.armies.find((candidate) => candidate.id === cmd.army);
      if (!fleet || !army || army.owner !== fleet.owner) return;
      fleet.embarkedArmy = army.id;
      army.location = fleet.location;
      return;
    }
    case 'proposeAlliance': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      const existing = world.relations.find((relation) => (
        (relation.a === world.playerNation && relation.b === cmd.target)
        || (relation.b === world.playerNation && relation.a === cmd.target)
      ));
      if (existing) {
        existing.kind = 'alliance';
        existing.opinion = Math.max(existing.opinion, 75);
      } else {
        world.relations.push({
          a: world.playerNation,
          b: cmd.target,
          kind: 'alliance',
          opinion: 75,
          expiresDay: -1,
        });
      }
      return;
    }
    case 'fabricateCB': {
      if (!world.nations[cmd.target]) return;
      log(post, 'info', `CB fabricated on ${world.nations[cmd.target].tag} for ${cmd.goal}.`);
      return;
    }
    case 'declareWar': {
      if (!world.nations[cmd.target] || cmd.target === world.playerNation) return;
      const war: War = {
        id: world.nextWarId++,
        attackers: [world.playerNation],
        defenders: [cmd.target],
        goals: [createWarGoal(cmd, world.playerNation)],
        score: 0,
        attackerExhaustion: 0,
        defenderExhaustion: 0,
        startDay: world.day,
      };
      world.wars.push(war);
      return;
    }
    case 'offerPeace': {
      const warIndex = world.wars.findIndex((war) => war.id === cmd.war);
      if (warIndex >= 0) world.wars.splice(warIndex, 1);
      return;
    }
    case 'colonize': {
      const state = world.states[cmd.state];
      if (!state) return;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        province.owner = world.playerNation;
        province.controller = world.playerNation;
        province.colonial = false;
      }
      return;
    }
    case 'newGame':
      // Handled by the worker entry point to rebuild a brand new world.
      return;
    case 'save':
      log(post, 'info', `Save requested for slot "${cmd.slot}" (M0 stub).`);
      return;
    case 'load':
      log(post, 'info', `Load requested for slot "${cmd.slot}" (M0 stub).`);
      return;
    default:
      return;
  }
}
