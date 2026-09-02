import type {
  GameData,
  NationDetail,
  NationId,
  PartyIdeology,
  ProvinceDetail,
  ProvinceId,
  PopType,
  World,
} from '../shared/types';
import { computePlayerBudget } from './systems/budget';
import {
  computeReformLegality,
  isElectiveGovernment,
  partyByKey,
  politicalSuppression,
  topReformDemandEntries,
  yearsToElection,
} from './politics';
import { dateAtDay } from './calendar';
import {
  getCbsForNation,
  getCoalitionAgainst,
  getInfluencePool,
  getInfamyLimit,
  getNationPowerBreakdown,
  getNationRelations,
} from './systems/diplomacy';
import { getFormableStatusesForNation } from './formables';

interface PopAggregate {
  type: PopType;
  size: number;
  militancy: number;
  needsMet: number;
  count: number;
}

export function detailProvince(world: World, data: GameData, id: ProvinceId): ProvinceDetail {
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
        weeklyProfit: 0,
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

  // 0.8.0 culture: cultural makeup of the province (largest first).
  const owner = world.nations[province.owner];
  const byCulture = new Map<number, number>();
  let cultureTotal = 0;
  for (const popId of province.popIds) {
    const pop = world.pops[popId];
    if (!pop || pop.size <= 0) continue;
    byCulture.set(pop.culture, (byCulture.get(pop.culture) ?? 0) + pop.size);
    cultureTotal += pop.size;
  }
  const cultures = Array.from(byCulture.entries())
    .map(([culture, size]) => ({
      culture,
      name: data.cultures[culture]?.name ?? `Culture ${culture}`,
      size,
      share: cultureTotal > 0 ? size / cultureTotal : 0,
      accepted: Boolean(owner) && (culture === owner.primaryCulture || owner.acceptedCultures.includes(culture)),
    }))
    .sort((a, b) => b.size - a.size);

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
    cultures,
  };
}

export function detailNation(world: World, data: GameData, id: NationId): NationDetail {
  const nation = world.nations[id];
  if (!nation) {
    return {
      id,
      government: 'absolute_monarchy',
      rulingParty: 'Unknown',
      rulingIdeology: 'conservative',
      upperHouse: [],
      infamy: 0,
      infamyLimit: getInfamyLimit(),
      gpRank: 0,
      industryScore: 0,
      militaryScore: 0,
      powerScore: 0,
      spheredBy: -1,
      sphereMembers: [],
      relations: [],
      cbs: [],
      influencePool: 0,
      coalitionAgainst: [],
      election: {
        elective: false,
        yearsToNext: 0,
        nextYear: 0,
        lastResult: 'N/A',
        ideologyShares: [],
        winnerShare: 0,
      },
      military: {
        regimentsPerSoldierPop: 0,
        standingRegimentCapacity: 0,
        mobilizationCapacity: 0,
        armyOrganization: 1,
        armyMorale: 1,
      },
      politicalSuppression: 0,
      parties: [],
      avgMilitancy: 0,
      avgConsciousness: 0,
      topReformDemands: [],
      stateUnrest: [],
      reforms: {},
      techs: [],
      budget: computePlayerBudget(world, data, world.playerNation),
      reformsAvailable: [],
      formablesAvailable: [],
    };
  }

  let totalMilitancy = 0;
  let totalConsciousness = 0;
  let popCount = 0;
  for (const province of world.provinces) {
    if (province.owner !== nation.id) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      totalMilitancy += pop.militancy;
      totalConsciousness += pop.consciousness;
      popCount += 1;
    }
  }
  const date = dateAtDay(world.day, world.startDate ?? data.startDate);
  const power = getNationPowerBreakdown(world, nation.id);
  const ruling = partyByKey(nation, nation.rulingParty);
  const upperHouse = (Object.entries(nation.upperHouse) as [PartyIdeology, number][])
    .map(([ideology, share]) => ({ ideology, share }))
    .sort((a, b) => b.share - a.share);
  const ideologyShares = (Object.entries(nation.electionIdeologyShares ?? {}) as [PartyIdeology, number][])
    .map(([ideology, share]) => ({ ideology, share }))
    .filter((entry) => entry.share > 0)
    .sort((a, b) => b.share - a.share);
  const parties = nation.parties.map((party) => ({
    key: party.key,
    name: party.name,
    ideology: party.ideology,
    ruling: party.key === nation.rulingParty,
    positions: data.reforms.map((reform) => ({
      reform: reform.key,
      level: Math.max(0, Math.floor(party.positions[reform.key] ?? 0)),
      current: Math.max(0, Math.floor(nation.reforms[reform.key] ?? 0)),
    })),
  }));
  const stateUnrest = world.states
    .filter((state) => state.owner === nation.id)
    .map((state) => {
      let total = 0;
      let count = 0;
      for (const provinceId of state.provinceIds) {
        const province = world.provinces[provinceId];
        if (!province) continue;
        for (const popId of province.popIds) {
          const pop = world.pops[popId];
          if (!pop || pop.size <= 0) continue;
          total += pop.militancy;
          count += 1;
        }
      }
      return {
        stateId: state.id,
        name: state.name,
        risk: state.unrestRisk,
        militancy: count > 0 ? total / count : 0,
      };
    })
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 8);

  return {
    id: nation.id,
    government: nation.government,
    rulingParty: ruling?.name ?? nation.rulingParty,
    rulingIdeology: ruling?.ideology ?? 'conservative',
    upperHouse,
    infamy: nation.infamy,
    infamyLimit: getInfamyLimit(),
    gpRank: nation.gpRank,
    industryScore: power.industry,
    militaryScore: power.military,
    powerScore: power.score,
    spheredBy: nation.spheredBy,
    sphereMembers: nation.sphereMembers.slice().sort((a, b) => a - b),
    relations: getNationRelations(world, nation.id),
    cbs: getCbsForNation(world, nation.id),
    influencePool: getInfluencePool(world, nation.id),
    coalitionAgainst: getCoalitionAgainst(world, nation.id),
    election: {
      elective: isElectiveGovernment(nation.government),
      yearsToNext: yearsToElection(date, nation),
      nextYear: nation.nextElectionYear,
      lastResult: nation.electionLastResult,
      ideologyShares,
      winnerShare: nation.electionWinnerShare ?? 0,
    },
    military: {
      regimentsPerSoldierPop: nation.regimentsPerSoldierPop,
      standingRegimentCapacity: nation.standingRegimentCapacity,
      mobilizationCapacity: nation.mobilizationCapacity,
      armyOrganization: nation.armyOrganization,
      armyMorale: nation.armyMorale,
    },
    politicalSuppression: politicalSuppression(nation, data),
    parties,
    avgMilitancy: popCount > 0 ? totalMilitancy / popCount : 0,
    avgConsciousness: popCount > 0 ? totalConsciousness / popCount : 0,
    topReformDemands: topReformDemandEntries(world, data, nation.id, 6),
    stateUnrest,
    reforms: { ...nation.reforms },
    techs: nation.techs.slice(),
    budget: computePlayerBudget(world, data, nation.id),
    reformsAvailable: data.reforms.flatMap((reform) => {
      const current = nation.reforms[reform.key] ?? 0;
      const result: NationDetail['reformsAvailable'] = [];
      for (let next = current + 1; next < reform.options.length; next++) {
        const legality = computeReformLegality(world, data, nation, reform, next);
        result.push({
          reform: reform.key,
          level: next,
          legal: legality.legal,
          reason: legality.reason,
          support: legality.support,
          requiredSupport: legality.requiredSupport,
          costMoney: legality.costMoney,
          costPrestige: legality.costPrestige,
        });
      }
      return result;
    }),
    formablesAvailable: getFormableStatusesForNation(world, data, nation.id),
  };
}
