/**
 * Shareable start permalinks — hash-routed so they work under any BASE_URL
 * (e.g. /games/grand-century/#/new?seed=1820&nation=ENG).
 */

import { parseCampaignMapMode } from '../shared/campaignMap';

export interface GameStartParams {
  seed: number;
  nationTag: string;
  mode?: string;
}

const DEFAULT_SEED = 1820;

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

/** Read `#/new?seed=&nation=&mode=` from the current location hash. */
export function parseStartHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): GameStartParams | null {
  if (!hash || hash === '#' || hash === '#/') return null;
  const route = parseRoute(hash);
  if (route !== 'new') return null;
  const params = parseHashQuery(hash);
  const seedRaw = Number(params.get('seed') ?? DEFAULT_SEED);
  const seed = Number.isFinite(seedRaw) ? Math.max(1, Math.floor(seedRaw)) : DEFAULT_SEED;
  const nationTag = (params.get('nation') ?? params.get('tag') ?? '').trim().toUpperCase();
  if (!nationTag) return null;
  const modeRaw = params.get('mode')?.trim() || undefined;
  const mode = modeRaw ? parseCampaignMapMode(modeRaw) : undefined;
  return { seed, nationTag, mode };
}

/** Build a path-absolute share URL for the current origin + BASE_URL + hash start. */
export function buildShareUrl(params: GameStartParams, baseUrl: string = import.meta.env.BASE_URL): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const query = new URLSearchParams();
  query.set('seed', String(params.seed));
  query.set('nation', params.nationTag.toUpperCase());
  if (params.mode) query.set('mode', parseCampaignMapMode(params.mode));
  return `${origin}${base}#/new?${query.toString()}`;
}

export async function copyShareLink(params: GameStartParams): Promise<boolean> {
  const url = buildShareUrl(params);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const input = document.createElement('input');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    return ok;
  } catch {
    return false;
  }
}
