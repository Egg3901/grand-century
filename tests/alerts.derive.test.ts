import { describe, expect, it } from 'vitest';
import { deriveAlerts, type UiAlert } from '../src/ui/alerts';
import type {
  Army, BattleReport, Crisis, MarketGood, MovementView, NationSummary,
  PendingEvent, Rebellion, War, WorldSnapshot,
} from '../src/shared/types';

function nation(partial: Pick<NationSummary, 'id' | 'tag' | 'name'> & Partial<NationSummary>): NationSummary {
  return {
    color: [0, 0, 0],
    capital: 0,
    government: 'absolute_monarchy',
    rulingParty: 'conservative',
    rulingIdeology: 'conservative',
    treasury: 0,
    prestige: 0,
    infamy: 0,
    gpRank: 0,
    industryScore: 0,
    militaryScore: 0,
    powerScore: 0,
    spheredBy: -1,
    sphereMembers: [],
    isBankrupt: false,
    ...partial,
  } as NationSummary;
}

function baseSnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const eng = nation({ id: 0, tag: 'ENG', name: 'United Kingdom' });
  const fra = nation({ id: 1, tag: 'FRA', name: 'France' });
  return {
    day: 100,
    date: { year: 1836, month: 4, day: 10 },
    speed: 1,
    playerNation: 0,
    nations: [eng, fra],
    provinces: [],
    market: [],
    wars: [],
    relations: [],
    greatPowers: [],
    playerCbs: [],
    playerPendingCbs: [],
    playerDiplomaticPoints: 0,
    fabricateCbCostByGoal: {} as WorldSnapshot['fabricateCbCostByGoal'],
    warGoalInfamyUse: {} as WorldSnapshot['warGoalInfamyUse'],
    playerInfluencePool: 0,
    playerInfluenceTargets: [],
    playerAlliancePreviews: [],
    infamyLimit: 25,
    coalitionAgainstPlayer: [],
    playerStockpile: {},
    playerStockpileOrders: {},
    ninthPowerScore: 0,
    playerPowerScore: 0,
    rivalryDpCost: 12,
    rivalryCap: 4,
    playerRivalryCount: 0,
    armies: [],
    fleets: [],
    rebellions: [],
    playerProduction: [],
    playerPopulation: [],
    playerReformAgitation: [],
    playerStates: [],
    playerBudget: {
      taxIncome: 0, tariffIncome: 0, productionIncome: 0, armyUpkeep: 0,
      subsidySpend: 0, constructionSpend: 0, adminSpend: 0, reformUpkeep: 0,
      net: 0, bankrupt: false,
      trace: {
        taxIncome: [], tariffIncome: [], productionIncome: [], armyUpkeep: [],
        subsidySpend: [], constructionSpend: [], adminSpend: [], reformUpkeep: [], net: [],
      },
    },
    ...overrides,
  } as WorldSnapshot;
}

function kinds(alerts: UiAlert[]): string[] {
  return alerts.map((alert) => alert.kind);
}

describe('deriveAlerts', () => {
  it('returns the same array identity when nothing changed', () => {
    const prev = baseSnapshot();
    const next = baseSnapshot({ day: 101 });
    const existing: UiAlert[] = [];
    const first = deriveAlerts(prev, next, existing);
    expect(first).toBe(existing);
  });

  it('derives war and peace alerts for the player', () => {
    const war: War = {
      id: 7,
      attackers: [0],
      defenders: [1],
      startDay: 100,
      score: 0,
      attackerWarGoal: { type: 'humiliate', target: 1, state: -1 },
      defenderWarGoal: { type: 'humiliate', target: 0, state: -1 },
      attackerOccupied: [],
      defenderOccupied: [],
      participantScores: {},
    } as War;
    const prev = baseSnapshot({ wars: [] });
    const atWar = baseSnapshot({ wars: [war], day: 101 });
    const warAlerts = deriveAlerts(prev, atWar, []);
    expect(kinds(warAlerts)).toEqual(['war']);
    expect(warAlerts[0]!.message).toContain('declares war');
    expect(warAlerts[0]!.dedupeKey).toBe('war-start-7');

    const peaced = baseSnapshot({ wars: [], day: 200 });
    const peaceAlerts = deriveAlerts(atWar, peaced, warAlerts);
    expect(peaceAlerts.some((alert) => alert.kind === 'peace' && alert.message.includes('Peace signed'))).toBe(true);
  });

  it('derives bankruptcy alerts', () => {
    const prev = baseSnapshot({
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom', isBankrupt: false }),
        nation({ id: 1, tag: 'FRA', name: 'France', isBankrupt: false }),
      ],
    });
    const next = baseSnapshot({
      day: 101,
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom', isBankrupt: true }),
        nation({ id: 1, tag: 'FRA', name: 'France', isBankrupt: false }),
      ],
    });
    const alerts = deriveAlerts(prev, next, []);
    expect(kinds(alerts)).toEqual(['bankruptcy']);
    expect(alerts[0]!.panel).toBe('budget');
    expect(alerts[0]!.message).toContain('United Kingdom');
  });

  it('derives rebellion risen and demand alerts', () => {
    const rebelArmy = { id: 1, owner: 0, location: 0, rebel: true } as Army;
    const prev = baseSnapshot({ armies: [] });
    const risen = baseSnapshot({ day: 101, armies: [rebelArmy] });
    const risenAlerts = deriveAlerts(prev, risen, []);
    expect(risenAlerts.some((alert) => alert.message === 'Rebellion forces have risen.')).toBe(true);

    const rebellion = {
      id: 3,
      targetNation: 0,
      status: 'active',
      demand: { description: 'lower taxes' },
    } as Rebellion;
    const withDemand = baseSnapshot({ day: 102, armies: [rebelArmy], rebellions: [rebellion] });
    const demandAlerts = deriveAlerts(risen, withDemand, risenAlerts);
    expect(demandAlerts.some((alert) => alert.message.includes('demanding lower taxes'))).toBe(true);
  });

  it('derives formation alerts including GER/ITA special copy', () => {
    const prev = baseSnapshot({
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom' }),
        nation({ id: 2, tag: 'PRU', name: 'Prussia' }),
      ],
    });
    const next = baseSnapshot({
      day: 101,
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom' }),
        nation({ id: 2, tag: 'GER', name: 'Germany' }),
      ],
    });
    const alerts = deriveAlerts(prev, next, []);
    expect(kinds(alerts)).toEqual(['formation']);
    expect(alerts[0]!.message).toBe('The German Empire is proclaimed!');
  });

  it('derives unrest when player max unrestRisk crosses 0.55 on a new day', () => {
    const prev = baseSnapshot({
      day: 100,
      provinces: [{ id: 0, owner: 0, unrestRisk: 0.4 } as WorldSnapshot['provinces'][number]],
    });
    const next = baseSnapshot({
      day: 101,
      provinces: [{ id: 0, owner: 0, unrestRisk: 0.6 } as WorldSnapshot['provinces'][number]],
    });
    const alerts = deriveAlerts(prev, next, []);
    expect(kinds(alerts)).toEqual(['unrest']);
    expect(alerts[0]!.message).toContain('0.60');
  });

  it('derives event alerts for new pending player events', () => {
    const event = {
      instanceId: 'evt-1',
      title: 'Corn Laws Debate',
      description: '...',
      choices: [],
    } as PendingEvent;
    const prev = baseSnapshot({ pendingPlayerEvents: [] });
    const next = baseSnapshot({ day: 101, pendingPlayerEvents: [event] });
    const alerts = deriveAlerts(prev, next, []);
    expect(kinds(alerts)).toEqual(['event']);
    expect(alerts[0]!.message).toBe('Corn Laws Debate');
  });

  it('derives market shortage alerts for life goods', () => {
    const good = {
      good: 0,
      unmet: 50,
      supply: 10,
      priceTrace: { requestedDemand: 100 },
    } as MarketGood;
    const prev = baseSnapshot({ market: [] });
    const next = baseSnapshot({ day: 101, market: [good] });
    const alerts = deriveAlerts(prev, next, [], new Map([[0, 'Grain']]));
    expect(kinds(alerts)).toEqual(['market']);
    expect(alerts[0]!.message).toContain('Grain shortage');
  });

  it('derives crisis spawn and resolve alerts', () => {
    const crisis = { id: 9, subject: 1 } as Crisis;
    const prev = baseSnapshot({ activeCrisis: null });
    const active = baseSnapshot({ day: 101, activeCrisis: crisis });
    const spawn = deriveAlerts(prev, active, []);
    expect(spawn.some((alert) => alert.kind === 'crisis' && alert.message.includes('Crisis erupts'))).toBe(true);

    const resolved = baseSnapshot({
      day: 102,
      activeCrisis: null,
      congressHistory: [{ day: 102, outcome: 'settled' } as WorldSnapshot['congressHistory'] extends (infer T)[] | undefined ? T : never],
    });
    const resolve = deriveAlerts(active, resolved, spawn);
    expect(resolve.some((alert) => alert.message === 'Congress settled the crisis.')).toBe(true);
  });

  it('derives culture boiling alerts', () => {
    const movement = {
      id: 4,
      cultureName: 'Irish',
      boiling: true,
    } as MovementView;
    const prev = baseSnapshot({ playerMovements: [{ ...movement, boiling: false }] });
    const next = baseSnapshot({ day: 101, playerMovements: [movement] });
    const alerts = deriveAlerts(prev, next, []);
    expect(kinds(alerts)).toEqual(['culture']);
    expect(alerts[0]!.message).toContain('Irish');
  });

  it('derives player election and batches foreign elections', () => {
    const prev = baseSnapshot({
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom', rulingParty: 'conservative' }),
        nation({ id: 1, tag: 'FRA', name: 'France', rulingParty: 'conservative' }),
      ],
    });
    const next = baseSnapshot({
      day: 101,
      nations: [
        nation({ id: 0, tag: 'ENG', name: 'United Kingdom', rulingParty: 'liberal' }),
        nation({ id: 1, tag: 'FRA', name: 'France', rulingParty: 'liberal' }),
      ],
    });
    const alerts = deriveAlerts(prev, next, []);
    expect(alerts.some((alert) => alert.message === 'United Kingdom elected liberal.')).toBe(true);
    expect(alerts.some((alert) => alert.message === '1 election this month')).toBe(true);
  });

  it('caps the feed at 18 and respects war dedupe cooldown', () => {
    const war: War = {
      id: 1,
      attackers: [0],
      defenders: [1],
      startDay: 100,
      score: 0,
    } as War;
    const prev = baseSnapshot({ wars: [] });
    const next = baseSnapshot({ wars: [war], day: 101 });
    const seeded: UiAlert[] = Array.from({ length: 18 }, (_, i) => ({
      id: `seed-${i}`,
      kind: 'unrest',
      day: i,
      message: `seed ${i}`,
      panel: 'politics',
    }));
    const alerts = deriveAlerts(prev, next, seeded);
    expect(alerts.length).toBe(18);
    expect(alerts[alerts.length - 1]!.kind).toBe('war');

    // Same war id within cooldown must not re-fire.
    const again = deriveAlerts(next, baseSnapshot({ wars: [war], day: 102 }), alerts);
    expect(again.filter((alert) => alert.dedupeKey === 'war-start-1')).toHaveLength(1);
  });

  it('derives battle victory/defeat war alerts', () => {
    const battle = {
      day: 101,
      provinceId: 3,
      provinceName: 'Flanders',
      warId: 1,
      outcome: 'attacker_victory',
      attackerNation: 0,
      defenderNation: 1,
      attackerLosses: 100,
      defenderLosses: 400,
      factors: { organization: 2, roll: 0.1 },
    } as BattleReport;
    const prev = baseSnapshot({ recentBattles: [] });
    const next = baseSnapshot({ day: 101, recentBattles: [battle] });
    const alerts = deriveAlerts(prev, next, []);
    expect(alerts[0]!.kind).toBe('war');
    expect(alerts[0]!.message).toContain('Victory at Flanders');
  });
});
