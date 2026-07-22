import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

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
  const topAgitation = snapshot.playerReformAgitation.slice(0, 3);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Population Census</h2>
      <p className="panel-subtle">National pop totals by class, with needs, militancy, and agitation pressure.</p>

      <dl className="ledger-grid">
        <div>
          <dt>Total Population</dt>
          <dd>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</dd>
        </div>
        <div>
          <dt>Pop Classes</dt>
          <dd>{snapshot.playerPopulation.length}</dd>
        </div>
      </dl>

      <h3 className="atlas-heading panel-small-heading">Top Agitation</h3>
      {topAgitation.length === 0 ? (
        <p className="panel-subtle status-positive">Reform pressure is currently low.</p>
      ) : (
        <ul className="panel-list">
          {topAgitation.map((entry) => (
            <li key={entry.reform}>
              <span>{entry.reform.replaceAll('_', ' ')}</span>
              <span className={entry.support >= 0.4 ? 'unrest' : undefined}>{pct(entry.support)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Classes</h3>
      <ul className="panel-list population-list">
        {snapshot.playerPopulation.map((entry) => (
          <li key={entry.type}>
            <div>
              <strong>{entry.type}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span>{entry.dominantIdeology}</span>
              <span>
                Needs{' '}
                <TraceTooltip
                  value={pct(entry.avgNeedsMet)}
                  trace={[
                    { label: 'Life needs', value: entry.avgLifeNeeds ?? entry.avgNeedsMet },
                    { label: 'Everyday needs', value: entry.avgEverydayNeeds ?? entry.avgNeedsMet },
                    { label: 'Luxury needs', value: entry.avgLuxuryNeeds ?? 1 },
                    { label: 'Welfare score', value: entry.avgNeedsMet },
                    ...(entry.scarceGoods ?? []).map((good) => ({
                      label: `Scarce: ${good.name}`,
                      value: good.fill,
                    })),
                  ]}
                />
              </span>
              <span className={entry.avgMilitancy >= 4 ? 'unrest' : undefined}>
                Mil{' '}
                <TraceTooltip
                  value={entry.avgMilitancy.toFixed(2)}
                  trace={[
                    { label: 'Average militancy', value: entry.avgMilitancy },
                    { label: 'Needs met', value: entry.avgNeedsMet },
                    { label: 'Reform demands', value: entry.agitatingFor.length },
                    { label: 'Population size', value: entry.size },
                  ]}
                />
              </span>
              <span>
                Con{' '}
                <TraceTooltip
                  value={entry.avgConsciousness.toFixed(2)}
                  trace={entry.consciousnessDrivers ?? [
                    { label: 'Average consciousness', value: entry.avgConsciousness },
                    { label: 'Needs met', value: entry.avgNeedsMet },
                  ]}
                />
              </span>
              <span className={entry.agitatingFor.length > 0 ? 'unrest' : undefined}>
                {entry.agitatingFor.length > 0
                  ? `Agitating: ${entry.agitatingFor.map((reform) => reform.replaceAll('_', ' ')).join(', ')}`
                  : 'Agitating: none'}
              </span>
              <span className={entry.growth >= 0 ? 'positive' : 'negative'}>
                Growth{' '}
                <TraceTooltip
                  value={`${entry.growth >= 0 ? '+' : ''}${entry.growth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  trace={entry.growthDrivers ?? [
                    { label: 'Monthly growth', value: entry.growth },
                    { label: 'Population size', value: entry.size },
                  ]}
                />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
