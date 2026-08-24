import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';
import { dayToLabel } from '../gameDate';

export function SaveLoadPanel() {
  const snapshot = useSnapshotFields(['day', 'nations'] as const);
  const saveSlots = useStore((state) => state.saveSlots);
  const saveStatus = useStore((state) => state.saveStatus);
  const sendCommand = useStore((state) => state.sendCommand);
  const requestSaves = useStore((state) => state.requestSaves);
  const [slotName, setSlotName] = useState('slot-1');
  const [confirmAction, setConfirmAction] = useState<{ action: 'load' | 'overwrite'; slot: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    requestSaves();
  }, [requestSaves, snapshot?.day]);

  // Focus trap: move focus into the confirm dialog when it opens, restore on close.
  useEffect(() => {
    if (confirmAction) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Small delay so the DOM has rendered the dialog.
      const timer = window.setTimeout(() => {
        const first = confirmRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        first?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    // Restore focus when dialog closes.
    previousFocusRef.current?.focus();
  }, [confirmAction]);

  const dismissConfirm = useCallback(() => {
    setConfirmAction(null);
  }, []);

  // Escape key closes the confirm dialog without closing the parent panel.
  useEffect(() => {
    if (!confirmAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismissConfirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmAction, dismissConfirm]);

  // Tab / Shift+Tab focus trap keeps focus inside the confirm dialog.
  useEffect(() => {
    if (!confirmAction || !confirmRef.current) return;
    const dialog = confirmRef.current;
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [confirmAction]);

  const playerNameById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation.name]) ?? [])
  ), [snapshot?.nations]);

  const executeConfirmed = () => {
    if (!confirmAction) return;
    sendCommand({ t: confirmAction.action === 'overwrite' ? 'save' : 'load', slot: confirmAction.slot });
    setConfirmAction(null);
  };

  return (
    <section className="panel-card atlas-panel" data-coach-id="save-panel">
      <h2 className="atlas-heading">Save / Load</h2>
      <p className="panel-subtle">Autosave rotates every sim-year across autosave-1..3. Named slots are manual.</p>
      {saveStatus ? (
        <p className={`bankruptcy-pill ${saveStatus.ok ? '' : 'is-bankrupt'}`}>
          {saveStatus.action} [{saveStatus.slot}]: {saveStatus.msg}
        </p>
      ) : null}

      {confirmAction ? (
        <div ref={confirmRef} className="save-confirm" role="alertdialog" aria-modal="true" aria-label={`Confirm ${confirmAction.action}`} aria-describedby="save-confirm-desc">
          <p id="save-confirm-desc">
            {confirmAction.action === 'overwrite'
              ? `Overwrite slot "${confirmAction.slot}"? This cannot be undone.`
              : `Load slot "${confirmAction.slot}"? Unsaved progress will be lost.`}
          </p>
          <div className="mil-actions">
            <button type="button" className="btn btn--primary" onClick={executeConfirmed}>
              {confirmAction.action === 'overwrite' ? 'Overwrite' : 'Load'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={dismissConfirm}>
              Cancel
            </button>
          </div>
        </div>
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
          <button
            type="button"
            className="btn btn--primary"
            disabled={slotName.trim().length === 0}
            onClick={() => {
              const trimmed = slotName.trim();
              const exists = saveSlots.some((s) => s.slot === trimmed);
              if (exists) {
                setConfirmAction({ action: 'overwrite', slot: trimmed });
              } else {
                sendCommand({ t: 'save', slot: trimmed });
              }
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={slotName.trim().length === 0}
            onClick={() => setConfirmAction({ action: 'load', slot: slotName.trim() })}
          >
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
                {dayToLabel(slot.day)} | {new Date(slot.updatedAt).toLocaleString()} | {playerNameById.get(slot.playerNation) ?? `Nation ${slot.playerNation}`}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" className="btn btn--primary" onClick={() => setConfirmAction({ action: 'load', slot: slot.slot })}>Load</button>
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmAction({ action: 'overwrite', slot: slot.slot })}>Overwrite</button>
            </div>
          </li>
        ))}
        {saveSlots.length === 0 ? <li><span>No saves yet</span><span /></li> : null}
      </ul>
    </section>
  );
}
