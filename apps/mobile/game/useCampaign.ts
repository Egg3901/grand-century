import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { WorldSnapshot } from '../../../src/shared/types';
import { NativeSimTransport } from './NativeSimTransport';
import { type CampaignConfig, type NativeSave, saveSummary, campaignNation } from './campaign';
import { newSaveId, readNativeSave, writeNativeSave } from './nativeSaves';

export type Session = { config: CampaignConfig; transport: NativeSimTransport; snapshot: WorldSnapshot };
export function useCampaign() {
  const current = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [notice, setNotice] = useState('');
  const checkpoint = async (target: Session, kind: NativeSave['kind'], label: string) => {
    const exported = await target.transport.exportSave();
    const save = saveSummary(target.config, exported.snapshot, kind, label, newSaveId());
    writeNativeSave(save, exported.payload);
    return save;
  };
  const perform = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setNotice('');
    try { await action(); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not finish. Please try again.'); return false; }
    finally { locked.current = false; setBusy(false); }
  }, []);
  const save = useCallback((kind: NativeSave['kind'] = 'manual', label = '') => perform(async () => {
    if (!current.current) throw new Error('Open a campaign before saving.');
    const result = await checkpoint(current.current, kind, label || (kind === 'auto' ? 'Autosave' : current.current.config.name));
    setNotice(`${result.label} saved on this device.`);
  }), [perform]);
  const open = (config: CampaignConfig, saved?: NativeSave) => perform(async () => {
    campaignNation(config);
    const previous = current.current;
    if (previous) {
      previous.transport.send({ t: 'command', cmd: { t: 'setSpeed', speed: 0 } });
      // A safety checkpoint is mandatory before replacing an open campaign.
      await checkpoint(previous, 'auto', 'Before switching campaigns');
    }
    const transport = new NativeSimTransport();
    let latest: WorldSnapshot | null = null;
    transport.onMessage((message) => {
      if (message.t === 'snapshot') {
        latest = message.snapshot;
        if (current.current?.transport === transport) {
          current.current = { config, transport, snapshot: message.snapshot };
          setSession(current.current);
        }
      } else if (message.t === 'log') setNotice(message.msg);
    });
    try {
      if (saved) await transport.importSave(await readNativeSave(saved.id));
      else transport.send({ t: 'command', cmd: { t: 'newGame', ...config } });
      const exported = await transport.exportSave();
      if (exported.snapshot.seed !== config.seed || exported.snapshot.playerNation !== config.playerNation || exported.snapshot.mapMode !== config.mapMode) {
        throw new Error('This checkpoint does not match its campaign information. Your current campaign is unchanged.');
      }
      const next = { config, transport, snapshot: latest ?? exported.snapshot };
      if (!saved) writeNativeSave(saveSummary(config, next.snapshot, 'auto', 'Campaign start', newSaveId()), exported.payload);
      current.current = next;
      setSession(next);
      previous?.transport.dispose();
    } catch (error) { transport.dispose(); throw error; }
  });
  useEffect(() => {
    const interval = setInterval(() => { if (current.current) void save('auto'); }, Math.max(1, session?.config.autosaveMinutes ?? 5) * 60000);
    const state = AppState.addEventListener('change', (value) => {
      if (value !== 'active' && current.current) {
        current.current.transport.send({ t: 'command', cmd: { t: 'setSpeed', speed: 0 } });
        void save('auto', 'App backgrounded');
      }
    });
    return () => { clearInterval(interval); state.remove(); };
  }, [session?.config.id, session?.config.autosaveMinutes, save]);
  useEffect(() => () => { current.current?.transport.dispose(); current.current = null; }, []);
  return { session, busy, notice, open, save };
}
