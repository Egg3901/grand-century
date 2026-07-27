import { useEffect, useMemo } from 'react';
import { WORLD_SEED } from '../../data/generated';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';

function coreStateLabel(stateId: number, stateNameById: Map<number, string>): string {
  return stateNameById.get(stateId) ?? `State ${stateId}`;
}

function kindLabel(kind: string): string {
  if (kind === 'owned') return 'Owned';
  if (kind === 'sphered') return 'Sphered';
  return 'Missing';
}

export function FormablesPanel() {
  const snapshot = useSnapshotFields([
    'day',
    'playerNation',
    'nations',
    'playerFormables',
    'playerBalanceOfPower',
  ] as const);
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
  const nationById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation]) ?? [])
  ), [snapshot?.nations]);

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
  const bop = snapshot.playerBalanceOfPower ?? null;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Formable Nations</h2>
      <p className="panel-subtle">
        National goals let you proclaim larger historic unions when political and territorial requirements are met.
        Sphered cores count toward control but are not annexed on proclaim.
      </p>
      {bop ? (
        <p className={`panel-subtle ${bop.rivalryThreat ? 'status-danger' : ''}`}>
          Balance of Power: {bop.formableName} at {(bop.share * 100).toFixed(0)}% core control —
          {bop.alarmedGpCount} GP{bop.alarmedGpCount === 1 ? '' : 's'} alarmed
          (−{bop.monthlyOpinionHit}/mo
          {bop.rivalryThreat ? ', rivalry threshold crossed' : ''}).
        </p>
      ) : null}
      {statuses.length === 0 ? (
        <p className="panel-subtle">No formable decisions are available for this nation.</p>
      ) : null}
      <div className="production-build-grid">
        {statuses.map((status) => (
          <div key={status.key} className="production-build-row">
            <strong>{status.name}</strong>
            <span>
              Core control: {status.controlledCoreStates}/{status.totalCoreStates} (need {status.requiredCoreStates})
              {' — '}
              {status.ownedCoreCount ?? 0} owned / {status.spheredCoreCount ?? 0} sphered
            </span>
            <span>
              Prestige on form: +{status.prestigeReward ?? 0}
              {(status.spheredRemainTags?.length ?? 0) > 0
                ? ` · Sphered remain independent: ${status.spheredRemainTags!.join(', ')}`
                : ' · Annexes owned cores only (already held)'}
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
            <ul className="panel-list">
              {(status.coreBreakdown ?? status.coreStateIds.map((stateId) => ({
                stateId,
                owner: -1,
                kind: 'missing' as const,
              }))).map((core) => {
                const owner = nationById.get(core.owner);
                return (
                  <li key={core.stateId}>
                    <span className={
                      core.kind === 'owned' ? 'status-positive' : core.kind === 'sphered' ? '' : 'status-danger'
                    }>
                      {kindLabel(core.kind)}
                    </span>
                    <span>
                      {' '}{coreStateLabel(core.stateId, stateNameById)}
                      {owner ? ` — ${owner.tag}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="production-build-actions">
              <button
                type="button"
                className={status.ready ? 'btn btn--primary' : 'btn btn--secondary'}
                disabled={!status.ready}
                title={status.ready ? `Form ${status.name} (+${status.prestigeReward ?? 0} prestige)` : status.reason}
                onClick={() => sendCommand({ t: 'formNation', key: status.key })}
              >
                {status.ready ? `Form ${status.name} (+${status.prestigeReward ?? 0})` : status.reason}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
