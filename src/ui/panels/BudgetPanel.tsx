import { useStore } from '../../store';
import { BALANCE } from '../../sim/balance';
import { TraceTooltip } from '../components/TraceTooltip';

function formatMoney(value: number): string {
  return `${value < 0 ? '-' : ''}\u00a3${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function BudgetPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const budget = snapshot?.playerBudget;
  const player = snapshot?.nations.find((nation) => nation.id === snapshot.playerNation);

  if (!budget || !player) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Budget</h2>
        <p>Awaiting treasury data...</p>
      </section>
    );
  }

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Budget Ledger</h2>
      <div className="slider-grid">
        <label>
          <span>Poor Tax {(player.taxRatePoor * 100).toFixed(0)}%</span>
          <input
            type="range"
            className="gc-slider"
            data-coach-id="budget-tax-slider"
            min={0}
            max={1}
            step={0.01}
            value={player.taxRatePoor}
            onChange={(event) => sendCommand({ t: 'setTax', bracket: 'poor', rate: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Middle Tax {(player.taxRateMiddle * 100).toFixed(0)}%</span>
          <input
            type="range"
            className="gc-slider"
            min={0}
            max={1}
            step={0.01}
            value={player.taxRateMiddle}
            onChange={(event) => sendCommand({ t: 'setTax', bracket: 'middle', rate: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Rich Tax {(player.taxRateRich * 100).toFixed(0)}%</span>
          <input
            type="range"
            className="gc-slider"
            min={0}
            max={1}
            step={0.01}
            value={player.taxRateRich}
            onChange={(event) => sendCommand({ t: 'setTax', bracket: 'rich', rate: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Tariff {(player.tariffRate * 100).toFixed(0)}%</span>
          <input
            type="range"
            className="gc-slider"
            min={BALANCE.ai.minTariff}
            max={BALANCE.ai.maxTariff}
            step={0.01}
            value={player.tariffRate}
            onChange={(event) => sendCommand({ t: 'setTariff', rate: Number(event.target.value) })}
          />
        </label>
      </div>
      <dl className="ledger-grid">
        <div><dt>Tax Income</dt><dd><TraceTooltip value={formatMoney(budget.taxIncome)} trace={budget.trace.taxIncome} /></dd></div>
        <div><dt>Tariff Income</dt><dd><TraceTooltip value={formatMoney(budget.tariffIncome)} trace={budget.trace.tariffIncome} /></dd></div>
        <div><dt>Production</dt><dd><TraceTooltip value={formatMoney(budget.productionIncome)} trace={budget.trace.productionIncome} /></dd></div>
        <div><dt>Army Upkeep</dt><dd><TraceTooltip value={formatMoney(-budget.armyUpkeep)} trace={budget.trace.armyUpkeep} /></dd></div>
        <div><dt>Factory Subsidies</dt><dd><TraceTooltip value={formatMoney(-budget.subsidySpend)} trace={budget.trace.subsidySpend} /></dd></div>
        <div><dt>Construction</dt><dd><TraceTooltip value={formatMoney(-budget.constructionSpend)} trace={budget.trace.constructionSpend} /></dd></div>
        <div><dt>Administration</dt><dd><TraceTooltip value={formatMoney(-budget.adminSpend)} trace={budget.trace.adminSpend} /></dd></div>
        <div><dt>Reform Upkeep</dt><dd><TraceTooltip value={formatMoney(-budget.reformUpkeep)} trace={budget.trace.reformUpkeep} /></dd></div>
      </dl>
      <p className={`budget-net ${budget.net >= 0 ? 'positive' : 'negative'}`}>
        Monthly Net: <TraceTooltip value={formatMoney(budget.net)} trace={budget.trace.net} />
      </p>
      <p className={`bankruptcy-pill ${player.isBankrupt ? 'is-bankrupt' : ''}`}>
        {player.isBankrupt
          ? 'Bankruptcy active: construction disabled and emergency cuts applied.'
          : 'Solvent: construction and normal spending active.'}
      </p>
    </section>
  );
}
