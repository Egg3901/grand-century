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
import { SaveLoadPanel } from './SaveLoadPanel';
import { FormablesPanel } from './FormablesPanel';
import './panels.css';

export function PanelHost() {
  const openPanel = useStore((state) => state.openPanel);
  const openPanelId = useStore((state) => state.openPanelId);

  if (!openPanel) return null;

  return (
    <>
      <button
        type="button"
        className="panel-host-backdrop"
        aria-label="Close panel"
        onClick={() => openPanelId(null)}
      />
      <aside className="panel-host">
        <button type="button" className="panel-host__close" onClick={() => openPanelId(null)}>Done</button>
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
        {openPanel === 'formables' ? <FormablesPanel /> : null}
        {openPanel === 'save_load' ? <SaveLoadPanel /> : null}
      </aside>
    </>
  );
}
