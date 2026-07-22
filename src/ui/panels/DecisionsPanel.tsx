import { useStore } from '../../store';

export function DecisionsPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Decisions</h2>
        <p>Consulting the cabinet...</p>
      </section>
    );
  }

  const decisions = snapshot.playerDecisions ?? [];

  return (
    <section className="panel-card atlas-panel" data-testid="decisions-panel">
      <h2 className="atlas-heading">National Decisions</h2>
      <p className="panel-subtle">
        Player-initiated actions with prerequisites, costs, and lasting effects. Distinct from events that fire on their own.
      </p>
      {decisions.length === 0 ? (
        <p className="panel-subtle">No decisions defined.</p>
      ) : (
        <div className="production-build-grid">
          {decisions.map((decision) => (
            <div key={decision.id} className="production-build-row" data-testid={`decision-${decision.id}`}>
              <strong>{decision.title}</strong>
              <span>{decision.description}</span>
              <span>
                Cost: {decision.costSummary.length > 0 ? decision.costSummary.join(' · ') : 'None'}
              </span>
              <span title={decision.effectsSummary.join(' · ')}>
                Effects: {decision.effectsSummary.join(' · ')}
              </span>
              {decision.progressLines && decision.progressLines.length > 0 ? (
                <span className="panel-subtle" data-testid={`decision-progress-${decision.id}`}>
                  {decision.progressLines.join(' · ')}
                </span>
              ) : null}
              <div className="production-build-actions">
                <button
                  type="button"
                  className={decision.available ? 'btn btn--primary' : 'btn btn--secondary'}
                  disabled={!decision.available}
                  title={decision.available ? `Take ${decision.title}` : decision.reason}
                  onClick={() => sendCommand({ t: 'takeDecision', decision: decision.id })}
                >
                  {decision.available ? 'Enact' : decision.reason}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
