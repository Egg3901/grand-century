import { useEffect, useMemo, useState } from 'react';
import { WORLD_SEED } from '../../data/generated';
import type { War } from '../../shared/types';
import { useStore } from '../../store';

interface PeaceConferenceProps {
  war: War;
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

  return (
    <section className="peace-conference">
      <h4 className="atlas-heading panel-small-heading">Peace Conference</h4>
      <p className="panel-subtle">
        Warscore (your side): {playerScore.toFixed(1)} | Remaining: {(maxSpend - selectedCost).toFixed(1)}
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
        <p className="panel-subtle">Your side is not currently winning this war. You can still propose white peace.</p>
      ) : null}
      <div className="mil-actions">
        <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'offerPeace', war: war.id, goalsToEnforce: [] })}>
          White Peace
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={selectedGoals.length === 0 || overBudget}
          onClick={() => sendCommand({ t: 'offerPeace', war: war.id, goalsToEnforce: selectedGoals })}
        >
          Enforce Bundle
        </button>
      </div>
      {overBudget ? <p className="panel-subtle status-danger">Selected bundle exceeds available warscore.</p> : null}
    </section>
  );
}
