import { useStore } from '../../store';
import type { CulturePolicy } from '../../shared/types';
import { TraceTooltip } from '../components/TraceTooltip';

/**
 * 0.8.0 — The Cultures ledger: national makeup, acceptance, culture policy and
 * national movements. Rendered alongside the Population census (PanelHost).
 */

const POLICIES: { id: CulturePolicy; label: string; blurb: string }[] = [
  { id: 'exclusionary', label: 'Exclusionary', blurb: 'Forced assimilation. Minorities melt faster but seethe.' },
  { id: 'assimilationist', label: 'Assimilationist', blurb: 'Steady state-building. The default posture.' },
  { id: 'pluralist', label: 'Pluralist', blurb: 'Minorities live freely. Calm, but identities endure.' },
];

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

export function CulturePanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  if (!snapshot || !snapshot.playerCultures) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Cultures</h2>
        <p>Awaiting the cultural census...</p>
      </section>
    );
  }

  const policy = snapshot.playerCulturePolicy ?? 'assimilationist';
  const cultures = snapshot.playerCultures;
  const movements = snapshot.playerMovements ?? [];

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Cultures of the Nation</h2>
      <p className="panel-subtle">
        Accepted cultures are content and serve in the army. Non-accepted peoples simmer,
        assimilate — or awaken into national movements.
      </p>

      <h3 className="atlas-heading panel-small-heading">Cultural Policy</h3>
      <div className="culture-policy-row">
        {POLICIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`culture-policy-btn${policy === entry.id ? ' culture-policy-btn--active' : ''}`}
            title={entry.blurb}
            onClick={() => sendCommand({ t: 'setCulturePolicy', policy: entry.id })}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="panel-subtle">{POLICIES.find((entry) => entry.id === policy)?.blurb}</p>

      <h3 className="atlas-heading panel-small-heading">National Movements</h3>
      {movements.length === 0 ? (
        <p className="panel-subtle status-positive">No separatist movement is organising.</p>
      ) : (
        <ul className="panel-list culture-movement-list">
          {movements.map((movement) => (
            <li key={movement.id}>
              <div>
                <strong>{movement.cultureName} movement</strong>
                <span className={movement.boiling ? 'unrest' : undefined}>
                  {movement.boiling ? 'On the brink of rebellion' : 'Organising'}
                </span>
              </div>
              <div className="culture-radical-bar" title={`Radicalism ${movement.radicalism.toFixed(0)} / 100`}>
                <div
                  className={`culture-radical-fill${movement.boiling ? ' culture-radical-fill--hot' : ''}`}
                  style={{ width: `${Math.max(2, Math.min(100, movement.radicalism))}%` }}
                />
              </div>
              <div>
                <span>
                  Radicalism{' '}
                  <TraceTooltip
                    value={movement.radicalism.toFixed(0)}
                    trace={[
                      { label: 'Radicalism (0-100)', value: movement.radicalism },
                      { label: 'Avg militancy', value: movement.militancy },
                      { label: 'Avg consciousness', value: movement.consciousness },
                      { label: 'Adherents', value: movement.adherents },
                    ]}
                  />
                </span>
                <span>{movement.adherents.toLocaleString(undefined, { maximumFractionDigits: 0 })} adherents</span>
                <span>
                  Heartland: {movement.heartlandNames.length > 0 ? movement.heartlandNames.join(', ') : 'dispersed'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Cultural Census</h3>
      <ul className="panel-list culture-list">
        {cultures.map((entry) => (
          <li key={entry.culture}>
            <div>
              <strong>{entry.name}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct(entry.share)})</span>
              {entry.primary ? (
                <span className="culture-badge culture-badge--primary">Primary</span>
              ) : entry.accepted ? (
                <span className="culture-badge culture-badge--accepted">Accepted</span>
              ) : (
                <span className="culture-badge">Non-accepted</span>
              )}
            </div>
            <div>
              <span className={entry.avgMilitancy >= 4 ? 'unrest' : undefined}>
                Mil {entry.avgMilitancy.toFixed(2)}
              </span>
              <span>Con {entry.avgConsciousness.toFixed(2)}</span>
              {!entry.primary && !entry.accepted ? (
                <span>
                  Assimilated{' '}
                  <TraceTooltip
                    value={`${entry.assimilatedLastMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo`}
                    trace={[
                      { label: 'Assimilated last month', value: entry.assimilatedLastMonth },
                      { label: 'Community size', value: entry.size },
                      { label: 'Share of nation', value: entry.share },
                    ]}
                  />
                </span>
              ) : null}
              {!entry.primary ? (
                entry.accepted ? (
                  <button
                    type="button"
                    className="culture-accept-btn culture-accept-btn--revoke"
                    onClick={() => sendCommand({ t: 'setCultureAccepted', culture: entry.culture, accepted: false })}
                  >
                    Revoke acceptance
                  </button>
                ) : entry.canAccept ? (
                  <button
                    type="button"
                    className="culture-accept-btn"
                    title="Grant full acceptance: calms this people and admits them to the army, at a cost of prestige."
                    onClick={() => sendCommand({ t: 'setCultureAccepted', culture: entry.culture, accepted: true })}
                  >
                    Grant acceptance
                  </button>
                ) : null
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
