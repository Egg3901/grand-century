import { useStore } from '../../store';
import { BALANCE } from '../../sim/balance';
import { exportKeepRate, importPriceMultiplier } from '../../sim/systems/market';
import type { BudgetLine } from '../../shared/types';
import { TraceTooltip } from '../components/TraceTooltip';

function formatMoney(value: number): string {
  return `${value < 0 ? '-' : ''}\u00a3${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type ChartSegment = { label: string; value: number; tone: 'income' | 'expense' };

function BudgetBreakdownChart({ budget }: { budget: BudgetLine }) {
  const income: ChartSegment[] = [
    { label: 'Tax', value: Math.max(0, budget.taxIncome), tone: 'income' },
    { label: 'Tariff', value: Math.max(0, budget.tariffIncome), tone: 'income' },
    { label: 'Production', value: Math.max(0, budget.productionIncome), tone: 'income' },
  ];
  const expenses: ChartSegment[] = [
    { label: 'Army', value: Math.max(0, budget.armyUpkeep), tone: 'expense' },
    { label: 'Subsidies', value: Math.max(0, budget.subsidySpend), tone: 'expense' },
    { label: 'Overhead', value: Math.max(0, budget.constructionSpend), tone: 'expense' },
    { label: 'Admin', value: Math.max(0, budget.adminSpend), tone: 'expense' },
    { label: 'Reform', value: Math.max(0, budget.reformUpkeep), tone: 'expense' },
  ];

  const incomeTotal = income.reduce((sum, s) => sum + s.value, 0);
  const expenseTotal = expenses.reduce((sum, s) => sum + s.value, 0);
  const scale = Math.max(incomeTotal, expenseTotal, 1e-6);
  const width = 240;
  const rowH = 12;
  const gap = 8;
  const height = rowH * 2 + gap;

  const renderRow = (segments: ChartSegment[], y: number) => {
    let x = 0;
    return segments.map((segment) => {
      const w = (segment.value / scale) * width;
      const el = w <= 0 ? null : (
        <rect
          key={segment.label}
          className={`budget-chart__seg budget-chart__seg--${segment.tone}`}
          x={x}
          y={y}
          width={Math.max(w, 0.8)}
          height={rowH}
          aria-label={`${segment.label}: ${formatMoney(segment.tone === 'expense' ? -segment.value : segment.value)}`}
        >
          <title>{`${segment.label}: ${formatMoney(segment.tone === 'expense' ? -segment.value : segment.value)}`}</title>
        </rect>
      );
      x += w;
      return el;
    });
  };

  return (
    <div className="budget-chart" data-testid="budget-breakdown-chart">
      <p className="budget-chart__label">Ledger shape</p>
      <svg
        className="budget-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Income ${formatMoney(incomeTotal)}, expenses ${formatMoney(-expenseTotal)}`}
      >
        {renderRow(income, 0)}
        {renderRow(expenses, rowH + gap)}
      </svg>
      <div className="budget-chart__legend">
        <span className="budget-chart__legend-item budget-chart__legend-item--income">Income {formatMoney(incomeTotal)}</span>
        <span className="budget-chart__legend-item budget-chart__legend-item--expense">Expenses {formatMoney(-expenseTotal)}</span>
      </div>
    </div>
  );
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

  const importMult = importPriceMultiplier(player.tariffRate);
  const exportKeep = exportKeepRate(player.tariffRate);

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
          <span>
            Tariff {(player.tariffRate * 100).toFixed(0)}%
            {' · '}
            imports ×{importMult.toFixed(2)}
            {' · '}
            exporters keep {(exportKeep * 100).toFixed(0)}%
          </span>
          <input
            type="range"
            className="gc-slider"
            min={player.tariffMin}
            max={player.tariffMax}
            step={0.01}
            value={player.tariffRate}
            onChange={(event) => sendCommand({ t: 'setTariff', rate: Number(event.target.value) })}
          />
        </label>
      </div>
      <BudgetBreakdownChart budget={budget} />
      <dl className="ledger-grid">
        <div><dt>Tax Income</dt><dd><TraceTooltip value={formatMoney(budget.taxIncome)} trace={budget.trace.taxIncome} /></dd></div>
        <div data-testid="budget-row-tariff-income">
          <dt>Tariff Income</dt>
          <dd><TraceTooltip value={formatMoney(budget.tariffIncome)} trace={budget.trace.tariffIncome} /></dd>
        </div>
        <div><dt>Production</dt><dd><TraceTooltip value={formatMoney(budget.productionIncome)} trace={budget.trace.productionIncome} /></dd></div>
        <div><dt>Army / Navy Upkeep</dt><dd><TraceTooltip value={formatMoney(-budget.armyUpkeep)} trace={budget.trace.armyUpkeep} /></dd></div>
        <div><dt>Factory Subsidies</dt><dd><TraceTooltip value={formatMoney(-budget.subsidySpend)} trace={budget.trace.subsidySpend} /></dd></div>
        <div><dt>Provincial Overhead</dt><dd><TraceTooltip value={formatMoney(-budget.constructionSpend)} trace={budget.trace.constructionSpend} /></dd></div>
        <div><dt>Administration</dt><dd><TraceTooltip value={formatMoney(-budget.adminSpend)} trace={budget.trace.adminSpend} /></dd></div>
        <div><dt>Reform Upkeep</dt><dd><TraceTooltip value={formatMoney(-budget.reformUpkeep)} trace={budget.trace.reformUpkeep} /></dd></div>
      </dl>
      <p className={`budget-net ${budget.net >= 0 ? 'positive' : 'negative'}`}>
        Monthly Net: <TraceTooltip value={formatMoney(budget.net)} trace={budget.trace.net} />
      </p>
      <p className={`bankruptcy-pill ${player.isBankrupt ? 'is-bankrupt' : ''}`}>
        {player.isBankrupt
          ? (
            <>
              Bankruptcy active ({player.bankruptcyMonths} mo): construction off;
              cuts army ×0.45, subsidies ×0.3, admin ×0.6, reform ×0.55, overhead ×0.
              Exit when treasury ≥ £{BALANCE.economy.bankruptcyExitTreasury}.
              Entered at ≤ £{BALANCE.economy.bankruptcyEnterTreasury}.
            </>
          )
          : (
            <>
              Solvent: construction and normal spending active.
              Bankruptcy enters at treasury ≤ £{BALANCE.economy.bankruptcyEnterTreasury}.
            </>
          )}
      </p>
    </section>
  );
}
