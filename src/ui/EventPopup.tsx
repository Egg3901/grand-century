import { useStore } from '../store';
import { useSnapshotField } from './useSnapshotFields';
import { instantPressProps } from './instantPress';
import './EventPopup.css';

export function EventPopup() {
  const pendingPlayerEvents = useSnapshotField('pendingPlayerEvents');
  const sendCommand = useStore((state) => state.sendCommand);

  const pending = pendingPlayerEvents ?? [];
  const current = pending[0];
  if (!current) return null;

  return (
    <div className="event-popup-layer" role="dialog" aria-modal="true" aria-labelledby="event-popup-title">
      <div className="event-popup atlas-panel" data-testid="event-popup">
        <header className="event-popup__header">
          <span className="atlas-heading">Dispatch</span>
          <h2 id="event-popup-title">{current.title}</h2>
        </header>
        <p className="event-popup__body">{current.description}</p>
        <div className="event-popup__choices">
          {current.choices.map((choice, index) => {
            const firstAvailable = current.choices.findIndex((entry) => entry.available);
            const isPrimary = choice.available && index === firstAvailable;
            return (
              <button
                key={choice.id}
                type="button"
                className={`event-popup__choice btn ${isPrimary ? 'btn--primary' : 'btn--secondary'}`}
                disabled={!choice.available}
                title={choice.available
                  ? (choice.effectsSummary.join(' · ') || choice.description || choice.label)
                  : (choice.unavailableReason ?? 'Unavailable')}
                data-testid={`event-choice-${choice.id}`}
                {...instantPressProps(() => {
                  if (!choice.available) return;
                  sendCommand({ t: 'resolveEvent', instanceId: current.instanceId, choiceId: choice.id });
                })}
              >
                <strong>{choice.label}</strong>
                {choice.description ? <span>{choice.description}</span> : null}
                <small>{choice.effectsSummary.join(' · ')}</small>
                {!choice.available && choice.unavailableReason ? (
                  <em>{choice.unavailableReason}</em>
                ) : null}
              </button>
            );
          })}
        </div>
        {pending.length > 1 ? (
          <p className="event-popup__queue">{pending.length - 1} more dispatch{pending.length > 2 ? 'es' : ''} waiting</p>
        ) : null}
      </div>
    </div>
  );
}
