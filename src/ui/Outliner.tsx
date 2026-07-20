import { useMemo } from 'react';
import { useStore } from '../store';

export function Outliner() {
  const snapshot = useStore((state) => state.snapshot);
  const alerts = useStore((state) => state.alerts);
  const dismissAlert = useStore((state) => state.dismissAlert);
  const openPanelId = useStore((state) => state.openPanelId);

  const playerItems = useMemo(() => {
    if (!snapshot) return { armies: 0, fleets: 0, wars: 0 };
    return {
      armies: snapshot.armies.filter((army) => army.owner === snapshot.playerNation && !army.rebel).length,
      fleets: snapshot.fleets.filter((fleet) => fleet.owner === snapshot.playerNation).length,
      wars: snapshot.wars.filter((war) => war.attackers.includes(snapshot.playerNation) || war.defenders.includes(snapshot.playerNation)).length,
    };
  }, [snapshot]);

  return (
    <aside className="outliner atlas-panel">
      <h3 className="atlas-heading">Outliner</h3>
      <p>Armies {playerItems.armies} | Fleets {playerItems.fleets} | Wars {playerItems.wars}</p>
      <ul className="outliner-alerts">
        {alerts.slice().reverse().map((alert) => (
          <li key={alert.id}>
            <button
              type="button"
              className="outliner-alert-action"
              onClick={() => alert.panel && openPanelId(alert.panel)}
            >
              <span>{alert.message}</span>
              {alert.suggestion ? <small>{alert.suggestion}</small> : null}
            </button>
            <button type="button" aria-label="Dismiss alert" onClick={() => dismissAlert(alert.id)}>x</button>
          </li>
        ))}
        {alerts.length === 0 ? <li><span>No active alerts</span></li> : null}
      </ul>
    </aside>
  );
}

