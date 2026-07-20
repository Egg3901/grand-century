import { useStore } from '../../store';

export function ProvincePanel() {
  const detail = useStore((state) => state.provinceDetail);
  const selectedProvince = useStore((state) => state.selectedProvince);

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

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">{detail.name}</h2>
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
