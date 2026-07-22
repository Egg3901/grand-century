import { describe, expect, it } from 'vitest';
import { resolvePanelChromeNation } from '../src/ui/panels/panelChromeNation';
import type { NationSummary, ProvinceDetail, ProvinceSummary, WorldSnapshot } from '../src/shared/types';

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
    ...partial,
  } as NationSummary;
}

function province(partial: Pick<ProvinceSummary, 'id' | 'owner'> & Partial<ProvinceSummary>): ProvinceSummary {
  return {
    controller: partial.owner,
    stateId: 0,
    population: 0,
    militancy: 0,
    unrestRisk: 0,
    needsMet: 1,
    growth: 0,
    economyOutput: 0,
    rgoGood: 0,
    fortLevel: 0,
    occupation: 0,
    ...partial,
  };
}

function snapshot(nations: NationSummary[], provinces: ProvinceSummary[], playerNation: number): WorldSnapshot {
  return {
    day: 0,
    date: { year: 1836, month: 1, day: 1 },
    speed: 0,
    playerNation,
    nations,
    provinces,
  } as WorldSnapshot;
}

describe('resolvePanelChromeNation', () => {
  const eng = nation({ id: 0, tag: 'ENG', name: 'United Kingdom', color: [1, 2, 3] });
  const tur = nation({ id: 1, tag: 'TUR', name: 'Ottoman Empire', color: [4, 5, 6] });
  /** Province id doubles as sparse array index on WorldSnapshot.provinces. */
  const saharaId = 0;
  const snap = snapshot(
    [eng, tur],
    [province({ id: saharaId, owner: tur.id })],
    eng.id,
  );

  it('shows the foreign owner flag for a tapped province, not the player', () => {
    const detail: ProvinceDetail = {
      id: saharaId,
      name: 'Sahara',
      owner: tur.id,
      controller: tur.id,
      terrain: 'desert',
      pops: [],
      rgo: { recipe: 'rgo_cattle', level: 1, employed: 0, weeklyProfit: 0 },
      fortLevel: 0,
      navalBaseLevel: 0,
    };

    const chrome = resolvePanelChromeNation('province', snap, saharaId, detail);
    expect(chrome?.tag).toBe('TUR');
    expect(chrome?.tag).not.toBe('ENG');
  });

  it('falls back to snapshot province owner before detail arrives', () => {
    const chrome = resolvePanelChromeNation('province', snap, saharaId, null);
    expect(chrome?.tag).toBe('TUR');
  });

  it('keeps the player flag for player-scoped panels like budget', () => {
    const chrome = resolvePanelChromeNation('budget', snap, saharaId, null);
    expect(chrome?.tag).toBe('ENG');
  });

  it('falls back to the player when no province is selected', () => {
    const chrome = resolvePanelChromeNation('province', snap, null, null);
    expect(chrome?.tag).toBe('ENG');
  });
});
