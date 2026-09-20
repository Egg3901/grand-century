import { describe, expect, it } from 'vitest';
import type { NationSummary, WorldSnapshot } from '../src/shared/types';
import { deriveNationalAgenda, type AgendaSnapshot } from '../src/ui/strategy/agenda';

function nation(overrides: Partial<NationSummary> = {}): NationSummary {
  return {
    id: 0, tag: 'BEL', name: 'Belgium', color: [1, 2, 3], capital: 0,
    government: 'constitutional_monarchy', rulingParty: 'Liberal Party', rulingIdeology: 'liberal',
    treasury: 8_000, prestige: 20, infamy: 0, gpRank: 0, industryScore: 8,
    militaryScore: 5, powerScore: 33, spheredBy: -1, sphereMembers: [], atWar: false,
    numProvinces: 4, militancy: 1, unrest: 0.1, taxRatePoor: 0.3, taxRateMiddle: 0.3,
    taxRateRich: 0.3, tariffRate: 0, tariffMin: -0.25, tariffMax: 0.5,
    isBankrupt: false, bankruptcyMonths: 0, constructionBlocked: false,
    mobilizationCapacity: 8, standingRegimentCapacity: 8, ...overrides,
  };
}

function snapshot(overrides: Partial<WorldSnapshot> = {}): AgendaSnapshot {
  return {
    day: 0, date: { year: 1820, month: 1, day: 1 }, playerNation: 0, nations: [nation()],
    wars: [], relations: [], armies: [], rebellions: [],
    playerBudget: {
      taxIncome: 20, tariffIncome: 0, productionIncome: 5, armyUpkeep: 2,
      subsidySpend: 0, constructionSpend: 0, adminSpend: 2, reformUpkeep: 0, net: 21,
      bankrupt: false, trace: { taxIncome: [], tariffIncome: [], productionIncome: [],
        armyUpkeep: [], subsidySpend: [], constructionSpend: [], adminSpend: [], reformUpkeep: [], net: [] },
    },
    playerPopulation: [{ type: 'farmer', size: 1_000_000, avgNeedsMet: 0.75 } as WorldSnapshot['playerPopulation'][number]],
    playerProduction: [], playerStates: [{ id: 0, name: 'Brabant', factoryCount: 1 }],
    playerTech: { researchPoints: 4, monthlyResearch: 2, current: 'mechanical_production',
      progress: 1, currentCost: 20, techs: [], inventions: [], statuses: [], inventionStatuses: [] },
    playerDecisions: [], playerFormables: [], playerPowerScore: 33, ninthPowerScore: 50,
    infamyLimit: 25, chronicleWarsFought: 0, playerMovements: [], ...overrides,
  } as AgendaSnapshot;
}

describe('deriveNationalAgenda', () => {
  it('turns a weak opening position into concrete priorities and an arc', () => {
    const agenda = deriveNationalAgenda(snapshot());
    expect(agenda.direction).toBe('Win recognition as a Great Power');
    expect(agenda.priorities.map((priority) => priority.id)).toEqual(['industry', 'great-power']);
    expect(agenda.chapters).toHaveLength(3);
    expect(agenda.chapters[0]?.completed).toBe(4);
    expect(agenda.measures.find((measure) => measure.label === 'People')?.value).toBe('1.00m');
  });

  it('puts collapse risks ahead of long-term ambitions', () => {
    const base = snapshot();
    const troubled = snapshot({
      nations: [nation({ treasury: 300, unrest: 0.6, isBankrupt: true, bankruptcyMonths: 2 })],
      playerTech: { ...base.playerTech!, current: null },
      rebellions: [{ id: 4, targetNation: 0, status: 'active' } as WorldSnapshot['rebellions'][number]],
    });
    const agenda = deriveNationalAgenda(troubled);
    expect(agenda.priorities.slice(0, 3).map((priority) => priority.id)).toEqual(['bankrupt', 'rebellion', 'research']);
    expect(agenda.headline).toBe('Restore the national credit');
  });

  it('makes a national unification the campaign direction', () => {
    const agenda = deriveNationalAgenda(snapshot({ playerFormables: [{
      key: 'germany', name: 'Germany', controlledCoreStates: 5, requiredCoreStates: 8,
      ready: false, reason: 'Control three more core states',
    } as WorldSnapshot['playerFormables'][number]] }));
    expect(agenda.direction).toBe('Proclaim Germany');
    expect(agenda.directionDetail).toContain('5/8');
    expect(agenda.priorities.some((priority) => priority.id === 'formable')).toBe(true);
    expect(agenda.chapters[2]?.goals[0]?.label).toContain('Germany');
  });

  it('surfaces wartime leverage as the immediate action', () => {
    const agenda = deriveNationalAgenda(snapshot({
      wars: [{ id: 1, attackers: [0], defenders: [1], score: 18 } as WorldSnapshot['wars'][number]],
    }));
    const war = agenda.priorities.find((priority) => priority.id === 'war');
    expect(war?.title).toBe('Turn leverage into peace');
    expect(war?.destination).toBe('military');
  });
});
