import { useMemo } from 'react';
import { useStore } from '../../store';
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

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Great Powers</h2>
      <p className="panel-subtle">
        Current player rank: {playerNation?.gpRank ? `#${playerNation.gpRank}` : 'Not a great power'}
      </p>
      {playerNation?.gpRank && playerNation.gpRank > 0 ? (
        <p className="panel-subtle">
          Influence pool {snapshot.playerInfluencePool.toFixed(1)} | Active targets {snapshot.playerInfluenceTargets.length}
        </p>
      ) : null}

      <ul className="panel-list gp-list">
        {snapshot.greatPowers.map((entry) => {
          const nation = nationById.get(entry.nation);
          const sphereNames = entry.sphereMembers.map((memberId) => nationById.get(memberId)?.tag ?? String(memberId));
          return (
            <li key={entry.nation}>
              <div>
                <strong>
                  #{entry.rank} {nation?.name ?? `Nation ${entry.nation}`}
                </strong>
                <span>
                  Score{' '}
                  <TraceTooltip
                    value={entry.score.toFixed(1)}
                    trace={[
                      { label: 'Industry', value: entry.industry },
                      { label: 'Military', value: entry.military },
                      { label: 'Prestige', value: entry.prestige },
                    ]}
                  />{' '}
                  | Industry{' '}
                  <TraceTooltip
                    value={entry.industry.toFixed(1)}
                    trace={[
                      { label: 'Industry score', value: entry.industry },
                      { label: 'Total power score', value: entry.score },
                    ]}
                  />{' '}
                  | Military{' '}
                  <TraceTooltip
                    value={entry.military.toFixed(1)}
                    trace={[
                      { label: 'Military score', value: entry.military },
                      { label: 'Total power score', value: entry.score },
                    ]}
                  />{' '}
                  | Prestige{' '}
                  <TraceTooltip
                    value={entry.prestige.toFixed(1)}
                    trace={[
                      { label: 'Prestige score', value: entry.prestige },
                      { label: 'Total power score', value: entry.score },
                    ]}
                  />
                </span>
                <span>
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
