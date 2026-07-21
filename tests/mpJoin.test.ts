import { describe, expect, it } from 'vitest';
import { buildMpUrl, parseMpHash, randomSessionId } from '../src/net/mpJoin';
import { resolveSocketUrl } from '../src/net/socketTransport';

describe('mp join hash', () => {
  it('parses #/mp?session=&nation=&seed=', () => {
    const parsed = parseMpHash('#/mp?session=abc123&nation=eng&seed=42');
    expect(parsed).toEqual({ sessionId: 'abc123', nationTag: 'ENG', seed: 42 });
  });

  it('returns null for single-player #/new hashes', () => {
    expect(parseMpHash('#/new?seed=1836&nation=ENG')).toBeNull();
  });

  it('buildMpUrl round-trips', () => {
    const id = randomSessionId();
    expect(id).toHaveLength(8);
    const url = buildMpUrl({ sessionId: id, nationTag: 'FRA', seed: 99 }, '/games/grand-century/');
    expect(url).toContain('#/mp?');
    expect(url).toContain(`session=${id}`);
    expect(url).toContain('nation=FRA');
  });
});

describe('resolveSocketUrl', () => {
  it('uses localhost port in DEV', () => {
    expect(resolveSocketUrl({ DEV: true, VITE_MP_PORT: '3412' }, { protocol: 'http:', host: 'example.com' }))
      .toBe('ws://127.0.0.1:3412');
  });

  it('uses BASE_URL ws path in prod', () => {
    expect(resolveSocketUrl(
      { DEV: false, BASE_URL: '/games/grand-century/' },
      { protocol: 'https:', host: 'lakesidegames.net' },
    )).toBe('wss://lakesidegames.net/games/grand-century/ws');
  });
});
