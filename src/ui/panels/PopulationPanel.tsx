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
      <p className="panel-subtle">
        Top agitation: {snapshot.playerReformAgitation.slice(0, 3).map((entry) => `${entry.reform.replaceAll('_', ' ')} ${pct(entry.support)}`).join(' | ') || 'Low'}
      </p>
      <ul className="panel-list population-list">
        {snapshot.playerPopulation.map((entry) => (
          <li key={entry.type}>
            <div>
              <strong>{entry.type}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span>{entry.dominantIdeology}</span>
              <span>Needs {pct(entry.avgNeedsMet)}</span>
              <span>Mil {entry.avgMilitancy.toFixed(2)}</span>
              <span>Con {entry.avgConsciousness.toFixed(2)}</span>
              <span>{entry.agitatingFor.length > 0 ? `Agitating: ${entry.agitatingFor.map((reform) => reform.replaceAll('_', ' ')).join(', ')}` : 'Agitating: none'}</span>
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
