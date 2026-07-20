import { useStore } from '../../store';
import { BudgetPanel } from './BudgetPanel';
import { MarketPanel } from './MarketPanel';
import { PopulationPanel } from './PopulationPanel';
import { ProductionPanel } from './ProductionPanel';
import { ProvincePanel } from './ProvincePanel';
import { PoliticsPanel } from './PoliticsPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { GreatPowersPanel } from './GreatPowersPanel';
import { MilitaryPanel } from './MilitaryPanel';
import { ColonizationPanel } from './ColonizationPanel';
import './panels.css';

export function PanelHost() {
  const openPanel = useStore((state) => state.openPanel);

  if (!openPanel) return null;

  return (
    <aside className="panel-host">
      {openPanel === 'province' ? <ProvincePanel /> : null}
      {openPanel === 'budget' ? <BudgetPanel /> : null}
      {openPanel === 'population' ? <PopulationPanel /> : null}
      {openPanel === 'production' ? <ProductionPanel /> : null}
      {openPanel === 'market' ? <MarketPanel /> : null}
      {openPanel === 'politics' ? <PoliticsPanel /> : null}
      {openPanel === 'diplomacy' ? <DiplomacyPanel /> : null}
      {openPanel === 'great_powers' ? <GreatPowersPanel /> : null}
      {openPanel === 'military' ? <MilitaryPanel /> : null}
      {openPanel === 'colonization' ? <ColonizationPanel /> : null}
    </aside>
  );
}
