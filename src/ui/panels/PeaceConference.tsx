import { useEffect, useMemo, useState } from 'react';
import { WORLD_SEED } from '../../data/generated';
import type { War } from '../../shared/types';
import { useStore } from '../../store';

interface PeaceConferenceProps {
  war: War;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Mirror war.ts offerPeaceTerms acceptanceBudget + counter selection. */
function computePeaceAcceptance(war: War, playerIsAttacker: boolean, goalsToEnforce: number[]): {
  acceptanceBudget: number;
  counterGoals: number[];
  needed: number;
} {
  const available = playerIsAttacker ? war.score : -war.score;
  const receiverExhaustion = playerIsAttacker ? war.defenderExhaustion : war.attackerExhaustion;
  const offeringExhaustion = playerIsAttacker ? war.attackerExhaustion : war.defenderExhaustion;
  const acceptanceBudget = clamp(available + receiverExhaustion * 0.55 - offeringExhaustion * 0.2, 0, 140);
  const requested = goalsToEnforce
    .map((index) => war.goals[index])
    .filter((goal): goal is War['goals'][number] => Boolean(goal))
    .filter((goal) => (playerIsAttacker ? war.attackers.includes(goal.holder) : war.defenders.includes(goal.holder)));
  const needed = requested.reduce((sum, goal) => sum + Math.max(0, goal.scoreValue), 0);

  const candidateIndices = Array.from(
    new Set(goalsToEnforce.filter((index) => index >= 0 && index < war.goals.length)),
  ).sort((a, b) => a - b);
  const sorted = candidateIndices
    .map((index) => ({ index, cost: Math.max(0, war.goals[index]?.scoreValue ?? 0) }))
    .filter((entry) => entry.cost > 0)
    .sort((a, b) => b.cost - a.cost || a.index - b.index);
  let running = 0;
  const counterGoals: number[] = [];
  for (const entry of sorted) {
    if (running + entry.cost > acceptanceBudget) continue;
    running += entry.cost;
    counterGoals.push(entry.index);
  }
  counterGoals.sort((a, b) => a - b);
  return { acceptanceBudget, counterGoals, needed };
}

function warGoalLabel(goal: War['goals'][number], stateNameById: Map<number, string>): string {
  const statePart = goal.stateId >= 0 ? ` - ${stateNameById.get(goal.stateId) ?? `State ${goal.stateId}`}` : '';
  return `${goal.type.replaceAll('_', ' ')}${statePart}`;
}

export function PeaceConference({ war }: PeaceConferenceProps) {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const [selectedGoals, setSelectedGoals] = useState<number[]>([]);
  const stateNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.states.map((state) => [state.id, state.name]))
  ), []);

  useEffect(() => {
    setSelectedGoals([]);
  }, [war.id]);

  if (!snapshot) return null;
  const playerNation = snapshot.playerNation;
  const playerIsAttacker = war.attackers.includes(playerNation);
  const playerIsDefender = war.defenders.includes(playerNation);
  if (!playerIsAttacker && !playerIsDefender) return null;

  const winningSideIsAttackers = war.score >= 0;
  const winningSide = winningSideIsAttackers ? war.attackers : war.defenders;
  const playerScore = playerIsAttacker ? war.score : -war.score;
  const maxSpend = Math.max(0, playerScore);
  const enforceableGoals = war.goals
    .map((goal, index) => ({ goal, index }))
    .filter((entry) => (playerIsAttacker ? war.attackers.includes(entry.goal.holder) : war.defenders.includes(entry.goal.holder)));
  const winningGoals = war.goals
    .map((goal, index) => ({ goal, index }))
    .filter((entry) => winningSide.includes(entry.goal.holder));
  const selectedCost = selectedGoals.reduce((sum, index) => sum + Math.max(0, war.goals[index]?.scoreValue ?? 0), 0);
  const overBudget = selectedCost > maxSpend + 1e-6;
  const playerWinning = winningSide.includes(playerNation);

  const { acceptanceBudget, counterGoals, needed } = computePeaceAcceptance(war, playerIsAttacker, selectedGoals);
  const overAcceptance = selectedGoals.length > 0 && needed > acceptanceBudget + 2;
  const counterCost = counterGoals.reduce((sum, index) => sum + Math.max(0, war.goals[index]?.scoreValue ?? 0), 0);
  const canAcceptCounter = overAcceptance && counterGoals.length > 0;

  return (
    <section className="peace-conference">
      <h4 className="atlas-heading panel-small-heading">Peace Conference</h4>
      <p className="panel-subtle">
        Warscore (your side): {playerScore.toFixed(1)} | Remaining: {(maxSpend - selectedCost).toFixed(1)}
        {' '}| Acceptance budget: {acceptanceBudget.toFixed(1)}
      </p>
      <p className="panel-subtle">
        Winning side: {winningSide.map((id) => snapshot.nations.find((nation) => nation.id === id)?.tag ?? id).join(', ')}
      </p>
      <ul className="panel-list peace-conference__goals">
        {winningGoals.map((entry) => {
          const checked = selectedGoals.includes(entry.index);
          const selectable = enforceableGoals.some((candidate) => candidate.index === entry.index);
          return (
            <li key={`${war.id}-goal-${entry.index}`}>
              <label className={!selectable ? 'is-disabled' : undefined}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!selectable}
                  onChange={(event) => {
                    setSelectedGoals((prev) => {
                      if (event.target.checked) return [...prev, entry.index].sort((a, b) => a - b);
                      return prev.filter((value) => value !== entry.index);
                    });
                  }}
                />
                <span>{warGoalLabel(entry.goal, stateNameById)}</span>
                <strong>{entry.goal.scoreValue.toFixed(1)}</strong>
              </label>
            </li>
          );
        })}
      </ul>
      {!playerWinning ? (
        <p className="panel-subtle">
          Your side is not currently winning this war. White peace costs prestige unless exhaustion is mutual or warscore is near zero.
        </p>
      ) : null}
      {overAcceptance ? (
        <p className="panel-subtle status-danger">
          Bundle exceeds acceptance budget ({needed.toFixed(1)} &gt; {acceptanceBudget.toFixed(1)}).
          {counterGoals.length > 0
            ? ` Counter-offer: ${counterGoals.length} goal(s) for ${counterCost.toFixed(1)}.`
            : ' Opponent will only accept white peace.'}
        </p>
      ) : null}
      <div className="mil-actions">
        <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'offerPeace', war: war.id, goalsToEnforce: [] })}>
          White Peace
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={selectedGoals.length === 0 || overBudget || overAcceptance}
          onClick={() => sendCommand({ t: 'offerPeace', war: war.id, goalsToEnforce: selectedGoals })}
        >
          Enforce Bundle
        </button>
        {canAcceptCounter ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setSelectedGoals(counterGoals);
              sendCommand({ t: 'offerPeace', war: war.id, goalsToEnforce: counterGoals });
            }}
          >
            Accept Counter ({counterGoals.length})
          </button>
        ) : null}
      </div>
      {overBudget ? <p className="panel-subtle status-danger">Selected bundle exceeds available warscore.</p> : null}
    </section>
  );
}
