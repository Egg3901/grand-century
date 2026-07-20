import { useStore } from '../../store';

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

export function PopulationPanel() {
  const snapshot = useStore((state) => state.snapshot);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Population</h2>
        <p>Awaiting census data...</p>
      </section>
    );
  }

  const total = snapshot.playerPopulation.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Population</h2>
      <p className="panel-subtle">Player population: {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      <ul className="panel-list population-list">
        {snapshot.playerPopulation.map((entry) => (
          <li key={entry.type}>
            <div>
              <strong>{entry.type}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span>Needs {pct(entry.avgNeedsMet)}</span>
              <span>Mil {entry.avgMilitancy.toFixed(2)}</span>
              <span className={entry.growth >= 0 ? 'positive' : 'negative'}>
                Growth {entry.growth >= 0 ? '+' : ''}{entry.growth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
