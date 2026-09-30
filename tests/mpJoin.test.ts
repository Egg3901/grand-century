import { describe, expect, it } from 'vitest';
import { buildLobbyInviteUrl, buildMpUrl, parseLobbyHash, parseMpHash, randomSessionId } from '../src/net/mpJoin';
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

  it('parses and builds lobby invite links', () => {
    expect(parseLobbyHash('#/lobby?session=xyz789')).toEqual({ sessionId: 'xyz789' });
    expect(parseLobbyHash('#/mp?session=xyz789&nation=ENG')).toBeNull();
    const url = buildLobbyInviteUrl('xyz789', '/games/grand-century/');
    expect(url).toContain('#/lobby?');
    expect(url).toContain('session=xyz789');
  });
});

describe('resolveSocketUrl', () => {
  it('routes static hosted UIs directly to the session server, with explicit overrides retained', () => {
    for (const host of ['lakesidegames.net', 'grand-century.pages.dev', 'preview.grand-century.pages.dev']) {
      expect(resolveSocketUrl({ DEV: false, BASE_URL: '/games/grand-century/' }, { protocol: 'https:', host }))
        .toBe('wss://grand-century-server-production.up.railway.app/ws');
      expect(resolveSocketUrl({ DEV: false, VITE_MP_WS_URL: 'wss://custom.example/ws' }, { protocol: 'https:', host }))
        .toBe('wss://custom.example/ws');
    }
  });
  it('uses localhost port in DEV', () => {
    expect(resolveSocketUrl({ DEV: true, VITE_MP_PORT: '3412' }, { protocol: 'http:', host: 'example.com' }))
      .toBe('ws://127.0.0.1:3412');
  });

  it('uses BASE_URL ws path for a self-hosted deployment', () => {
    expect(resolveSocketUrl(
      { DEV: false, BASE_URL: '/games/grand-century/' },
      { protocol: 'https:', host: 'game.example' },
    )).toBe('wss://game.example/games/grand-century/ws');
  });
});
