import { DEFAULT_SCENARIO_ID, loadScenario, type SeedNation } from '../../../src/data/generated';
import { resolveWorldSeed } from '../../../src/sim/proceduralWorld';
import type { CampaignMapMode, WorldSnapshot } from '../../../src/shared/types';

export interface CampaignConfig {
  id: string;
  name: string;
  seed: number;
  mapMode: CampaignMapMode;
  scenarioId: string;
  playerNation: number;
  autosaveMinutes: number;
}
export interface NativeSave {
  id: string;
  config: CampaignConfig;
  label: string;
  kind: 'manual' | 'auto';
  updatedAt: number;
  day: number;
  date: string;
  nation: string;
  tag: string;
}
export function campaignRoster(seed: number, mode: CampaignMapMode) {
  return resolveWorldSeed(loadScenario(DEFAULT_SCENARIO_ID).worldSeed, seed, mode);
}
export function validSeed(raw: string): number | null {
  const seed = Number(raw);
  return Number.isSafeInteger(seed) && seed >= 1 && seed <= 2147483647 ? seed : null;
}
export function saveSummary(config: CampaignConfig, snapshot: WorldSnapshot, kind: NativeSave['kind'], label: string, id: string): NativeSave {
  const nation = snapshot.nations[snapshot.playerNation];
  return { id, config, kind, label: label.trim().slice(0, 80) || config.name, updatedAt: Date.now(), day: snapshot.day,
    date: `${snapshot.date.day}/${snapshot.date.month}/${snapshot.date.year}`, nation: nation.name, tag: nation.tag };
}
export function campaignNation(config: CampaignConfig): SeedNation {
  const nation = campaignRoster(config.seed, config.mapMode).nations[config.playerNation];
  if (!nation) throw new Error('This campaign has an unknown player nation.');
  return nation;
}
