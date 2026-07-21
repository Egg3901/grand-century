import { useEffect, useMemo } from 'react';
import { WORLD_SEED } from '../../data/generated';
import { useStore } from '../../store';

function coreStateLabel(stateId: number, stateNameById: Map<number, string>): string {
  return stateNameById.get(stateId) ?? `State ${stateId}`;
}

export function FormablesPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const detail = useStore((state) => state.nationDetail);
  const requestNation = useStore((state) => state.requestNation);
  const sendCommand = useStore((state) => state.sendCommand);

  useEffect(() => {
    if (!snapshot) return;
    requestNation(snapshot.playerNation);
  }, [requestNation, snapshot?.day, snapshot?.playerNation]);

  const stateNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.states.map((state) => [state.id, state.name]))
  ), []);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Formable Nations</h2>
        <p>Assembling national claims...</p>
      </section>
    );
  }

  const statuses = detail?.id === snapshot.playerNation
    ? (detail.formablesAvailable ?? [])
    : (snapshot.playerFormables ?? []);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Formable Nations</h2>
      <p className="panel-subtle">
        National goals let you proclaim larger historic unions when political and territorial requirements are met.
      </p>
      {statuses.length === 0 ? (
        <p className="panel-subtle">No formable decisions are available for this nation.</p>
      ) : null}
      <div className="production-build-grid">
        {statuses.map((status) => (
          <div key={status.key} className="production-build-row">
            <strong>{status.name}</strong>
            <span>
              Core control: {status.controlledCoreStates}/{status.totalCoreStates} (need {status.requiredCoreStates})
            </span>
            <ul className="panel-list">
              {status.requirements.map((requirement) => (
                <li key={requirement.key}>
                  <span className={requirement.met ? 'status-positive' : 'status-danger'}>
                    {requirement.met ? 'Met' : 'Missing'} - {requirement.label}
                  </span>
                  <span>{requirement.detail}</span>
                </li>
              ))}
            </ul>
            <span>
              Core states: {status.coreStateIds.map((stateId) => coreStateLabel(stateId, stateNameById)).join(', ')}
            </span>
            <div className="production-build-actions">
              <button
                type="button"
                className={status.ready ? 'btn btn--primary' : 'btn btn--secondary'}
                disabled={!status.ready}
                title={status.ready ? `Form ${status.name}` : status.reason}
                onClick={() => sendCommand({ t: 'formNation', key: status.key })}
              >
                {status.ready ? `Form ${status.name}` : status.reason}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
