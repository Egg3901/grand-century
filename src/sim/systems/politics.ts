import type { GameData, Pop, RebelDemand, ReformDef, World } from '../../shared/types';
import type { Rng } from '../rng';
import { BALANCE } from '../balance';
import { yearAtDay } from '../calendar';
import {
  computeReformLegality,
  decayReformFatigue,
  ideologyFromPop,
  isElectiveGovernment,
  normalizeUpperHouse,
  partyByKey,
  politicalSuppression,
  popSupportsFranchise,
  reformDemandForPop,
  updateMilitaryDerivedForNation,
  updateNationalLiteracyAndConsciousness,
  upperHouseCompositionWeights,
} from '../politics';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Precompute reform defs by key once per monthly tick (avoids repeated `.find`). */
function reformsByKeyMap(data: GameData): Map<string, ReformDef> {
  const map = new Map<string, ReformDef>();
  for (const reform of data.reforms) map.set(reform.key, reform);
  return map;
}

/**
 * Bucket pops by current province owner once per month.
 * Index is nationId → pops; empty nations get `[]`.
 */
function bucketPopsByNation(world: World): Pop[][] {
  const buckets: Pop[][] = Array.from({ length: world.nations.length }, () => []);
  for (const pop of world.pops) {
    if (pop.size <= 0) continue;
    const province = world.provinces[pop.provinceId];
    if (!province) continue;
    const owner = province.owner;
    if (owner < 0 || owner >= buckets.length) continue;
    buckets[owner].push(pop);
  }
  return buckets;
}

function aggregateReformDemandFromPops(
  pops: Pop[],
  nation: World['nations'][number],
  data: GameData,
): Map<string, number> {
  const demand = new Map<string, number>();
  let totalWeight = 0;
  for (const pop of pops) {
    if (pop.size <= 0) continue;
    const wanted = reformDemandForPop(pop, nation, data);
    if (!wanted) continue;
    const weight = pop.size * (0.45 + (1 - pop.needsMet) * 0.55);
    demand.set(wanted, (demand.get(wanted) ?? 0) + weight);
    totalWeight += weight;
  }
  if (totalWeight <= 0) return demand;
  for (const [key, value] of demand.entries()) demand.set(key, value / totalWeight);
  return demand;
}

function pickElectionParty(
  world: World,
  data: GameData,
  nationId: number,
  rng: Rng,
  nationPops: Pop[],
  reformsByKey: Map<string, ReformDef>,
): void {
  const nation = world.nations[nationId];
  if (!nation || !isElectiveGovernment(nation.government) || yearAtDay(world.day, world.startDate ?? data.startDate) < nation.nextElectionYear) return;
  // Match prior early-exit: need at least one owned province (even if pops are empty).
  let ownsProvince = false;
  for (const province of world.provinces) {
    if (province.owner === nationId) {
      ownsProvince = true;
      break;
    }
  }
  if (!ownsProvince) return;

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

  for (const party of nation.parties) voteTotals.set(party.key, rng.next() * 1e-3);

  for (const pop of nationPops) {
    if (pop.size <= 0) continue;
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
        const reform = reformsByKey.get(demand);
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
  const ideologyTotal = Object.values(ideologyVotes).reduce((sum, value) => sum + value, 0);
  nation.rulingParty = winner;
  nation.lastElectionYear = yearAtDay(world.day, world.startDate ?? data.startDate);
  nation.nextElectionYear = nation.lastElectionYear + Math.max(3, nation.electionIntervalYears);
  nation.electionLastResult = `${partyByKey(nation, winner)?.name ?? winner} won ${(winnerShare * 100).toFixed(1)}%`;
  nation.electionWinnerShare = winnerShare;
  if (ideologyTotal > 0) {
    nation.electionIdeologyShares = {
      reactionary: ideologyVotes.reactionary / ideologyTotal,
      conservative: ideologyVotes.conservative / ideologyTotal,
      liberal: ideologyVotes.liberal / ideologyTotal,
      socialist: ideologyVotes.socialist / ideologyTotal,
      communist: ideologyVotes.communist / ideologyTotal,
      fascist: ideologyVotes.fascist / ideologyTotal,
    };
    const uh = upperHouseCompositionWeights(nation.reforms.upper_house_composition ?? 0);
    const retain = uh.electionRetain;
    const vote = uh.electionVote;
    // Extreme ideologies stay stickier under appointed chambers.
    const extremeRetain = Math.min(0.85, retain + 0.1);
    const extremeVote = 1 - extremeRetain;
    nation.upperHouse = normalizeUpperHouse({
      reactionary: nation.upperHouse.reactionary * retain + (ideologyVotes.reactionary / ideologyTotal) * vote,
      conservative: nation.upperHouse.conservative * retain + (ideologyVotes.conservative / ideologyTotal) * vote,
      liberal: nation.upperHouse.liberal * retain + (ideologyVotes.liberal / ideologyTotal) * vote,
      socialist: nation.upperHouse.socialist * retain + (ideologyVotes.socialist / ideologyTotal) * vote,
      communist: nation.upperHouse.communist * extremeRetain + (ideologyVotes.communist / ideologyTotal) * extremeVote,
      fascist: nation.upperHouse.fascist * extremeRetain + (ideologyVotes.fascist / ideologyTotal) * extremeVote,
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
  const uh = upperHouseCompositionWeights(nation.reforms.upper_house_composition ?? 0);
  const drift = isElectiveGovernment(nation.government) ? uh.driftElective : uh.driftAuthoritarian;
  // Non-elective governments keep the floor bias; appointed chambers add more.
  const authoritarianBonus = (isElectiveGovernment(nation.government) ? 0 : 0.05) + uh.authoritarianBias;
  nation.upperHouse = normalizeUpperHouse({
    reactionary: nation.upperHouse.reactionary * (1 - drift) + (weighted.reactionary / total + authoritarianBonus) * drift,
    conservative: nation.upperHouse.conservative * (1 - drift) + (weighted.conservative / total + authoritarianBonus * 0.8) * drift,
    liberal: nation.upperHouse.liberal * (1 - drift) + (weighted.liberal / total) * drift,
    socialist: nation.upperHouse.socialist * (1 - drift) + (weighted.socialist / total) * drift,
    communist: nation.upperHouse.communist * (1 - drift) + (weighted.communist / total) * drift,
    fascist: nation.upperHouse.fascist * (1 - drift) + (weighted.fascist / total) * drift,
  });
}

function applySuppressionEffects(
  world: World,
  data: GameData,
  nationId: number,
  nationPops: Pop[],
  reformsByKey: Map<string, ReformDef>,
  demand: Map<string, number>,
): void {
  const nation = world.nations[nationId];
  if (!nation || nationPops.length === 0) return;
  const suppression = politicalSuppression(nation, data);
  const pensionLevel = clamp(Math.floor(nation.reforms.pension_system ?? 0), 0, 3);
  const laborLevel = clamp(Math.floor(nation.reforms.labor_safety ?? 0), 0, 3);
  // BALANCE: social reforms now relieve worker militancy (were prestige sinks).
  const pensionRelief = [0, 0.018, 0.035, 0.055][pensionLevel] ?? 0;
  const laborRelief = [0, 0.012, 0.028, 0.045][laborLevel] ?? 0;

  for (const pop of nationPops) {
    if (pop.size <= 0) continue;
    const wanted = reformDemandForPop(pop, nation, data);
    const blockedSupport = wanted ? demand.get(wanted) ?? 0 : 0;
    let deniedPressure = 0;
    if (wanted) {
      const reform = reformsByKey.get(wanted);
      if (reform) {
        const next = (nation.reforms[wanted] ?? 0) + 1;
        const legality = computeReformLegality(world, data, nation, reform, next);
        deniedPressure = legality.legal
          ? -BALANCE.population.legalReformRelief
          : BALANCE.population.deniedReformBasePressure + blockedSupport * BALANCE.population.deniedReformSupportPressure;
      }
    }
    let socialRelief = 0;
    if (pop.type === 'farmer' || pop.type === 'laborer' || pop.type === 'craftsman') {
      socialRelief = pensionRelief;
      if (pop.type === 'laborer' || pop.type === 'craftsman') socialRelief += laborRelief;
      else socialRelief += laborRelief * 0.35; // farmers get a thin labor-code spillover
    }
    pop.militancy = clamp(
      pop.militancy + suppression * BALANCE.population.suppressionMilitancyImpact + deniedPressure - socialRelief,
      0,
      10,
    );
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

function chooseRebelDemand(
  world: World,
  data: GameData,
  nationId: number,
  stateId: number,
  reformsByKey: Map<string, ReformDef>,
): RebelDemand {
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
    const reform = reformsByKey.get(topDemand[0]);
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

function spawnRebellionIfNeeded(
  world: World,
  data: GameData,
  nationId: number,
  reformsByKey: Map<string, ReformDef>,
): void {
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
    const demand = chooseRebelDemand(world, data, nationId, state.id, reformsByKey);
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

/** Behavior-identical to `updateStateUnrest`, but reuses pre-bucketed pops + demand. */
function updateStateUnrestForNation(
  world: World,
  data: GameData,
  nationId: number,
  reformsByKey: Map<string, ReformDef>,
  demand: Map<string, number>,
): void {
  const nation = world.nations[nationId];
  if (!nation) return;
  const suppression = politicalSuppression(nation, data);
  const blockedDemand = Array.from(demand.entries()).reduce((sum, [reformKey, support]) => {
    const reform = reformsByKey.get(reformKey);
    if (!reform) return sum;
    const next = Math.max(0, Math.floor(nation.reforms[reformKey] ?? 0) + 1);
    const legality = computeReformLegality(world, data, nation, reform, next);
    return sum + (legality.legal ? 0 : support);
  }, 0);

  for (const state of world.states) {
    if (state.owner !== nationId) continue;
    let unmetNeed = 0;
    let popCount = 0;
    let militancyTotal = 0;
    for (const provinceId of state.provinceIds) {
      const province = world.provinces[provinceId];
      if (!province) continue;
      for (const popId of province.popIds) {
        const pop = world.pops[popId];
        if (!pop || pop.size <= 0) continue;
        unmetNeed += 1 - clamp(pop.needsMet, 0, 1);
        militancyTotal += clamp(pop.militancy, 0, 10);
        popCount += 1;
      }
    }
    const unmet = popCount > 0 ? unmetNeed / popCount : 0;
    const militancy = popCount > 0 ? militancyTotal / popCount : 0;
    const pressure = clamp((militancy - 3.5) * 0.09 + unmet * 0.35 + suppression * 0.25 + blockedDemand * 0.45, 0, 1.4);
    state.unrestRisk = clamp(state.unrestRisk * 0.72 + pressure * 0.4, 0, 2);
  }
}

export function runPoliticsMonthly(world: World, data: GameData, rng: Rng): void {
  const reformsByKey = reformsByKeyMap(data);
  const popsByNation = bucketPopsByNation(world);
  const demandByNation: Array<Map<string, number>> = world.nations.map((nation) => (
    aggregateReformDemandFromPops(popsByNation[nation.id] ?? [], nation, data)
  ));

  for (const nation of world.nations) {
    const nationPops = popsByNation[nation.id] ?? [];
    decayReformFatigue(nation);
    pickElectionParty(world, data, nation.id, rng, nationPops, reformsByKey);
    driftUpperHouse(world, nation.id);
    applySuppressionEffects(world, data, nation.id, nationPops, reformsByKey, demandByNation[nation.id] ?? new Map());
    updateNationalLiteracyAndConsciousness(world, nation.id);
    updateMilitaryDerivedForNation(world, nation.id);
  }
  // Re-bucket after suppression mutates militancy/consciousness (sizes unchanged; owners unchanged).
  // Demand must reflect post-suppression pop state for unrest — recompute from same buckets
  // (pop sizes/needsMet unchanged by suppression; reformDemandForPop uses consciousness/militancy).
  for (const nation of world.nations) {
    const nationPops = popsByNation[nation.id] ?? [];
    const demand = aggregateReformDemandFromPops(nationPops, nation, data);
    updateStateUnrestForNation(world, data, nation.id, reformsByKey, demand);
  }
  for (const nation of world.nations) spawnRebellionIfNeeded(world, data, nation.id, reformsByKey);
}
