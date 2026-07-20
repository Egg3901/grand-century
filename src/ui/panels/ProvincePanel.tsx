import { useStore } from '../../store';

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
      <p className="panel-subtle">Owner: {ownerName}</p>
      <p className="panel-subtle">Population: {population.toLocaleString()}</p>
      <p className="panel-subtle">Terrain: {detail.terrain}</p>
      <p className="panel-subtle">RGO: {detail.rgo.recipe.replace('rgo_', '').replace('_', ' ')}</p>
      <p className="panel-subtle">Fort: {detail.fortLevel} | Naval Base: {detail.navalBaseLevel}</p>
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
