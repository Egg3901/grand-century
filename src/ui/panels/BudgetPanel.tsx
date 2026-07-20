import { useStore } from '../../store';

function formatMoney(value: number): string {
  return `${value < 0 ? '-' : ''}\u00a3${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

export function BudgetPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const budget = snapshot?.playerBudget;

  if (!budget) {
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
      <dl className="ledger-grid">
        <div><dt>Tax Income</dt><dd>{formatMoney(budget.taxIncome)}</dd></div>
        <div><dt>Tariff Income</dt><dd>{formatMoney(budget.tariffIncome)}</dd></div>
        <div><dt>Production</dt><dd>{formatMoney(budget.productionIncome)}</dd></div>
        <div><dt>Army Upkeep</dt><dd>{formatMoney(-budget.armyUpkeep)}</dd></div>
        <div><dt>Construction</dt><dd>{formatMoney(-budget.constructionSpend)}</dd></div>
        <div><dt>Administration</dt><dd>{formatMoney(-budget.adminSpend)}</dd></div>
      </dl>
      <p className={`budget-net ${budget.net >= 0 ? 'positive' : 'negative'}`}>
        Monthly Net: {formatMoney(budget.net)}
      </p>
    </section>
  );
}
