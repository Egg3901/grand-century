import { useMemo } from 'react';
import { useStore } from '../../store';
import { NationFlag } from '../components/NationFlag';
import { TraceTooltip } from '../components/TraceTooltip';

export function GreatPowersPanel() {
  const snapshot = useStore((state) => state.snapshot);

  const nationById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation]) ?? [])
  ), [snapshot]);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Great Powers</h2>
        <p>Compiling rankings...</p>
      </section>
    );
  }

  const playerNation = nationById.get(snapshot.playerNation);
  const isGreatPower = Boolean(playerNation?.gpRank && playerNation.gpRank > 0);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Great Powers</h2>
      <p className="panel-subtle">
        Rankings by industry, military, and prestige. Sphere members are listed under each power.
      </p>

      <dl className="ledger-grid">
        <div>
          <dt>Your Rank</dt>
          <dd className={isGreatPower ? 'status-positive' : undefined}>
            {isGreatPower ? `#${playerNation!.gpRank}` : 'Not a great power'}
          </dd>
        </div>
        {isGreatPower ? (
          <>
            <div>
              <dt>Influence Pool</dt>
              <dd>{snapshot.playerInfluencePool.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Active Targets</dt>
              <dd>{snapshot.playerInfluenceTargets.length}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {isGreatPower && snapshot.playerInfluenceTargets.length > 0 ? (
        <>
          <h3 className="atlas-heading panel-small-heading">Influence Race</h3>
          <ul className="panel-list gp-list">
            {snapshot.playerInfluenceTargets.map((entry) => {
              const target = nationById.get(entry.target);
              return (
                <li key={entry.target}>
                  <div className="gp-row__nation">
                    {target ? <NationFlag tag={target.tag} color={target.color} size={18} /> : null}
                    <strong>{target?.name ?? `Nation ${entry.target}`}</strong>
                  </div>
                  <div className="gp-metrics">
                    <span>
                      Influence{' '}
                      <TraceTooltip
                        value={entry.points.toFixed(1)}
                        trace={[
                          { label: 'Your points', value: entry.points },
                          { label: 'Sphere threshold', value: 100 },
                        ]}
                      />
                      {' '}/ 100
                    </span>
                    <span className={entry.rivalPressure >= 25 ? 'status-danger' : undefined}>
                      Rival pressure {entry.rivalPressure.toFixed(1)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h3 className="atlas-heading panel-small-heading">Rankings</h3>
      <ul className="panel-list gp-list">
        {snapshot.greatPowers.map((entry) => {
          const nation = nationById.get(entry.nation);
          const sphereNames = entry.sphereMembers.map((memberId) => nationById.get(memberId)?.tag ?? String(memberId));
          const isPlayer = entry.nation === snapshot.playerNation;
          return (
            <li key={entry.nation} className={isPlayer ? 'is-player' : undefined}>
              <div className="gp-row__nation">
                {nation ? <NationFlag tag={nation.tag} color={nation.color} size={18} /> : null}
                <strong>
                  #{entry.rank} {nation?.name ?? `Nation ${entry.nation}`}
                </strong>
              </div>
              <div>
                <div className="gp-metrics">
                  <span>
                    Score{' '}
                    <TraceTooltip
                      value={entry.score.toFixed(1)}
                      trace={[
                        { label: 'Industry', value: entry.industry },
                        { label: 'Military', value: entry.military },
                        { label: 'Prestige', value: entry.prestige },
                      ]}
                    />
                  </span>
                  <span>
                    Ind{' '}
                    <TraceTooltip
                      value={entry.industry.toFixed(1)}
                      trace={[
                        { label: 'Industry score', value: entry.industry },
                        { label: 'Total power score', value: entry.score },
                      ]}
                    />
                  </span>
                  <span>
                    Mil{' '}
                    <TraceTooltip
                      value={entry.military.toFixed(1)}
                      trace={[
                        { label: 'Military score', value: entry.military },
                        { label: 'Total power score', value: entry.score },
                      ]}
                    />
                  </span>
                  <span>
                    Prestige{' '}
                    <TraceTooltip
                      value={entry.prestige.toFixed(1)}
                      trace={[
                        { label: 'Prestige score', value: entry.prestige },
                        { label: 'Total power score', value: entry.score },
                      ]}
                    />
                  </span>
                </div>
                <span className="gp-sphere">
                  Sphere: {sphereNames.length > 0 ? sphereNames.join(', ') : 'None'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
