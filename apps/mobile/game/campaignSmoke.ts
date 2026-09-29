// Simulator release gate: exercise the real native worker and document storage.
import { NativeSimTransport } from './NativeSimTransport';
import { newSaveId, listNativeSaves, writeNativeSave, readNativeSave, deleteNativeSave } from './nativeSaves';
import { saveSummary, type CampaignConfig } from './campaign';

export async function verifyNativeCampaignStorage() {
  const config: CampaignConfig = { id: newSaveId(), name: 'Native storage smoke', seed: 24681, mapMode: 'historical', scenarioId: '1830-01-01', playerNation: 0, autosaveMinutes: 5 };
  const first = new NativeSimTransport();
  const restored = new NativeSimTransport();
  const id = newSaveId();
  const secondId = newSaveId();
  try {
    first.send({ t: 'command', cmd: { t: 'newGame', ...config } });
    first.send({ t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.7 } });
    const exported = await first.exportSave();
    if (exported.snapshot.seed !== config.seed) throw new Error('Native setup seed lost.');
    writeNativeSave(saveSummary(config, exported.snapshot, 'manual', 'First checkpoint', id), exported.payload);
    writeNativeSave(saveSummary(config, exported.snapshot, 'manual', 'Second checkpoint', secondId), exported.payload);
    await restored.importSave(await readNativeSave(id));
    const loaded = await restored.exportSave();
    if (loaded.snapshot.nations[loaded.snapshot.playerNation].taxRatePoor !== 0.7 || loaded.snapshot.seed !== config.seed) throw new Error('Native save roundtrip lost campaign state.');
    deleteNativeSave(id);
    const saves = listNativeSaves();
    if (saves.some((s) => s.id === id) || !saves.some((s) => s.id === secondId)) throw new Error('Native deletion affected the wrong checkpoint.');
    return { ok: true, bytes: exported.payload.length, seed: loaded.snapshot.seed, restoredTax: 0.7, separateSaves: true };
  } finally {
    first.dispose(); restored.dispose();
    deleteNativeSave(id); deleteNativeSave(secondId);
  }
}
