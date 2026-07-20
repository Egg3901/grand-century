import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';

function dayToDate(day: number): string {
  const year = 1836 + Math.floor(day / 365);
  const dayOfYear = day % 365;
  return `${year} (day ${dayOfYear + 1})`;
}

export function SaveLoadPanel() {
  const snapshot = useStore((state) => state.snapshot);
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
  ), [snapshot]);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Save / Load</h2>
      <p className="panel-subtle">Autosave rotates every sim-year across `autosave-1..3`.</p>
      {saveStatus ? (
        <p className={`panel-subtle ${saveStatus.ok ? 'positive' : 'negative'}`}>
          {saveStatus.action} [{saveStatus.slot}]: {saveStatus.msg}
        </p>
      ) : null}

      <div className="mil-grid">
        <label>
          Slot
          <input
            type="text"
            value={slotName}
            onChange={(event) => setSlotName(event.target.value.trimStart())}
            placeholder="slot-1"
          />
        </label>
        <div className="mil-actions">
          <button type="button" disabled={slotName.trim().length === 0} onClick={() => sendCommand({ t: 'save', slot: slotName.trim() })}>
            Save
          </button>
          <button type="button" disabled={slotName.trim().length === 0} onClick={() => sendCommand({ t: 'load', slot: slotName.trim() })}>
            Load
          </button>
          <button type="button" onClick={() => requestSaves()}>
            Refresh Slots
          </button>
        </div>
      </div>

      <ul className="panel-list mil-list">
        {saveSlots.map((slot) => (
          <li key={slot.slot}>
            <div>
              <strong>{slot.slot}</strong>
              <span>
                {dayToDate(slot.day)} | {new Date(slot.updatedAt).toLocaleString()} | {playerNameById.get(slot.playerNation) ?? `Nation ${slot.playerNation}`}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" onClick={() => sendCommand({ t: 'load', slot: slot.slot })}>Load</button>
              <button type="button" onClick={() => sendCommand({ t: 'save', slot: slot.slot })}>Overwrite</button>
            </div>
          </li>
        ))}
        {saveSlots.length === 0 ? <li><span>No saves yet</span><span /></li> : null}
      </ul>
    </section>
  );
}

