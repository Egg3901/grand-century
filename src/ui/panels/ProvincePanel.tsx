import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

export function ProvincePanel() {
  const detail = useStore((state) => state.provinceDetail);
  const selectedProvince = useStore((state) => state.selectedProvince);
  const snapshot = useStore((state) => state.snapshot);

  if (selectedProvince === null) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Province</h2>
        <p>Select a province on the map to inspect it.</p>
      </section>
    );
  }

  if (!detail || detail.id !== selectedProvince) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Province</h2>
        <p>Loading province dossier...</p>
      </section>
    );
  }

  const ownerName = snapshot?.nations.find((nation) => nation.id === detail.owner)?.name ?? 'Unknown';
  const provinceSummary = snapshot?.provinces[detail.id];
  const population = provinceSummary?.population ?? detail.pops.reduce((sum, pop) => sum + pop.size, 0);

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">{detail.name}</h2>
      <p className="panel-subtle">Provincial dossier for the selected map tile.</p>

      <dl className="ledger-grid">
        <div>
          <dt>Owner</dt>
          <dd>{ownerName}</dd>
        </div>
        <div>
          <dt>Population</dt>
          <dd>
            <TraceTooltip
              value={population.toLocaleString()}
              trace={detail.pops.map((pop) => ({ label: pop.type, value: pop.size }))}
            />
          </dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd>{detail.terrain}</dd>
        </div>
        <div>
          <dt>RGO</dt>
          <dd>{detail.rgo.recipe.replace('rgo_', '').replace('_', ' ')}</dd>
        </div>
        <div>
          <dt>Fort</dt>
          <dd>{detail.fortLevel}</dd>
        </div>
        <div>
          <dt>Naval Base</dt>
          <dd>{detail.navalBaseLevel}</dd>
        </div>
        {provinceSummary ? (
          <div>
            <dt>Militancy</dt>
            <dd className={provinceSummary.militancy >= 4 ? 'unrest' : undefined}>
              <TraceTooltip
                value={provinceSummary.militancy.toFixed(2)}
                trace={[
                  { label: 'Unrest risk', value: provinceSummary.unrestRisk },
                  { label: 'Needs met', value: provinceSummary.needsMet },
                ]}
              />
            </dd>
          </div>
        ) : null}
      </dl>

      <h3 className="atlas-heading panel-small-heading">Population</h3>
      <ul className="panel-list">
        {detail.pops.map((pop) => (
          <li key={pop.type}>
            <span>{pop.type}</span>
            <span>{pop.size.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
