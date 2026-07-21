/**
 * Campaign map generation modes — distinct from HUD MapMode (political/terrain/…).
 * Historical uses the baked 1820 seed; procedural remaps ownership on the same
 * province graph, either with real country identities or invented ones.
 */

import type { CampaignMapMode } from './types';

export type { CampaignMapMode };

export const DEFAULT_CAMPAIGN_MAP_MODE: CampaignMapMode = 'historical';

export const CAMPAIGN_MAP_MODES: { id: CampaignMapMode; label: string; blurb: string }[] = [
  {
    id: 'historical',
    label: 'Historical',
    blurb: 'The baked 1820 political map.',
  },
  {
    id: 'procedural_real',
    label: 'Procedural · Real countries',
    blurb: 'Same provinces, reshuffled contiguous realms using real nation names.',
  },
  {
    id: 'procedural_random',
    label: 'Procedural · Random countries',
    blurb: 'Same provinces, reshuffled contiguous realms with invented nations.',
  },
];

export function isCampaignMapMode(value: string | null | undefined): value is CampaignMapMode {
  return value === 'historical'
    || value === 'procedural_real'
    || value === 'procedural_random';
}

export function parseCampaignMapMode(value: string | null | undefined): CampaignMapMode {
  return isCampaignMapMode(value) ? value : DEFAULT_CAMPAIGN_MAP_MODE;
}

export function isProceduralMapMode(mode: CampaignMapMode): boolean {
  return mode === 'procedural_real' || mode === 'procedural_random';
}
