/**
 * 0.7.0 Concert of Europe panel — world tension, the active crisis, and the
 * congress ledger. Rendered inside the Great Powers panel (see PanelHost).
 */
import { useMemo } from 'react';
import type { CrisisSide } from '../../shared/types';
import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

const CRISIS_TYPE_LABEL: Record<string, string> = {
  sphere_contest: 'Sphere Contest',
  containment: 'Containment',
  humiliation: 'Humiliation',
};

const DEMAND_LABEL: Record<string, string> = {
  add_to_sphere: 'bring the subject into their sphere of influence',
  cut_down_to_size: 'cut the subject down to size',
  humiliate: 'humiliate the subject',
  annex_state: 'annex territory from the subject',
  liberate_state: 'liberate territory from the subject',
  take_colony: 'seize a colony from the subject',
};

function tensionMood(tension: number): { label: string; className: string } {
  if (tension >= 70) return { label: 'The powder keg', className: 'status-danger' };
  if (tension >= 45) return { label: 'Sabres rattling', className: 'status-danger' };
  if (tension >= 25) return { label: 'Uneasy peace', className: '' };
  return { label: 'The concert holds', className: 'status-positive' };
}

function forecastLabel(forecast: string | undefined): string {
  if (forecast === 'congress_attacker') return 'Congress for the pressing side';
  if (forecast === 'congress_defender') return 'Congress for the resisting side';
  if (forecast === 'war') return 'Balanced blocs — war if showdown hits now';
  return 'Unknown';
}

export function CrisisPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  const nationById = useMemo(() => (
    new Map(snapshot?.nations.map((nation) => [nation.id, nation]) ?? [])
  ), [snapshot]);

  if (!snapshot) return null;

  const tension = snapshot.worldTension ?? 0;
  const mood = tensionMood(tension);
  const crisis = snapshot.activeCrisis ?? null;
  const showdown = snapshot.crisisShowdown ?? null;
  const history = (snapshot.congressHistory ?? []).slice().reverse();
  const candidates = snapshot.crisisCandidates ?? [];
  const player = nationById.get(snapshot.playerNation);
  const playerIsGp = Boolean(player?.gpRank && player.gpRank > 0);
  const cooldownUntil = snapshot.crisisCooldownUntil ?? 0;
  const cooldownLeft = Math.max(0, cooldownUntil - snapshot.day);
  const tensionDecay = snapshot.tensionDecay ?? 0;
  const tensionNet = snapshot.tensionNetDelta ?? 0;

  const name = (id: number) => nationById.get(id)?.name ?? `Nation ${id}`;
  const tags = (ids: number[]) => ids.map((id) => nationById.get(id)?.tag ?? String(id)).join(', ');

  const playerSide: CrisisSide | null = crisis
    ? crisis.attackerBackers.includes(snapshot.playerNation)
      ? 'attacker'
      : crisis.defenderBackers.includes(snapshot.playerNation) ? 'defender' : null
    : null;
  const playerIsLead = Boolean(crisis
    && (crisis.attackerLead === snapshot.playerNation || crisis.defenderLead === snapshot.playerNation));
  const playerPressed = Boolean(crisis && crisis.pressedBy.includes(snapshot.playerNation));
  const playerIsAttackerLead = Boolean(crisis && crisis.attackerLead === snapshot.playerNation);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">The Concert of Europe</h2>
      <p className="panel-subtle">
        World tension breeds crises; crises end at the congress table — or on the battlefield.
      </p>

      <div className="crisis-tension-row">
        <span className={`crisis-tension-label ${mood.className}`}>{mood.label}</span>
        <span>
          Tension{' '}
          <TraceTooltip
            value={tension.toFixed(1)}
            trace={(snapshot.tensionTrace ?? []).map((entry) => ({ label: entry.label, value: entry.value }))}
          />
          {' '}/ 100
        </span>
      </div>
      <p className="panel-subtle">
        Net Δ {tensionNet >= 0 ? '+' : ''}{tensionNet.toFixed(1)}
        {' '}(decay −{tensionDecay.toFixed(1)}
        {cooldownLeft > 0 ? ` · cooldown ${cooldownLeft}d` : ' · ready to spawn'})
      </p>
      <div className="crisis-meter" role="img" aria-label={`World tension ${tension.toFixed(0)} of 100`}>
        <div
          className={`crisis-meter__fill ${tension >= 45 ? 'crisis-meter__fill--hot' : ''}`}
          style={{ width: `${Math.max(2, Math.min(100, tension))}%` }}
        />
      </div>

      {crisis ? (
        <div className="crisis-card">
          <h3 className="atlas-heading panel-small-heading">
            The {name(crisis.subject)} Crisis ({CRISIS_TYPE_LABEL[crisis.type] ?? crisis.type})
          </h3>
          <p className="panel-subtle">
            <strong>{name(crisis.attackerLead)}</strong> demands to{' '}
            {DEMAND_LABEL[crisis.demand] ?? crisis.demand.replaceAll('_', ' ')};{' '}
            <strong>{name(crisis.defenderLead)}</strong> resists.
          </p>
          <dl className="ledger-grid">
            <div>
              <dt>Temperature</dt>
              <dd className={crisis.temperature >= 70 ? 'status-danger' : undefined}>
                {crisis.temperature.toFixed(0)} / 100
              </dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>Day {crisis.deadlineDay} ({Math.max(0, crisis.deadlineDay - snapshot.day)} days)</dd>
            </div>
            <div>
              <dt>Pressing side</dt>
              <dd>{tags(crisis.attackerBackers)}</dd>
            </div>
            <div>
              <dt>Resisting side</dt>
              <dd>{tags(crisis.defenderBackers)}</dd>
            </div>
            {showdown ? (
              <>
                <div>
                  <dt>Attacker power</dt>
                  <dd>{showdown.attackerPower.toFixed(0)}</dd>
                </div>
                <div>
                  <dt>Defender power</dt>
                  <dd>{showdown.defenderPower.toFixed(0)}</dd>
                </div>
                <div>
                  <dt>Power ratio</dt>
                  <dd>
                    <TraceTooltip
                      value={showdown.powerRatio.toFixed(2)}
                      trace={[
                        { label: 'Attacker / defender', value: showdown.powerRatio },
                        { label: 'Congress threshold', value: showdown.showdownThreshold },
                      ]}
                    />
                    {' '}(need {showdown.showdownThreshold.toFixed(2)}× for congress)
                  </dd>
                </div>
                <div>
                  <dt>If showdown now</dt>
                  <dd className={showdown.forecast === 'war' ? 'status-danger' : 'status-positive'}>
                    {forecastLabel(showdown.forecast)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="panel-subtle">
            At the showdown, a clearly stronger bloc forces a congress settlement; balanced blocs go to war.
            {playerSide ? ` You are backing the ${playerSide === 'attacker' ? 'pressing' : 'resisting'} side.` : ''}
            {showdown?.peacefulContainmentLimited
              ? ' Peaceful containment humiliates prestige only — full GP demotion requires war.'
              : ''}
          </p>
          <div className="diplo-action-row">
            {playerIsGp && !playerSide ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => sendCommand({ t: 'crisisBackSide', crisis: crisis.id, side: 'attacker' })}
                >
                  Back {name(crisis.attackerLead)}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => sendCommand({ t: 'crisisBackSide', crisis: crisis.id, side: 'defender' })}
                >
                  Back {name(crisis.defenderLead)}
                </button>
              </>
            ) : null}
            {playerIsLead ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={playerPressed}
                  title={
                    showdown
                      ? `Temperature → ${showdown.pressTempAfter.toFixed(0)}; blocks AI-style early fold; accelerates showdown`
                      : undefined
                  }
                  onClick={() => sendCommand({ t: 'crisisPressDemand', crisis: crisis.id })}
                >
                  {playerPressed
                    ? 'Demand Pressed'
                    : `Press the Demand (+${showdown?.pressTemperature ?? 18} temp)`}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  title={
                    showdown
                      ? playerIsAttackerLead
                        ? `You concede: opponent +${showdown.backDownWinnerLeadPrestige} prestige, you −${showdown.backDownLoserLeadPrestige}; demand withdrawn`
                        : `You concede: opponent +${showdown.backDownWinnerLeadPrestige} prestige, you −${showdown.backDownLoserLeadPrestige}; demand enforced`
                      : undefined
                  }
                  onClick={() => sendCommand({ t: 'crisisBackDown', crisis: crisis.id })}
                >
                  Back Down (−{showdown?.backDownLoserLeadPrestige.toFixed(0) ?? '?'} prestige)
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <p className="panel-subtle">
            No active crisis. {tension >= 35 ? 'Flashpoints are smoldering — a crisis may erupt any month.' : 'The chancelleries are quiet.'}
          </p>
          {candidates.length > 0 ? (
            <>
              <h3 className="atlas-heading panel-small-heading">Smoldering Flashpoints</h3>
              <ul className="panel-list">
                {candidates.map((candidate) => (
                  <li key={`${candidate.type}-${candidate.subject}-${candidate.attackerLead}`}>
                    <strong>{CRISIS_TYPE_LABEL[candidate.type] ?? candidate.type}</strong>
                    <span>
                      {' '}over {name(candidate.subject)} — {name(candidate.attackerLead)} vs {name(candidate.defenderLead)}
                      {' '}(score {candidate.score.toFixed(0)})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <h3 className="atlas-heading panel-small-heading">Congress Ledger</h3>
      {history.length === 0 ? (
        <p className="panel-subtle">No crises resolved yet this century.</p>
      ) : (
        <ul className="panel-list crisis-history">
          {history.map((record) => (
            <li key={`${record.id}-${record.day}`}>
              <div>
                <strong>{record.name}</strong>
                <span>
                  {record.outcome === 'congress'
                    ? `Settled peacefully — ${name(record.winnerLead)} prevailed over ${name(record.loserLead)}.`
                    : record.outcome === 'war'
                      ? 'Diplomacy failed — war.'
                      : 'Fizzled.'}
                  {' '}{record.detail}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
