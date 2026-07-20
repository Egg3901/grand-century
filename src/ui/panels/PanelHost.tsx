import { useStore } from '../../store';
import { BudgetPanel } from './BudgetPanel';
import { MarketPanel } from './MarketPanel';
import { PopulationPanel } from './PopulationPanel';
import { ProductionPanel } from './ProductionPanel';
import { ProvincePanel } from './ProvincePanel';
import { PoliticsPanel } from './PoliticsPanel';
import './panels.css';

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">{title}</h2>
      <p>{body}</p>
    </section>
  );
}

export function PanelHost() {
  const openPanel = useStore((state) => state.openPanel);
  const snapshot = useStore((state) => state.snapshot);

  if (!openPanel) return null;

  return (
    <aside className="panel-host">
      {openPanel === 'province' ? <ProvincePanel /> : null}
      {openPanel === 'budget' ? <BudgetPanel /> : null}
      {openPanel === 'population' ? <PopulationPanel /> : null}
      {openPanel === 'production' ? <ProductionPanel /> : null}
      {openPanel === 'market' ? <MarketPanel /> : null}
      {openPanel === 'politics' ? <PoliticsPanel /> : null}
      {openPanel === 'diplomacy' ? (
        <PlaceholderPanel title="Diplomacy" body={`Active wars: ${snapshot?.wars.length ?? 0}`} />
      ) : null}
      {openPanel === 'military' ? (
        <PlaceholderPanel title="Military" body={`Armies: ${snapshot?.armies.length ?? 0} | Fleets: ${snapshot?.fleets.length ?? 0}`} />
      ) : null}
    </aside>
  );
}
