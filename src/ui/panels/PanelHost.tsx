import { useStore, type PanelId } from '../../store';
import { BudgetPanel } from './BudgetPanel';
import { MarketPanel } from './MarketPanel';
import { PopulationPanel } from './PopulationPanel';
import { CulturePanel } from './CulturePanel';
import { ProductionPanel } from './ProductionPanel';
import { ProvincePanel } from './ProvincePanel';
import { PoliticsPanel } from './PoliticsPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { GreatPowersPanel } from './GreatPowersPanel';
import { CrisisPanel } from './CrisisPanel';
import { MilitaryPanel } from './MilitaryPanel';
import { ColonizationPanel } from './ColonizationPanel';
import { SaveLoadPanel } from './SaveLoadPanel';
import { FormablesPanel } from './FormablesPanel';
import { DecisionsPanel } from './DecisionsPanel';
import { TechnologyPanel } from './TechnologyPanel';
import { NationFlag } from '../components/NationFlag';
import './panels.css';

const PANEL_TITLES: Record<Exclude<PanelId, null>, string> = {
  province: 'Province',
  budget: 'Budget',
  production: 'Production',
  population: 'Population',
  cultures: 'Cultures',
  market: 'Market',
  politics: 'Politics',
  diplomacy: 'Diplomacy',
  great_powers: 'Great Powers & the Concert',
  formables: 'Formables',
  decisions: 'Decisions',
  military: 'Military',
  colonization: 'Colonization',
  save_load: 'Save / Load',
  technology: 'Technology',
};

/** Panels that show a nation shield in the chrome header. */
const NATION_SCOPED_PANELS = new Set<PanelId>([
  'province', 'budget', 'production', 'population', 'cultures', 'market', 'politics',
  'diplomacy', 'great_powers', 'military', 'colonization', 'technology',
  'formables', 'decisions',
]);

export function PanelHost() {
  const openPanel = useStore((state) => state.openPanel);
  const openPanelId = useStore((state) => state.openPanelId);
  const snapshot = useStore((state) => state.snapshot);

  if (!openPanel) return null;

  const playerNation = snapshot
    ? snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null
    : null;
  const showShield = NATION_SCOPED_PANELS.has(openPanel) && playerNation;

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
          <div className="panel-host__chrome-title-row">
            {showShield ? (
              <NationFlag tag={playerNation.tag} color={playerNation.color} size={18} />
            ) : null}
            <p className="panel-host__chrome-title">{PANEL_TITLES[openPanel]}</p>
          </div>
          <button type="button" className="panel-host__close" onClick={() => openPanelId(null)}>Done</button>
        </header>
        <div className="panel-host__body">
          {openPanel === 'province' ? <ProvincePanel /> : null}
          {openPanel === 'budget' ? <BudgetPanel /> : null}
          {openPanel === 'population' ? <PopulationPanel /> : null}
          {openPanel === 'cultures' ? <CulturePanel /> : null}
          {openPanel === 'production' ? <ProductionPanel /> : null}
          {openPanel === 'market' ? <MarketPanel /> : null}
          {openPanel === 'politics' ? <PoliticsPanel /> : null}
          {openPanel === 'diplomacy' ? <DiplomacyPanel /> : null}
          {openPanel === 'great_powers' ? <CrisisPanel /> : null}
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
