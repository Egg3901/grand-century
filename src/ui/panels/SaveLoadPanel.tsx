import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';

function dayToDate(day: number): string {
  const year = 1820 + Math.floor(day / 365);
  const dayOfYear = day % 365;
  return `${year} (day ${dayOfYear + 1})`;
}

export function SaveLoadPanel() {
  const snapshot = useSnapshotFields(['day', 'nations'] as const);
  const saveSlots = useStore((state) => state.saveSlots);
  const saveStatus = useStore((state) => state.saveStatus);
  const sendCommand = useStore((state) => state.sendCommand);
  const requestSaves = useStore((state) => state.requestSaves);
  const [slotName, setSlotName] = useState('slot-1');

  useEffect(() => {
    requestSaves();
  }, [requestSaves, snapshot?.day]);

  const playerNameById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation.name]) ?? [])
  ), [snapshot?.nations]);

  return (
    <section className="panel-card atlas-panel" data-coach-id="save-panel">
      <h2 className="atlas-heading">Save / Load</h2>
      <p className="panel-subtle">Autosave rotates every sim-year across autosave-1..3. Named slots are manual.</p>
      {saveStatus ? (
        <p className={`bankruptcy-pill ${saveStatus.ok ? '' : 'is-bankrupt'}`}>
          {saveStatus.action} [{saveStatus.slot}]: {saveStatus.msg}
        </p>
      ) : null}

      <h3 className="atlas-heading panel-small-heading">Named Slot</h3>
      <div className="save-controls">
        <label>
          Slot
          <input
            type="text"
            className="gc-input"
            value={slotName}
            onChange={(event) => setSlotName(event.target.value.trimStart())}
            placeholder="slot-1"
          />
        </label>
        <div className="mil-actions">
          <button type="button" className="btn btn--primary" disabled={slotName.trim().length === 0} onClick={() => sendCommand({ t: 'save', slot: slotName.trim() })}>
            Save
          </button>
          <button type="button" className="btn btn--secondary" disabled={slotName.trim().length === 0} onClick={() => sendCommand({ t: 'load', slot: slotName.trim() })}>
            Load
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => requestSaves()}>
            Refresh Slots
          </button>
        </div>
      </div>

      <h3 className="atlas-heading panel-small-heading">Available Slots</h3>
      <ul className="panel-list mil-list">
        {saveSlots.map((slot) => (
          <li key={slot.slot}>
            <div>
              <strong>{slot.slot}</strong>
              <span>
                {dayToDate(slot.day)} · {new Date(slot.updatedAt).toLocaleString()} · {playerNameById.get(slot.playerNation) ?? `Nation ${slot.playerNation}`}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" className="btn btn--primary" onClick={() => sendCommand({ t: 'load', slot: slot.slot })}>Load</button>
              <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'save', slot: slot.slot })}>Overwrite</button>
            </div>
          </li>
        ))}
        {saveSlots.length === 0 ? <li><span>No saves yet</span><span /></li> : null}
      </ul>
    </section>
  );
}
