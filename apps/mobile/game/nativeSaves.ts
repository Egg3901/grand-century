import { Directory, File, Paths } from 'expo-file-system';
import { validSeed, type NativeSave } from './campaign';
import { DEFAULT_SCENARIO_ID } from '../../../src/data/generated';
import { isCampaignMapMode } from '../../../src/shared/campaignMap';

const directory = () => {
  const dir = new Directory(Paths.document, 'campaign-saves-v1');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
};
function assertId(id: string) {
  if (!/^[a-z0-9-]{1,100}$/.test(id)) throw new Error('Invalid save identifier.');
}
export function newSaveId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
export function listNativeSaves(): NativeSave[] {
  return directory().list().flatMap((entry) => {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) return [];
    try {
      const save = JSON.parse(entry.textSync()) as NativeSave;
      assertId(save.id);
      const c = save.config;
      if (entry.name !== save.id + '.json' || !c || typeof c.id !== 'string' || typeof c.name !== 'string'
        || c.scenarioId !== DEFAULT_SCENARIO_ID || !isCampaignMapMode(c.mapMode) || validSeed(String(c.seed)) === null
        || !Number.isInteger(c.playerNation) || c.playerNation < 0 || ![1, 5, 10].includes(c.autosaveMinutes)
        || typeof save.label !== 'string' || typeof save.nation !== 'string' || typeof save.date !== 'string'
        || !['auto', 'manual'].includes(save.kind) || !Number.isFinite(save.updatedAt) || !Number.isFinite(save.day)) return [];
      if (!new File(directory(), save.id + '.gz').exists) return [];
      return [save];
    } catch { return []; }
  }).sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
}
export async function readNativeSave(id: string): Promise<Uint8Array> {
  assertId(id);
  const file = new File(directory(), id + '.gz');
  if (!file.exists) throw new Error('This save is no longer on this device.');
  return file.bytes();
}
export function writeNativeSave(save: NativeSave, payload: Uint8Array): void {
  assertId(save.id);
  const dir = directory();
  const file = new File(dir, save.id + '.gz');
  const meta = new File(dir, save.id + '.json');
  // Every checkpoint is immutable. Publish its metadata only after the payload
  // is complete; interruption cannot damage any previous checkpoint.
  if (file.exists || meta.exists) throw new Error('Save already exists. Try again.');
  try {
    file.write(payload);
    meta.write(JSON.stringify(save));
  } catch (error) {
    if (meta.exists) meta.delete();
    if (file.exists) file.delete();
    throw error;
  }
  if (save.kind === 'auto') {
    // Retain two recovery points per campaign; never prune manual saves.
    for (const old of listNativeSaves().filter((s) => s.kind === 'auto' && s.config.id === save.config.id).slice(2)) {
      try { deleteNativeSave(old.id); } catch { /* A successful new checkpoint remains usable. */ }
    }
  }
}
export function deleteNativeSave(id: string): void {
  assertId(id);
  const dir = directory();
  // Remove the payload first: a failed deletion leaves the visible save intact.
  for (const suffix of ['.gz', '.json']) {
    const file = new File(dir, id + suffix);
    if (file.exists) file.delete();
  }
}
