import { useMemo } from 'react';
import { useStore } from '../../store';

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function recipeLabel(recipe: string): string {
  return recipe.replace('factory_', '').replace('rgo_', '').replaceAll('_', ' ');
}

export function ProductionPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const data = useStore((state) => state.data);
  const sendCommand = useStore((state) => state.sendCommand);

  const goodById = useMemo(() => new Map(data?.goods.map((good) => [good.id, good.name]) ?? []), [data]);
  const factoryRecipes = data?.recipes.filter((recipe) => recipe.building === 'factory') ?? [];
  const player = snapshot?.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;

  if (!snapshot || !data || !player) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Production</h2>
        <p>Awaiting industrial ledger...</p>
      </section>
    );
  }

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Production</h2>
      <p className="panel-subtle">Weekly output and profitability across RGOs and factories.</p>

      <div className="production-build-grid">
        {snapshot.playerStates.map((state) => (
          <div key={state.id} className="production-build-row">
            <strong>{state.name}</strong>
            <span>Factories: {state.factoryCount}</span>
            <div className="production-build-actions">
              {factoryRecipes.map((recipe) => (
                <button
                  key={`${state.id}-${recipe.key}`}
                  type="button"
                  disabled={player.constructionBlocked}
                  onClick={() => sendCommand({ t: 'buildFactory', state: state.id, recipe: recipe.key })}
                >
                  Build {recipeLabel(recipe.key)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="panel-list production-list">
        {snapshot.playerProduction.map((entry, index) => (
          <li key={`${entry.kind}-${entry.locationName}-${entry.recipe}-${index}`}>
            <div>
              <strong>{entry.locationName}</strong>
              <span>{entry.kind.toUpperCase()} {recipeLabel(entry.recipe)}</span>
            </div>
            <div>
              <span>{goodById.get(entry.outputGood) ?? `Good ${entry.outputGood}`}: {formatNumber(entry.outputAmount, 2)}</span>
              <span>Jobs {formatNumber(entry.employment, 0)}</span>
              <span className={entry.profit >= 0 ? 'positive' : 'negative'}>
                Profit {entry.profit >= 0 ? '+' : ''}{formatNumber(entry.profit, 2)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
