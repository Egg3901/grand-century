/**
 * Multiplayer join permalinks — `#/mp?session=&nation=&seed=`
 * Hash-routed so they work under any BASE_URL.
 */

export interface MpJoinParams {
  sessionId: string;
  nationTag: string;
  seed: number;
}

const DEFAULT_SEED = 1836;

function parseHashQuery(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) return new URLSearchParams();
  return new URLSearchParams(raw.slice(queryIndex + 1));
}

function parseRoute(hash: string): string {
  const raw = (hash.startsWith('#') ? hash.slice(1) : hash).replace(/^\//, '');
  const path = raw.split('?')[0] ?? '';
  return path.replace(/\/+$/, '') || '';
}

/** Read `#/mp?session=&nation=&seed=` from the location hash. */
export function parseMpHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): MpJoinParams | null {
  if (!hash || hash === '#' || hash === '#/') return null;
  const route = parseRoute(hash);
  if (route !== 'mp') return null;
  const params = parseHashQuery(hash);
  const sessionId = (params.get('session') ?? params.get('id') ?? '').trim();
  const nationTag = (params.get('nation') ?? params.get('tag') ?? '').trim().toUpperCase();
  if (!sessionId || !nationTag) return null;
  const seedRaw = Number(params.get('seed') ?? DEFAULT_SEED);
  const seed = Number.isFinite(seedRaw) ? Math.max(1, Math.floor(seedRaw)) : DEFAULT_SEED;
  return { sessionId, nationTag, seed };
}

export function buildMpUrl(
  params: MpJoinParams,
  baseUrl: string = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/',
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const query = new URLSearchParams();
  query.set('session', params.sessionId);
  query.set('nation', params.nationTag.toUpperCase());
  query.set('seed', String(params.seed));
  return `${origin}${base}#/mp?${query.toString()}`;
}

export function randomSessionId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}
