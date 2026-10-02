import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadScenarios } from '../src/data/generated';
const memory = vi.hoisted(() => ({ files: new Map<string, string | Uint8Array>(), fail: '' }));
vi.mock('../apps/mobile/node_modules/expo-file-system/src/index.ts', () => {
  const path = (parts: any[]) => parts.map((p) => typeof p === 'string' ? p : p.uri).join('/');
  class File {
    uri: string;
    constructor(...parts: any[]) { this.uri = path(parts); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return memory.files.has(this.uri); }
    textSync() { return memory.files.get(this.uri); }
    async bytes() { return memory.files.get(this.uri); }
    write(value: string | Uint8Array) { if (this.uri.endsWith(memory.fail) && memory.fail) throw new Error('disk full'); memory.files.set(this.uri, value); }
    delete() { memory.files.delete(this.uri); }
  }
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = path(parts); }
    create() {}
    list() { return [...memory.files.keys()].filter((p) => p.startsWith(this.uri + '/')).map((p) => new File(p)); }
  }
  return { File, Directory, Paths: { document: 'device' } };
});
import { deleteNativeSave, listNativeSaves, readNativeSave, writeNativeSave } from '../apps/mobile/game/nativeSaves';
import type { NativeSave } from '../apps/mobile/game/campaign';
const save = (id: string, kind: NativeSave['kind'] = 'manual', campaign = 'campaign-a', updatedAt = 1): NativeSave => ({
  id, kind, updatedAt, label: id, day: 0, date: '1/1/1830', nation: 'France', tag: 'FRA',
  config: { id: campaign, name: campaign, seed: 42, mapMode: 'historical', scenarioId: '1830-01-01', playerNation: 0, autosaveMinutes: 5 },
});
beforeEach(() => { memory.files.clear(); memory.fail = ''; });
describe('native save library', () => {
  beforeAll(() => preloadScenarios());
  it('keeps two recovery points per campaign without deleting manual or other campaign saves', async () => {
    for (const s of [save('manual'), save('other', 'auto', 'campaign-b'), save('a', 'auto', undefined, 1), save('b', 'auto', undefined, 2), save('c', 'auto', undefined, 3)]) writeNativeSave(s, new Uint8Array([1, 2, 3]));
    expect(listNativeSaves().map((s) => s.id).sort()).toEqual(['b', 'c', 'manual', 'other']);
    deleteNativeSave('b');
    expect(await readNativeSave('manual')).toEqual(new Uint8Array([1, 2, 3]));
    expect(listNativeSaves().map((s) => s.id).sort()).toEqual(['c', 'manual', 'other']);
  });
  it('never prunes the checkpoint just written if the device clock moves backwards', () => {
    for (const s of [save('old-one', 'auto', undefined, 200), save('old-two', 'auto', undefined, 300), save('new', 'auto', undefined, 100)]) writeNativeSave(s, new Uint8Array([1]));
    expect(listNativeSaves().map((s) => s.id).sort()).toEqual(['new', 'old-two']);
  });
  it('preserves old checkpoints when publishing a new checkpoint fails', async () => {
    writeNativeSave(save('old'), new Uint8Array([9]));
    memory.fail = '.json';
    expect(() => writeNativeSave(save('new'), new Uint8Array([8]))).toThrow('disk full');
    expect(listNativeSaves().map((s) => s.id)).toEqual(['old']);
    expect([...memory.files.keys()].some((p) => p.includes('new'))).toBe(false);
    expect(await readNativeSave('old')).toEqual(new Uint8Array([9]));
  });
  it('lists registered scenarios while ignoring unknown scenarios', () => {
    const modern = save('modern');
    modern.config.scenarioId = '1936-01-01';
    writeNativeSave(modern, new Uint8Array([9]));
    const unknown = save('unknown');
    unknown.config.scenarioId = 'unknown-era';
    writeNativeSave(unknown, new Uint8Array([9]));
    expect(listNativeSaves().map((s) => s.id)).toEqual(['modern']);
  });
  it('rejects traversal and accidental overwrite', () => {
    expect(() => deleteNativeSave('../graphics')).toThrow();
    writeNativeSave(save('old'), new Uint8Array([9]));
    expect(() => writeNativeSave(save('old'), new Uint8Array([8]))).toThrow('already exists');
  });
  it('ignores incomplete or invalid metadata without touching valid checkpoints', () => {
    writeNativeSave(save('valid'), new Uint8Array([9]));
    memory.files.set('device/campaign-saves-v1/broken.json', '{');
    memory.files.set('device/campaign-saves-v1/incomplete.json', JSON.stringify(save('incomplete')));
    expect(listNativeSaves().map((s) => s.id)).toEqual(['valid']);
  });
});
