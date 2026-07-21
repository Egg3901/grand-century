import { useStore, type PanelId } from '../../store';
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
import { DecisionsPanel } from './DecisionsPanel';
import { TechnologyPanel } from './TechnologyPanel';
import './panels.css';

const PANEL_TITLES: Record<Exclude<PanelId, null>, string> = {
  province: 'Province',
  budget: 'Budget',
  production: 'Production',
  population: 'Population',
  market: 'Market',
  politics: 'Politics',
  diplomacy: 'Diplomacy',
  great_powers: 'Great Powers',
  formables: 'Formables',
  decisions: 'Decisions',
  military: 'Military',
  colonization: 'Colonization',
  save_load: 'Save / Load',
  technology: 'Technology',
};

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
      <aside className="panel-host atlas-panel">
        <header className="panel-host__chrome">
          <p className="panel-host__chrome-title">{PANEL_TITLES[openPanel]}</p>
          <button type="button" className="panel-host__close" onClick={() => openPanelId(null)}>Done</button>
        </header>
        <div className="panel-host__body">
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
          {openPanel === 'decisions' ? <DecisionsPanel /> : null}
          {openPanel === 'technology' ? <TechnologyPanel /> : null}
          {openPanel === 'save_load' ? <SaveLoadPanel /> : null}
        </div>
      </aside>
    </>
  );
}
