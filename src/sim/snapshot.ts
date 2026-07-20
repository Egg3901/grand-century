import type { BudgetLine, GameData, NationSummary, ProvinceSummary, World, WorldSnapshot } from '../shared/types';
import { dayToDate } from './world';

function zeroBudget(): BudgetLine {
  return {
    taxIncome: 0,
    tariffIncome: 0,
    productionIncome: 0,
    armyUpkeep: 0,
    constructionSpend: 0,
    adminSpend: 0,
    net: 0,
  };
}

function provincePopulation(world: World, popIds: number[]): number {
  let total = 0;
  for (const popId of popIds) total += Math.max(0, world.pops[popId]?.size ?? 0);
  return total;
}

function provinceMilitancy(world: World, popIds: number[]): number {
  if (popIds.length === 0) return 0;
  let total = 0;
  for (const popId of popIds) total += Math.max(0, world.pops[popId]?.militancy ?? 0);
  return total / popIds.length;
}

export function buildSnapshot(world: World, data: GameData): WorldSnapshot {
  const rgoOutputByRecipe = Object.fromEntries(
    data.recipes
      .filter((recipe) => recipe.building === 'rgo')
      .map((recipe) => [recipe.key, recipe.output.good]),
  ) as Record<string, number>;

  const nations: NationSummary[] = world.nations.map((nation) => {
    const owned = world.provinces.filter((province) => province.owner === nation.id);
    const popCount = owned.flatMap((province) => province.popIds);
    const avgMilitancy = popCount.length > 0
      ? popCount.reduce((sum, popId) => sum + (world.pops[popId]?.militancy ?? 0), 0) / popCount.length
      : 0;
    return {
      id: nation.id,
      tag: nation.tag,
      name: nation.name,
      color: nation.color,
      treasury: nation.treasury,
      prestige: nation.prestige,
      gpRank: nation.gpRank,
      atWar: world.wars.some((war) => war.attackers.includes(nation.id) || war.defenders.includes(nation.id)),
      numProvinces: owned.length,
      militancy: avgMilitancy,
    };
  });

  const provinces: ProvinceSummary[] = world.provinces.map((province) => ({
    id: province.id,
    owner: province.owner,
    controller: province.controller,
    population: provincePopulation(world, province.popIds),
    militancy: provinceMilitancy(world, province.popIds),
    rgoGood: rgoOutputByRecipe[province.rgo.recipe] ?? 0,
    fortLevel: province.fortLevel,
    occupation: province.occupationProgress,
  }));

  return {
    day: world.day,
    date: dayToDate(world.day),
    speed: world.speed,
    playerNation: world.playerNation,
    nations,
    provinces,
    market: world.market.map((good) => ({ ...good })),
    wars: world.wars.map((war) => ({ ...war, attackers: war.attackers.slice(), defenders: war.defenders.slice(), goals: war.goals.map((goal) => ({ ...goal })) })),
    armies: world.armies.map((army) => ({ ...army, regiments: army.regiments.map((regiment) => ({ ...regiment })), leader: army.leader ? { ...army.leader } : null })),
    fleets: world.fleets.map((fleet) => ({ ...fleet, ships: fleet.ships.map((ship) => ({ ...ship })) })),
    playerBudget: zeroBudget(),
  };
}
