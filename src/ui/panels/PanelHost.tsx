import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { useStore, type PanelId } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { NationFlag } from '../components/NationFlag';
import { resolvePanelChromeNation } from './panelChromeNation';
import './panels.css';

const loadProvincePanel = () => import('./ProvincePanel').then((m) => ({ default: m.ProvincePanel }));
const loadBudgetPanel = () => import('./BudgetPanel').then((m) => ({ default: m.BudgetPanel }));
const loadPopulationPanel = () => import('./PopulationPanel').then((m) => ({ default: m.PopulationPanel }));
const loadCulturePanel = () => import('./CulturePanel').then((m) => ({ default: m.CulturePanel }));
const loadProductionPanel = () => import('./ProductionPanel').then((m) => ({ default: m.ProductionPanel }));
const loadMarketPanel = () => import('./MarketPanel').then((m) => ({ default: m.MarketPanel }));
const loadPoliticsPanel = () => import('./PoliticsPanel').then((m) => ({ default: m.PoliticsPanel }));
const loadDiplomacyPanel = () => import('./DiplomacyPanel').then((m) => ({ default: m.DiplomacyPanel }));
const loadGreatPowersPanel = () => import('./GreatPowersPanel').then((m) => ({ default: m.GreatPowersPanel }));
const loadCrisisPanel = () => import('./CrisisPanel').then((m) => ({ default: m.CrisisPanel }));
const loadMilitaryPanel = () => import('./MilitaryPanel').then((m) => ({ default: m.MilitaryPanel }));
const loadColonizationPanel = () => import('./ColonizationPanel').then((m) => ({ default: m.ColonizationPanel }));
const loadFormablesPanel = () => import('./FormablesPanel').then((m) => ({ default: m.FormablesPanel }));
const loadDecisionsPanel = () => import('./DecisionsPanel').then((m) => ({ default: m.DecisionsPanel }));
const loadTechnologyPanel = () => import('./TechnologyPanel').then((m) => ({ default: m.TechnologyPanel }));
const loadSaveLoadPanel = () => import('./SaveLoadPanel').then((m) => ({ default: m.SaveLoadPanel }));

const ProvincePanel = lazy(loadProvincePanel);
const BudgetPanel = lazy(loadBudgetPanel);
const PopulationPanel = lazy(loadPopulationPanel);
const CulturePanel = lazy(loadCulturePanel);
const ProductionPanel = lazy(loadProductionPanel);
const MarketPanel = lazy(loadMarketPanel);
const PoliticsPanel = lazy(loadPoliticsPanel);
const DiplomacyPanel = lazy(loadDiplomacyPanel);
const GreatPowersPanel = lazy(loadGreatPowersPanel);
const CrisisPanel = lazy(loadCrisisPanel);
const MilitaryPanel = lazy(loadMilitaryPanel);
const ColonizationPanel = lazy(loadColonizationPanel);
const FormablesPanel = lazy(loadFormablesPanel);
const DecisionsPanel = lazy(loadDecisionsPanel);
const TechnologyPanel = lazy(loadTechnologyPanel);
const SaveLoadPanel = lazy(loadSaveLoadPanel);

/** Warm panel chunks after the HUD mounts so opening one does not wait on the network. */
const PANEL_WARMERS = [
  loadProvincePanel, loadBudgetPanel, loadPopulationPanel, loadCulturePanel,
  loadProductionPanel, loadMarketPanel, loadPoliticsPanel, loadDiplomacyPanel,
  loadGreatPowersPanel, loadCrisisPanel, loadMilitaryPanel, loadColonizationPanel,
  loadFormablesPanel, loadDecisionsPanel, loadTechnologyPanel, loadSaveLoadPanel,
];

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

/** Quiet placeholder — chrome stays mounted so the panel shell does not jump. */
function PanelBodyFallback() {
  return (
    <div className="panel-host__body-fallback" aria-busy="true" aria-label="Loading panel" />
  );
}

function LazyPanel({ Panel }: { Panel: ComponentType }) {
  return (
    <Suspense fallback={<PanelBodyFallback />}>
      <Panel />
    </Suspense>
  );
}

export function PanelHost() {
  const openPanel = useStore((state) => state.openPanel);
  const openPanelId = useStore((state) => state.openPanelId);
  const snapshot = useStore(useShallow((state) => state.snapshot));
  const selectedProvince = useStore((state) => state.selectedProvince);
  const provinceDetail = useStore((state) => state.provinceDetail);

  useEffect(() => {
    for (const warm of PANEL_WARMERS) void warm();
  }, []);

  if (!openPanel) return null;

  const chromeNation = NATION_SCOPED_PANELS.has(openPanel)
    ? resolvePanelChromeNation(openPanel, snapshot, selectedProvince, provinceDetail)
    : null;

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
            {chromeNation ? (
              <NationFlag tag={chromeNation.tag} color={chromeNation.color} size={18} />
            ) : null}
            <p className="panel-host__chrome-title">{PANEL_TITLES[openPanel]}</p>
          </div>
          <button type="button" className="panel-host__close" onClick={() => openPanelId(null)}>Done</button>
        </header>
        <div className="panel-host__body">
          {openPanel === 'province' ? <LazyPanel Panel={ProvincePanel} /> : null}
          {openPanel === 'budget' ? <LazyPanel Panel={BudgetPanel} /> : null}
          {openPanel === 'population' ? <LazyPanel Panel={PopulationPanel} /> : null}
          {openPanel === 'cultures' ? <LazyPanel Panel={CulturePanel} /> : null}
          {openPanel === 'production' ? <LazyPanel Panel={ProductionPanel} /> : null}
          {openPanel === 'market' ? <LazyPanel Panel={MarketPanel} /> : null}
          {openPanel === 'politics' ? <LazyPanel Panel={PoliticsPanel} /> : null}
          {openPanel === 'diplomacy' ? <LazyPanel Panel={DiplomacyPanel} /> : null}
          {openPanel === 'great_powers' ? (
            <Suspense fallback={<PanelBodyFallback />}>
              <CrisisPanel />
              <GreatPowersPanel />
            </Suspense>
          ) : null}
          {openPanel === 'military' ? <LazyPanel Panel={MilitaryPanel} /> : null}
          {openPanel === 'colonization' ? <LazyPanel Panel={ColonizationPanel} /> : null}
          {openPanel === 'formables' ? <LazyPanel Panel={FormablesPanel} /> : null}
          {openPanel === 'decisions' ? <LazyPanel Panel={DecisionsPanel} /> : null}
          {openPanel === 'technology' ? <LazyPanel Panel={TechnologyPanel} /> : null}
          {openPanel === 'save_load' ? <LazyPanel Panel={SaveLoadPanel} /> : null}
        </div>
      </aside>
    </>
  );
}
