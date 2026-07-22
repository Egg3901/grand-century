import { useEffect, useMemo, useState } from 'react';
import { WORLD_SEED } from '../../data/generated';
import type { NationId, WarGoalType } from '../../shared/types';
import { useStore } from '../../store';
import { NationFlag } from '../components/NationFlag';
import { TraceTooltip } from '../components/TraceTooltip';

const WAR_GOALS: { id: WarGoalType; label: string }[] = [
  { id: 'annex_state', label: 'Annex State' },
  { id: 'liberate_state', label: 'Liberate State' },
  { id: 'humiliate', label: 'Humiliate' },
  { id: 'add_to_sphere', label: 'Add To Sphere' },
  { id: 'take_colony', label: 'Take Colony' },
  { id: 'cut_down_to_size', label: 'Cut Down To Size' },
];

const STATELESS_GOALS = new Set<WarGoalType>(['humiliate', 'cut_down_to_size', 'add_to_sphere']);

function relationLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}

export function DiplomacyPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const [filter, setFilter] = useState<'all' | 'neighbors' | 'gp'>('neighbors');
  const [selectedGoal, setSelectedGoal] = useState<WarGoalType>('humiliate');
  const [selectedTarget, setSelectedTarget] = useState<NationId | null>(null);
  const diploFocusNation = useStore((state) => state.diploFocusNation);
  const clearDiploFocus = useStore((state) => state.clearDiploFocus);
  useEffect(() => {
    if (diploFocusNation === null) return;
    setSelectedTarget(diploFocusNation);
    setFilter('all'); // the tapped nation may not be a neighbor or GP
    clearDiploFocus();
  }, [diploFocusNation, clearDiploFocus]);
  const [selectedState, setSelectedState] = useState<number>(-1);

  const provinceSeedById = useMemo(() => (
    new Map<number, { neighbors: number[] }>(WORLD_SEED.provinces.map((province) => [province.id, { neighbors: province.neighbors }]))
  ), []);
  const stateNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.states.map((state) => [state.id, state.name]))
  ), []);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const nationById = new Map(snapshot.nations.map((nation) => [nation.id, nation]));
    const ownerByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.owner]));
    const playerNeighbors = new Set<number>();

    for (const province of snapshot.provinces) {
      if (province.owner !== snapshot.playerNation) continue;
      const seed = provinceSeedById.get(province.id);
      if (!seed) continue;
      for (const neighborId of seed.neighbors) {
        const neighborOwner = ownerByProvince.get(neighborId);
        if (neighborOwner === undefined || neighborOwner === snapshot.playerNation) continue;
        playerNeighbors.add(neighborOwner);
      }
    }

    const relationsByNation = new Map<number, { kind: string; opinion: number; expiresDay: number }>();
    for (const relation of snapshot.relations) {
      if (relation.a === snapshot.playerNation) {
        relationsByNation.set(relation.b, { kind: relation.kind, opinion: relation.opinion, expiresDay: relation.expiresDay });
      } else if (relation.b === snapshot.playerNation) {
        relationsByNation.set(relation.a, { kind: relation.kind, opinion: relation.opinion, expiresDay: relation.expiresDay });
      }
    }

    const rows = snapshot.nations
      .filter((nation) => nation.id !== snapshot.playerNation)
      .filter((nation) => {
        if (filter === 'gp') return nation.gpRank > 0;
        if (filter === 'neighbors') return playerNeighbors.has(nation.id) || nation.gpRank > 0;
        return true;
      })
      .map((nation) => {
        const relation = relationsByNation.get(nation.id) ?? { kind: 'neutral', opinion: 0, expiresDay: -1 };
        return {
          nation,
          relation,
          isNeighbor: playerNeighbors.has(nation.id),
        };
      })
      .sort((a, b) => b.relation.opinion - a.relation.opinion || a.nation.name.localeCompare(b.nation.name));

    return { nationById, rows };
  }, [filter, provinceSeedById, snapshot]);

  if (!snapshot || !derived) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Diplomacy</h2>
        <p>Summoning envoys...</p>
      </section>
    );
  }

  const playerNation = derived.nationById.get(snapshot.playerNation);
  const playerInfamy = playerNation?.infamy ?? 0;
  const targetId = selectedTarget ?? derived.rows[0]?.nation.id ?? null;
  const targetRelation = targetId !== null
    ? derived.rows.find((row) => row.nation.id === targetId)?.relation ?? { kind: 'neutral', opinion: 0, expiresDay: -1 }
    : { kind: 'neutral', opinion: 0, expiresDay: -1 };
  const targetStateIds = targetId === null
    ? []
    : Array.from(new Set(snapshot.provinces.filter((province) => province.owner === targetId).map((province) => province.stateId))).sort((a, b) => a - b);
  const effectiveState = STATELESS_GOALS.has(selectedGoal) ? -1 : (selectedState >= 0 ? selectedState : targetStateIds[0] ?? -1);
  const stateRequiredMissing = !STATELESS_GOALS.has(selectedGoal) && effectiveState < 0;
  const matchingCb = snapshot.playerCbs.find((cb) => (
    cb.target === targetId
    && cb.goal === selectedGoal
    && (cb.stateId === -1 || cb.stateId === effectiveState)
  ));
  const projectedInfamy = matchingCb
    ? matchingCb.infamyCost
    : (snapshot.warGoalInfamyUse?.[selectedGoal] ?? 0) * 1.75;
  const truceBlocks = targetRelation.kind === 'truce' && (targetRelation.expiresDay < 0 || targetRelation.expiresDay > snapshot.day);
  const alliancePreview = targetId !== null
    ? (snapshot.playerAlliancePreviews ?? []).find((entry) => entry.target === targetId) ?? null
    : null;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Diplomacy</h2>
      <p className={`panel-subtle ${playerInfamy >= snapshot.infamyLimit ? 'status-danger' : ''}`}>
        Infamy{' '}
        <TraceTooltip
          value={playerInfamy.toFixed(1)}
          trace={[
            { label: 'Current infamy', value: playerInfamy },
            { label: 'Limit', value: snapshot.infamyLimit },
            { label: 'Projected declaration cost', value: projectedInfamy },
          ]}
        />{' '}
        / {snapshot.infamyLimit.toFixed(1)}
        {playerInfamy >= snapshot.infamyLimit ? ' - Warning: containment coalitions are likely.' : ''}
      </p>
      <p className="panel-subtle">
        Diplomatic points{' '}
        <TraceTooltip
          value={(snapshot.playerDiplomaticPoints ?? 0).toFixed(1)}
          trace={[
            { label: 'Current points', value: snapshot.playerDiplomaticPoints ?? 0 },
            { label: 'Cap', value: 120 },
            { label: `Fabricate ${selectedGoal} cost`, value: snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0 },
          ]}
        />
        {' '}/ 120
        {' — '}
        Fabricate cost for {WAR_GOALS.find((g) => g.id === selectedGoal)?.label ?? selectedGoal}:{' '}
        {(snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0).toFixed(1)} DP
      </p>
      {matchingCb?.origin === 'core_claim' ? (
        <p className="panel-subtle status-positive">
          Irredentist claim — this state is one of our historic cores, held by a foreign power.
          No fabrication needed, and infamy is discounted for reclaiming our own land.
        </p>
      ) : null}
      {alliancePreview ? (
        <p className={`panel-subtle ${alliancePreview.accepted ? 'status-positive' : 'status-danger'}`}>
          Alliance preview vs target: score {alliancePreview.score.toFixed(0)}
          {alliancePreview.accepted ? ' (likely accept, need ≥70)' : ' (likely reject, need ≥70)'}
        </p>
      ) : null}
      {snapshot.coalitionAgainstPlayer.length > 0 ? (
        <p className="panel-subtle status-danger">
          Coalition risk: {snapshot.coalitionAgainstPlayer.map((nationId) => derived.nationById.get(nationId)?.tag ?? nationId).join(', ')}
        </p>
      ) : null}

      <div className="diplo-controls">
        <label>
          Filter
          <select className="gc-select" value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'neighbors' | 'gp')}>
            <option value="neighbors">Neighbors + GPs</option>
            <option value="gp">Great Powers</option>
            <option value="all">All Nations</option>
          </select>
        </label>
        <label>
          War Target
          <select
            className="gc-select"
            value={targetId ?? -1}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSelectedTarget(next >= 0 ? next : null);
            }}
          >
            {derived.rows.map((row) => (
              <option key={row.nation.id} value={row.nation.id}>
                {row.nation.tag} — {row.nation.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          War Goal
          <select className="gc-select" value={selectedGoal} onChange={(event) => setSelectedGoal(event.target.value as WarGoalType)}>
            {WAR_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}
          </select>
        </label>
        <label>
          State
          <select
            className="gc-select"
            value={effectiveState}
            onChange={(event) => setSelectedState(Number(event.target.value))}
            disabled={STATELESS_GOALS.has(selectedGoal)}
          >
            {STATELESS_GOALS.has(selectedGoal) ? <option value={-1}>Not required</option> : null}
            {!STATELESS_GOALS.has(selectedGoal) ? targetStateIds.map((stateId) => (
              <option key={stateId} value={stateId}>
                {stateNameById.get(stateId) ?? `State ${stateId}`}
              </option>
            )) : null}
          </select>
        </label>
      </div>

      <p className="panel-subtle">
        {matchingCb
          ? `Valid CB ready until day ${matchingCb.expiresDay}. Using it costs +${matchingCb.infamyCost.toFixed(1)} infamy.`
          : `No valid CB selected. Declaration costs +${projectedInfamy.toFixed(1)} infamy.`}
      </p>

      {(snapshot.playerPendingCbs ?? []).length > 0 ? (
        <>
          <h3 className="atlas-heading panel-small-heading">Fabricating</h3>
          <ul className="panel-list">
            {(snapshot.playerPendingCbs ?? []).map((cb) => {
              const target = derived.nationById.get(cb.target);
              const goalLabel = WAR_GOALS.find((g) => g.id === cb.goal)?.label ?? cb.goal;
              const daysLeft = Math.max(0, cb.readyDay - snapshot.day);
              return (
                <li key={`${cb.target}-${cb.goal}-${cb.stateId}-${cb.readyDay}`}>
                  <strong>{goalLabel}</strong>
                  <span>
                    {' '}vs {target?.tag ?? cb.target}
                    {cb.stateId >= 0 ? ` (state ${stateNameById.get(cb.stateId) ?? cb.stateId})` : ''}
                    {' — '}ready day {cb.readyDay} ({daysLeft}d)
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div className="diplo-action-row">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={
            targetId === null
            || stateRequiredMissing
            || (snapshot.playerDiplomaticPoints ?? 0) < (snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0)
          }
          title={
            (snapshot.playerDiplomaticPoints ?? 0) < (snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0)
              ? `Need ${(snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0).toFixed(1)} diplomatic points`
              : undefined
          }
          onClick={() => targetId !== null && sendCommand({ t: 'fabricateCB', target: targetId, goal: selectedGoal, state: effectiveState })}
        >
          Fabricate CB ({(snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0).toFixed(0)} DP)
        </button>
        <button
          type="button"
          className="btn btn--primary"
          data-testid="diplo-declare-war"
          disabled={targetId === null || truceBlocks || stateRequiredMissing}
          onClick={() => targetId !== null && sendCommand({ t: 'declareWar', target: targetId, goal: selectedGoal, state: effectiveState })}
        >
          {truceBlocks ? 'Declare War (Truce Blocks)' : 'Declare War'}
        </button>
      </div>

      <h3 className="atlas-heading panel-small-heading">Relations</h3>
      <ul className="panel-list diplo-list">
        {derived.rows.map((row) => (
          <li key={row.nation.id}>
            <div className="diplo-row__nation">
              <NationFlag tag={row.nation.tag} color={row.nation.color} size={18} />
              <div>
                <strong>{row.nation.name}</strong>
                <span>
                  {row.relation.opinion.toFixed(0)} opinion | {relationLabel(row.relation.kind)}
                  {row.relation.expiresDay >= 0
                    ? ` | expires day ${row.relation.expiresDay}${row.relation.expiresDay > snapshot.day ? ` (${row.relation.expiresDay - snapshot.day}d)` : ' (expired)'}`
                    : ''}
                  {row.isNeighbor ? ' | neighbor' : ''}
                  {row.nation.gpRank > 0 ? ` | GP #${row.nation.gpRank}` : ''}
                </span>
              </div>
            </div>
            <div className="diplo-buttons">
              {(() => {
                const cancelKind = row.relation.kind === 'guarantee'
                  ? 'guarantee'
                  : row.relation.kind === 'rivalry'
                    ? 'rivalry'
                    : 'alliance';
                const canCancel = row.relation.kind === 'alliance' || row.relation.kind === 'guarantee' || row.relation.kind === 'rivalry';
                return (
                  <>
                    <button type="button" className="btn btn--secondary" onClick={() => setSelectedTarget(row.nation.id)}>Target</button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      title={
                        (() => {
                          const preview = (snapshot.playerAlliancePreviews ?? []).find((entry) => entry.target === row.nation.id);
                          if (!preview) return 'Propose alliance';
                          return preview.accepted
                            ? `Likely accept (score ${preview.score.toFixed(0)} ≥ 70)`
                            : `Likely reject (score ${preview.score.toFixed(0)} < 70)`;
                        })()
                      }
                      onClick={() => sendCommand({ t: 'proposeAlliance', target: row.nation.id })}
                    >
                      Alliance
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'offerGuarantee', target: row.nation.id })}>Guarantee</button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={
                        (snapshot.playerRivalryCount ?? 0) >= (snapshot.rivalryCap ?? 4)
                        || (snapshot.playerDiplomaticPoints ?? 0) < (snapshot.rivalryDpCost ?? 12)
                        || row.relation.kind === 'rivalry'
                      }
                      title={`Costs ${snapshot.rivalryDpCost ?? 12} DP · ${snapshot.playerRivalryCount ?? 0}/${snapshot.rivalryCap ?? 4} rivalries`}
                      onClick={() => sendCommand({ t: 'addRival', target: row.nation.id })}
                    >
                      Rival ({snapshot.rivalryDpCost ?? 12} DP)
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={!canCancel}
                      onClick={() => sendCommand({ t: 'cancelRelation', target: row.nation.id, kind: cancelKind })}
                    >
                      Cancel
                    </button>
                  </>
                );
              })()}
              {playerNation?.gpRank && playerNation.gpRank > 0 && row.nation.gpRank === 0 ? (
                <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'influenceNation', target: row.nation.id, spend: 1 })}>
                  Influence
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
