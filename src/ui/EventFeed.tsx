import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import {
  batchAlerts,
  selectToastBatches,
  TOAST_AUTO_DISMISS_MS,
  TOAST_STACK_CAP,
  type AlertBatch,
} from './alertBatching';
import { instantPressProps } from './instantPress';

export function EventFeed() {
  const alerts = useStore((state) => state.alerts);
  const snapshot = useStore((state) => state.snapshot);
  const openPanelId = useStore((state) => state.openPanelId);
  const dismissAlert = useStore((state) => state.dismissAlert);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const playerName = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((n) => n.id === snapshot.playerNation)?.name ?? null;
  }, [snapshot]);

  const toasts = useMemo(() => {
    const batches = batchAlerts(alerts, playerName);
    return selectToastBatches(batches, TOAST_STACK_CAP)
      .filter((batch) => !hiddenIds.includes(batch.id));
  }, [alerts, playerName, hiddenIds]);

  const toastKey = toasts.map((batch) => batch.id).join('|');

  useEffect(() => {
    if (!toastKey) return;
    const ephemeral = toasts.filter((batch) => (
      batch.kind !== 'war'
      && batch.kind !== 'rebellion'
      && batch.kind !== 'formation'
    ));
    if (ephemeral.length === 0) return;
    const timers = ephemeral.map((batch) => window.setTimeout(() => {
      // Hide toast only — keep the alert in the outliner for calm review.
      setHiddenIds((prev) => (prev.includes(batch.id) ? prev : [...prev, batch.id]));
    }, TOAST_AUTO_DISMISS_MS));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
    // toastKey captures identity; toasts is read for kind filtering on that key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey]);

  if (toasts.length === 0) return null;

  const dismissBatch = (batch: AlertBatch) => {
    setHiddenIds((prev) => (prev.includes(batch.id) ? prev : [...prev, batch.id]));
    for (const member of batch.members) dismissAlert(member.id);
  };

  return (
    <div className="event-feed" data-testid="event-feed" aria-live="polite">
      {toasts.map((batch) => (
        <article
          key={batch.id}
          className={`event-card atlas-panel event-${batch.kind}${batch.count > 1 ? ' is-batched' : ''}`}
          data-testid="event-toast"
          data-kind={batch.kind}
          data-count={batch.count}
        >
          <strong>{batch.kind.toUpperCase()}{batch.count > 1 ? ` · ${batch.count}` : ''}</strong>
          <span>{batch.message}</span>
          {batch.suggestion && batch.count === 1 ? <small>{batch.suggestion}</small> : null}
          {batch.expandable ? (
            <button
              type="button"
              className="event-card__expand"
              {...instantPressProps(() => setExpandedId((id) => (id === batch.id ? null : batch.id)))}
            >
              {expandedId === batch.id ? 'Hide details' : 'Show details'}
            </button>
          ) : null}
          {expandedId === batch.id ? (
            <ul className="event-card__members">
              {batch.members.map((member) => (
                <li key={member.id}>{member.message}</li>
              ))}
            </ul>
          ) : null}
          <div className="event-card__actions">
            {batch.panel ? (
              <button
                type="button"
                {...instantPressProps(() => {
                  openPanelId(batch.panel);
                  dismissBatch(batch);
                })}
              >
                Open
              </button>
            ) : null}
            <button type="button" {...instantPressProps(() => dismissBatch(batch))}>
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
