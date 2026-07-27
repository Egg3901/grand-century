/**
 * Great Powers — the Concert ledger, and Diplomacy's close cousin.
 *
 * The two screens describe the same subject, so they now share a vocabulary:
 * the chancery meters, the wax seals, and a two-way link. A ranked row shows
 * what our relation with that power is (allied / rival / at war) so ranking
 * and standing stop being two separate things the player must hold in mind,
 * and tapping a row opens that nation's dossier in Diplomacy.
 */
import { useMemo } from 'react';
import type { DiploRelationKind, NationId } from '../../shared/types';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';
import { NationFlag } from '../components/NationFlag';
import { TraceTooltip } from '../components/TraceTooltip';

const GP_FIELDS = [
  'day',
  'nations',
  'playerNation',
  'ninthPowerScore',
  'playerPowerScore',
  'playerInfluencePool',
  'playerInfluenceTargets',
  'greatPowers',
  'relations',
  'wars',
] as const;

/** Points of influence that tip a nation into a great power's sphere. */
const SPHERE_THRESHOLD = 100;

interface Seal {
  label: string;
  tone: 'war' | 'rival' | 'ally' | 'guarantee' | 'truce';
}

function sealFor(kind: DiploRelationKind | undefined, atWar: boolean): Seal | null {
  if (atWar) return { label: 'At war', tone: 'war' };
  if (kind === 'alliance') return { label: 'Allied', tone: 'ally' };
  if (kind === 'rivalry') return { label: 'Rival', tone: 'rival' };
  if (kind === 'guarantee') return { label: 'Guarantee', tone: 'guarantee' };
  if (kind === 'truce') return { label: 'Truce', tone: 'truce' };
  return null;
}

export function GreatPowersPanel() {
  const snapshot = useSnapshotFields(GP_FIELDS);
  const focusNationDiplomacy = useStore((state) => state.focusNationDiplomacy);

  const nationById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation]) ?? [])
  ), [snapshot?.nations]);

  const playerNation = snapshot?.playerNation ?? -1;
  const day = snapshot?.day ?? 0;

  const relationKindByNation = useMemo(() => {
    const map = new Map<NationId, DiploRelationKind>();
    for (const relation of snapshot?.relations ?? []) {
      const live = relation.expiresDay < 0 || relation.expiresDay > day;
      if (!live || relation.kind === 'neutral') continue;
      if (relation.a === playerNation) map.set(relation.b, relation.kind);
      else if (relation.b === playerNation) map.set(relation.a, relation.kind);
    }
    return map;
  }, [snapshot?.relations, playerNation, day]);

  const warWith = useMemo(() => {
    const set = new Set<NationId>();
    for (const war of snapshot?.wars ?? []) {
      if (war.attackers.includes(playerNation)) for (const id of war.defenders) set.add(id);
      else if (war.defenders.includes(playerNation)) for (const id of war.attackers) set.add(id);
    }
    return set;
  }, [snapshot?.wars, playerNation]);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Great Powers</h2>
        <p className="panel-subtle">Compiling rankings...</p>
      </section>
    );
  }

  const player = nationById.get(snapshot.playerNation);
  const isGreatPower = Boolean(player?.gpRank && player.gpRank > 0);
  const ninthScore = snapshot.ninthPowerScore ?? 0;
  const playerScore = snapshot.playerPowerScore ?? 0;
  const pointsFromNinth = playerScore - ninthScore;
  const influencePool = snapshot.playerInfluencePool ?? 0;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Great Powers</h2>
      <p className="panel-subtle">
        Standing in the Concert is industry, army and prestige in one number. Tap a power to open its dossier.
      </p>

      <div className="diplo-chancery">
        <div className={`diplo-meter${isGreatPower ? ' is-positive' : ''}`}>
          <span className="diplo-meter__label">Rank</span>
          <span className="diplo-meter__value">{isGreatPower ? `#${player!.gpRank}` : 'None'}</span>
          <span className="diplo-meter__track" aria-hidden="true">
            <span
              className="diplo-meter__fill"
              style={{ width: isGreatPower ? `${Math.max(10, 100 - (player!.gpRank - 1) * 11)}%` : '2%' }}
            />
          </span>
        </div>
        <div className={`diplo-meter${pointsFromNinth >= 0 ? ' is-positive' : ' is-danger'}`}>
          <span className="diplo-meter__label">Gap #9</span>
          <span className="diplo-meter__value">
            <TraceTooltip
              value={`${pointsFromNinth >= 0 ? '+' : ''}${pointsFromNinth.toFixed(1)}`}
              trace={[
                { label: 'Our score', value: playerScore },
                { label: '#9 score (the GP cliff)', value: ninthScore },
                { label: 'Gap (us minus #9)', value: pointsFromNinth },
              ]}
            />
          </span>
          <span className="diplo-meter__track" aria-hidden="true">
            <span
              className="diplo-meter__fill"
              style={{ width: `${Math.max(2, Math.min(100, (playerScore / Math.max(1, ninthScore)) * 50))}%` }}
            />
          </span>
        </div>
        {isGreatPower ? (
          <>
            <div className="diplo-meter">
              <span className="diplo-meter__label">Influence</span>
              <span className="diplo-meter__value">{influencePool.toFixed(0)}</span>
              <span className="diplo-meter__track" aria-hidden="true">
                <span className="diplo-meter__fill" style={{ width: `${Math.max(2, Math.min(100, influencePool * 5))}%` }} />
              </span>
            </div>
            <div className="diplo-meter">
              <span className="diplo-meter__label">Courting</span>
              <span className="diplo-meter__value">{snapshot.playerInfluenceTargets.length}</span>
              <span className="diplo-meter__track" aria-hidden="true">
                <span
                  className="diplo-meter__fill"
                  style={{ width: `${Math.max(2, Math.min(100, snapshot.playerInfluenceTargets.length * 20))}%` }}
                />
              </span>
            </div>
          </>
        ) : null}
      </div>

      {isGreatPower && snapshot.playerInfluenceTargets.length > 0 ? (
        <>
          <h3 className="atlas-heading panel-small-heading">Influence Race</h3>
          <ul className="panel-list gp-list">
            {snapshot.playerInfluenceTargets.map((entry) => {
              const target = nationById.get(entry.target);
              return (
                <li key={entry.target}>
                  <div className="gp-row__nation">
                    <button
                      type="button"
                      className="gp-row-link"
                      onClick={() => focusNationDiplomacy(entry.target)}
                      title={`Open ${target?.name ?? 'this nation'} in Diplomacy`}
                    >
                      {target ? <NationFlag tag={target.tag} color={target.color} size={18} /> : null}
                      <strong>{target?.name ?? `Nation ${entry.target}`}</strong>
                    </button>
                  </div>
                  <div className="gp-metrics">
                    <span>
                      Influence{' '}
                      <TraceTooltip
                        value={entry.points.toFixed(1)}
                        trace={[
                          { label: 'Our points', value: entry.points },
                          { label: 'Points needed to sphere them', value: SPHERE_THRESHOLD },
                          { label: 'Strongest rival pressure', value: entry.rivalPressure },
                        ]}
                      />
                      {' '}/ {SPHERE_THRESHOLD}
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
          const isPlayer = entry.nation === snapshot.playerNation;
          const seal = isPlayer ? null : sealFor(relationKindByNation.get(entry.nation), warWith.has(entry.nation));
          return (
            <li key={entry.nation} className={isPlayer ? 'is-player' : undefined}>
              <div className="gp-row__nation">
                <span className="gp-rank">{entry.rank}</span>
                <button
                  type="button"
                  className="gp-row-link"
                  disabled={isPlayer}
                  onClick={() => focusNationDiplomacy(entry.nation)}
                  title={isPlayer ? 'This is us' : `Open ${nation?.name ?? 'this power'} in Diplomacy`}
                >
                  {nation ? <NationFlag tag={nation.tag} color={nation.color} size={18} /> : null}
                  <strong>{nation?.name ?? `Nation ${entry.nation}`}</strong>
                </button>
                {isPlayer ? <span className="gc-seal is-guarantee">Us</span> : null}
                {seal ? <span className={`gc-seal is-${seal.tone}`}>{seal.label}</span> : null}
              </div>
              <div>
                <div className="gp-metrics">
                  <span>
                    Score{' '}
                    <TraceTooltip
                      value={entry.score.toFixed(1)}
                      trace={[
                        { label: 'root industry x 9', value: Number((Math.sqrt(Math.max(0, entry.industry)) * 9).toFixed(2)) },
                        { label: 'military x 2.5', value: Number((entry.military * 2.5).toFixed(2)) },
                        { label: 'prestige x 1', value: entry.prestige },
                        { label: 'Industry (raw)', value: entry.industry },
                        { label: 'Military (raw)', value: entry.military },
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
                <div className="gp-sphere-seals">
                  <span className="gp-sphere-label">Sphere</span>
                  {entry.sphereMembers.length === 0 ? (
                    <span className="gp-sphere">none</span>
                  ) : entry.sphereMembers.map((memberId) => (
                    <span key={memberId} className="gc-seal">
                      {nationById.get(memberId)?.tag ?? memberId}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
