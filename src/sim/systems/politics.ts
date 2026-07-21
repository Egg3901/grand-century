import type { GameData, RebelDemand, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import {
  aggregateReformDemand,
  computeReformLegality,
  ideologyFromPop,
  isElectiveGovernment,
  normalizeUpperHouse,
  partyByKey,
  politicalSuppression,
  popSupportsFranchise,
  reformDemandForPop,
  updateMilitaryDerivedForNation,
  updateNationalLiteracyAndConsciousness,
  updateStateUnrest,
} from '../politics';

const EPOCH_YEAR = 1820;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function currentYear(day: number): number {
  return EPOCH_YEAR + Math.floor(day / 365);
}

function pickElectionParty(world: World, data: GameData, nationId: number, rng: Rng): void {
  const nation = world.nations[nationId];
  if (!nation || !isElectiveGovernment(nation.government) || currentYear(world.day) < nation.nextElectionYear) return;

  const franchise = Math.max(0, Math.floor(nation.reforms.voting_franchise ?? 0));
  const voteTotals = new Map<string, number>();
  const ideologyVotes = {
    reactionary: 0,
    conservative: 0,
    liberal: 0,
    socialist: 0,
    communist: 0,
    fascist: 0,
  };
  const ownedProvinceIds = new Set(world.provinces.filter((province) => province.owner === nationId).map((province) => province.id));
  if (ownedProvinceIds.size === 0) return;

  for (const party of nation.parties) voteTotals.set(party.key, rng.next() * 1e-3);

  for (const pop of world.pops) {
    if (pop.size <= 0 || !ownedProvinceIds.has(pop.provinceId)) continue;
    const franchiseWeight = popSupportsFranchise(pop.type, franchise);
    if (franchiseWeight <= 0) continue;

    const demand = reformDemandForPop(pop, nation, data);
    const ideology = ideologyFromPop(pop);
    const baseWeight = pop.size * franchiseWeight;
    let bestParty = nation.parties[0];
    let bestScore = -Infinity;
    for (const party of nation.parties) {
      let score = party.ideology === ideology ? 1 : 0.58;
      if (demand) {
        const reform = data.reforms.find((candidate) => candidate.key === demand);
        if (reform) {
          const next = (nation.reforms[demand] ?? 0) + 1;
          score += (party.positions[demand] ?? 0) >= next ? 0.36 : -0.14;
          if (!computeReformLegality(world, data, nation, reform, next).legal) score -= 0.08;
        }
      }
      score += pop.consciousness * 0.01;
      score -= (1 - pop.needsMet) * 0.06;
      score += rng.next() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestParty = party;
      }
    }
    voteTotals.set(bestParty.key, (voteTotals.get(bestParty.key) ?? 0) + baseWeight);
    ideologyVotes[bestParty.ideology] += baseWeight;
  }

  const winner = Array.from(voteTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!winner) return;

  const totalVotes = Array.from(voteTotals.values()).reduce((sum, value) => sum + value, 0);
  const winnerVotes = voteTotals.get(winner) ?? 0;
  const winnerShare = totalVotes > 0 ? winnerVotes / totalVotes : 0;
  nation.rulingParty = winner;
  nation.lastElectionYear = currentYear(world.day);
  nation.nextElectionYear = nation.lastElectionYear + Math.max(3, nation.electionIntervalYears);
  nation.electionLastResult = `${partyByKey(nation, winner)?.name ?? winner} won ${(winnerShare * 100).toFixed(1)}%`;

  const ideologyTotal = Object.values(ideologyVotes).reduce((sum, value) => sum + value, 0);
  if (ideologyTotal > 0) {
    nation.upperHouse = normalizeUpperHouse({
      reactionary: nation.upperHouse.reactionary * 0.55 + (ideologyVotes.reactionary / ideologyTotal) * 0.45,
      conservative: nation.upperHouse.conservative * 0.55 + (ideologyVotes.conservative / ideologyTotal) * 0.45,
      liberal: nation.upperHouse.liberal * 0.55 + (ideologyVotes.liberal / ideologyTotal) * 0.45,
      socialist: nation.upperHouse.socialist * 0.55 + (ideologyVotes.socialist / ideologyTotal) * 0.45,
      communist: nation.upperHouse.communist * 0.65 + (ideologyVotes.communist / ideologyTotal) * 0.35,
      fascist: nation.upperHouse.fascist * 0.65 + (ideologyVotes.fascist / ideologyTotal) * 0.35,
    });
  }
}

function driftUpperHouse(world: World, nationId: number): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const weighted = {
    reactionary: 0,
    conservative: 0,
    liberal: 0,
    socialist: 0,
    communist: 0,
    fascist: 0,
  };
  let total = 0;
  for (const province of world.provinces) {
    if (province.owner !== nationId) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      const ideology = ideologyFromPop(pop);
      weighted[ideology] += pop.size;
      total += pop.size;
    }
  }
  if (total <= 0) return;
  const drift = isElectiveGovernment(nation.government) ? 0.22 : 0.09;
  const authoritarianBonus = isElectiveGovernment(nation.government) ? 0 : 0.05;
  nation.upperHouse = normalizeUpperHouse({
    reactionary: nation.upperHouse.reactionary * (1 - drift) + (weighted.reactionary / total + authoritarianBonus) * drift,
    conservative: nation.upperHouse.conservative * (1 - drift) + (weighted.conservative / total + authoritarianBonus * 0.8) * drift,
    liberal: nation.upperHouse.liberal * (1 - drift) + (weighted.liberal / total) * drift,
    socialist: nation.upperHouse.socialist * (1 - drift) + (weighted.socialist / total) * drift,
    communist: nation.upperHouse.communist * (1 - drift) + (weighted.communist / total) * drift,
    fascist: nation.upperHouse.fascist * (1 - drift) + (weighted.fascist / total) * drift,
  });
}

function applySuppressionEffects(world: World, data: GameData, nationId: number): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const ownedProvinceIds = new Set(world.provinces.filter((province) => province.owner === nationId).map((province) => province.id));
  if (ownedProvinceIds.size === 0) return;
  const suppression = politicalSuppression(nation, data);
  const demand = aggregateReformDemand(world, data, nationId);

  for (const pop of world.pops) {
    if (pop.size <= 0 || !ownedProvinceIds.has(pop.provinceId)) continue;
    const wanted = reformDemandForPop(pop, nation, data);
    const blockedSupport = wanted ? demand.get(wanted) ?? 0 : 0;
    let deniedPressure = 0;
    if (wanted) {
      const reform = data.reforms.find((candidate) => candidate.key === wanted);
      if (reform) {
        const next = (nation.reforms[wanted] ?? 0) + 1;
        const legality = computeReformLegality(world, data, nation, reform, next);
        deniedPressure = legality.legal
          ? -BALANCE.population.legalReformRelief
          : BALANCE.population.deniedReformBasePressure + blockedSupport * BALANCE.population.deniedReformSupportPressure;
      }
    }
    pop.militancy = clamp(pop.militancy + suppression * BALANCE.population.suppressionMilitancyImpact + deniedPressure, 0, 10);
    pop.consciousness = clamp(pop.consciousness + suppression * 0.03 + blockedSupport * 0.08, 0, 10);
  }
}

function dominantMinorityCultureInState(world: World, nationId: number, stateId: number): { culture: number; share: number } | null {
  const nation = world.nations[nationId];
  const state = world.states[stateId];
  if (!nation || !state) return null;
  const accepted = new Set([nation.primaryCulture, ...(nation.acceptedCultures ?? [])]);
  const culturePop = new Map<number, number>();
  let total = 0;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      if (accepted.has(pop.culture)) continue;
      culturePop.set(pop.culture, (culturePop.get(pop.culture) ?? 0) + pop.size);
      total += pop.size;
    }
  }
  if (total <= 0) return null;
  const top = Array.from(culturePop.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (!top) return null;
  return {
    culture: top[0],
    share: top[1] / total,
  };
}

function chooseRebelDemand(world: World, data: GameData, nationId: number, stateId: number): RebelDemand {
  const nation = world.nations[nationId];
  const state = world.states[stateId];
  if (!nation || !state) {
    return { type: 'enact_reform', description: 'Political reforms', reformKey: 'press_rights', reformLevel: 1 };
  }
  const reformPressure = new Map<string, number>();
  let totalWeight = 0;
  for (const provinceId of state.provinceIds) {
    const province = world.provinces[provinceId];
    if (!province) continue;
    for (const popId of province.popIds) {
      const pop = world.pops[popId];
      if (!pop || pop.size <= 0) continue;
      const demand = reformDemandForPop(pop, nation, data);
      if (!demand) continue;
      const weight = pop.size * (0.5 + clamp(pop.militancy / 10, 0, 1) * 0.5);
      reformPressure.set(demand, (reformPressure.get(demand) ?? 0) + weight);
      totalWeight += weight;
    }
  }
  const topDemand = Array.from(reformPressure.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topDemand && totalWeight > 0) {
    const reform = data.reforms.find((candidate) => candidate.key === topDemand[0]);
    if (reform) {
      const next = (nation.reforms[reform.key] ?? 0) + 1;
      const legality = computeReformLegality(world, data, nation, reform, next);
      if (!legality.legal || topDemand[1] / totalWeight > 0.24) {
        return {
          type: 'enact_reform',
          description: `Enact ${reform.name}`,
          reformKey: reform.key,
          reformLevel: clamp(next, 0, reform.options.length - 1),
        };
      }
    }
  }
  const minority = dominantMinorityCultureInState(world, nationId, stateId);
  if (minority && minority.share >= 0.38) {
    const cultureName = data.cultures[minority.culture]?.name ?? `Culture ${minority.culture}`;
    return {
      type: 'independence',
      description: `${cultureName} independence`,
      culture: minority.culture,
      stateIds: [stateId],
    };
  }
  return {
    type: 'enact_reform',
    description: 'Expand voting franchise',
    reformKey: 'voting_franchise',
    reformLevel: Math.min(3, (nation.reforms.voting_franchise ?? 0) + 1),
  };
}

function spawnRebellionIfNeeded(world: World, data: GameData, nationId: number): void {
  if (!Array.isArray(world.rebellions)) world.rebellions = [];
  if (!Number.isFinite(world.nextRebellionId)) world.nextRebellionId = 1;
  const activeRebellions = world.rebellions.filter((rebellion) => rebellion.status === 'active');
  let activeWorldCount = activeRebellions.length;
  if (activeWorldCount >= BALANCE.rebellion.worldActiveCap) return;
  let activeNationCount = activeRebellions.filter((rebellion) => rebellion.targetNation === nationId).length;
  if (activeNationCount >= BALANCE.rebellion.nationActiveCap) return;

  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    let bestProvince = state.provinceIds[0] ?? -1;
    let bestMil = -Infinity;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      let totalMil = 0;
      let count = 0;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        totalMil += pop.militancy;
        count += 1;
      }
      const avgMil = count > 0 ? totalMil / count : 0;
      if (avgMil > bestMil) {
        bestMil = avgMil;
        bestProvince = provinceId;
      }
    }
    if (bestProvince < 0) continue;
    const unrestHot = state.unrestRisk >= BALANCE.rebellion.unrestRiskThreshold
      && bestMil >= BALANCE.rebellion.stateMilitancyThreshold;
    state.unrestMonths = unrestHot ? state.unrestMonths + 1 : Math.max(0, state.unrestMonths - 1);
    if (!unrestHot) continue;
    if (state.unrestMonths < BALANCE.rebellion.sustainedUnrestMonths) continue;
    if (world.day - state.lastRebellionDay < BALANCE.rebellion.stateCooldownDays) continue;
    if (activeNationCount >= BALANCE.rebellion.nationActiveCap) continue;
    if (activeWorldCount >= BALANCE.rebellion.worldActiveCap) break;

    const province = world.provinces[bestProvince];
    if (!province) continue;
    const demand = chooseRebelDemand(world, data, nationId, state.id);
    const existing = world.rebellions.find((rebellion) => (
      rebellion.status === 'active'
      && rebellion.targetNation === nationId
      && rebellion.originState === state.id
    ));
    if (existing) continue;
    const rebellionId = world.nextRebellionId++;
    world.rebellions.push({
      id: rebellionId,
      targetNation: nationId,
      originState: state.id,
      startDay: world.day,
      progress: 0,
      holdDays: 0,
      status: 'active',
      demand,
    });
    const regimentCount = clamp(
      Math.floor(state.unrestRisk * BALANCE.rebellion.spawnRegimentScale),
      BALANCE.rebellion.spawnRegimentMin,
      BALANCE.rebellion.spawnRegimentMax,
    );
    const sourcePop = province.popIds.find((popId) => (world.pops[popId]?.size ?? 0) > 0) ?? 0;
    world.armies.push({
      id: world.nextArmyId++,
      owner: -1,
      location: province.id,
      moveTarget: -1,
      moveProgress: 0,
      regiments: Array.from({ length: regimentCount }, () => ({
        type: 'infantry',
        strength: 900,
        organization: 45,
        sourcePop,
      })),
      leader: { name: 'Rebel Committee', attack: 1, defense: 1, trait: 'uprising' },
      rebel: true,
      hostileTo: nationId,
      rebellionId,
      rebelDemand: demand,
    });
    state.lastRebellionDay = world.day;
    state.unrestRisk = clamp(state.unrestRisk * BALANCE.rebellion.postSpawnUnrestMultiplier, 0, 2);
    state.unrestMonths = 0;
    activeNationCount += 1;
    activeWorldCount += 1;
  }
}

export function runPoliticsMonthly(world: World, data: GameData, rng: Rng): void {
  for (const nation of world.nations) {
    pickElectionParty(world, data, nation.id, rng);
    driftUpperHouse(world, nation.id);
    applySuppressionEffects(world, data, nation.id);
    updateNationalLiteracyAndConsciousness(world, nation.id);
    updateMilitaryDerivedForNation(world, nation.id);
  }
  for (const nation of world.nations) updateStateUnrest(world, data, nation.id);
  for (const nation of world.nations) spawnRebellionIfNeeded(world, data, nation.id);
}
