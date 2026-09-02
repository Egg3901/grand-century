import { describe, expect, it } from 'vitest';
import { buildShareUrl, parseStartHash } from '../src/ui/permalink';

describe('shareable permalinks', () => {
  it('parses #/new?seed=&nation= hashes', () => {
    expect(parseStartHash('#/new?seed=1836&nation=ENG')).toEqual({
      seed: 1836,
      nationTag: 'ENG',
      mode: undefined,
      scenarioId: undefined,
    });
    expect(parseStartHash('#/new?seed=42&nation=fra&mode=procedural_real')).toEqual({
      seed: 42,
      nationTag: 'FRA',
      mode: 'procedural_real',
      scenarioId: undefined,
    });
    expect(parseStartHash('#/new?seed=42&nation=fra&mode=sandbox')).toEqual({
      seed: 42,
      nationTag: 'FRA',
      mode: 'historical',
      scenarioId: undefined,
    });
    expect(parseStartHash('#/new?seed=1700&nation=FRA&scenario=1700-01-01')).toMatchObject({
      scenarioId: '1700-01-01',
    });
  });

  it('rejects non-start hashes', () => {
    expect(parseStartHash('')).toBeNull();
    expect(parseStartHash('#/')).toBeNull();
    expect(parseStartHash('#/load?slot=1')).toBeNull();
    expect(parseStartHash('#/new?seed=1836')).toBeNull();
  });

  it('builds BASE_URL-safe share URLs', () => {
    const url = buildShareUrl(
      { seed: 1836, nationTag: 'ENG', mode: 'procedural_random', scenarioId: '1936-01-01' },
      '/games/grand-century/',
    );
    expect(url).toContain('/games/grand-century/#/new?');
    expect(url).toContain('seed=1836');
    expect(url).toContain('nation=ENG');
    expect(url).toContain('mode=procedural_random');
    expect(url).toContain('scenario=1936-01-01');
  });
});
