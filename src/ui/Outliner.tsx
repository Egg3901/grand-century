import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useSnapshotFields } from './useSnapshotFields';
import { batchAlerts, OUTLINER_VISIBLE_CAP } from './alertBatching';
import { instantPressProps } from './instantPress';
import { AGENDA_FIELDS, deriveNationalAgenda } from './strategy/agenda';

export function Outliner() {
  const snapshot = useSnapshotFields([...AGENDA_FIELDS, 'fleets'] as const);
  const alerts = useStore((state) => state.alerts);
  const dismissAlert = useStore((state) => state.dismissAlert);
  const openPanelId = useStore((state) => state.openPanelId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const playerName = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((n) => n.id === snapshot.playerNation)?.name ?? null;
  }, [snapshot]);

  const playerItems = useMemo(() => {
    if (!snapshot) return { armies: 0, fleets: 0, wars: 0 };
    return {
      armies: snapshot.armies.filter((army) => army.owner === snapshot.playerNation && !army.rebel).length,
      fleets: snapshot.fleets.filter((fleet) => fleet.owner === snapshot.playerNation).length,
      wars: snapshot.wars.filter((war) => war.attackers.includes(snapshot.playerNation) || war.defenders.includes(snapshot.playerNation)).length,
    };
  }, [snapshot]);

  const batches = useMemo(
    () => batchAlerts(alerts, playerName).slice().reverse().slice(0, OUTLINER_VISIBLE_CAP),
    [alerts, playerName],
  );
  const agenda = useMemo(() => snapshot ? deriveNationalAgenda(snapshot) : null, [snapshot]);
  const topPriority = agenda?.priorities[0] ?? null;

  return (
    <aside className="outliner atlas-panel">
      <h3 className="atlas-heading">Outliner</h3>
      <p>Armies {playerItems.armies} | Fleets {playerItems.fleets} | Wars {playerItems.wars}</p>
      {topPriority ? (
        <button
          type="button"
          className={`outliner-priority is-${topPriority.tone}`}
          data-testid="outliner-priority"
          {...instantPressProps(() => openPanelId(topPriority.destination))}
        >
          <span>Cabinet priority</span>
          <strong>{topPriority.title}</strong>
          <small>{topPriority.action}</small>
        </button>
      ) : null}
      <ul className="outliner-alerts" data-testid="outliner-alerts">
        {batches.map((batch) => (
          <li key={batch.id} className={batch.prominent ? 'is-prominent' : 'is-quiet'} data-count={batch.count}>
            <button
              type="button"
              className="outliner-alert-action"
              {...instantPressProps(() => {
                if (batch.expandable) {
                  setExpandedId((id) => (id === batch.id ? null : batch.id));
                  return;
                }
                if (batch.panel) openPanelId(batch.panel);
              })}
            >
              <span>{batch.message}</span>
              {batch.count === 1 && batch.suggestion ? <small>{batch.suggestion}</small> : null}
              {batch.expandable ? <small>{expandedId === batch.id ? 'Tap to collapse' : 'Tap to expand'}</small> : null}
            </button>
            <button
              type="button"
              aria-label="Dismiss alert"
              {...instantPressProps(() => {
                for (const member of batch.members) dismissAlert(member.id);
              })}
            >
              x
            </button>
            {expandedId === batch.id ? (
              <ul className="outliner-alert-members">
                {batch.members.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="outliner-alert-action"
                      {...instantPressProps(() => member.panel && openPanelId(member.panel))}
                    >
                      {member.message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {batches.length === 0 ? <li><span>No active alerts</span></li> : null}
      </ul>
    </aside>
  );
}
