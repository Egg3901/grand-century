import { useMemo } from 'react';
import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

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
  const priceByGood = useMemo(
    () => new Map(snapshot?.market.map((entry) => [entry.good, entry.price]) ?? []),
    [snapshot],
  );
  // Live per-unit margin at current market prices — the number Vic2 players
  // build by. Recomputed per snapshot; drives button ordering and coloring.
  const marginOf = (recipe: { inputs: { good: number; amount: number }[]; output: { good: number; amount: number } }) => {
    const revenue = (priceByGood.get(recipe.output.good) ?? 0) * recipe.output.amount;
    const cost = recipe.inputs.reduce((sum, entry) => sum + (priceByGood.get(entry.good) ?? 0) * entry.amount, 0);
    return revenue - cost;
  };
  const chainOf = (recipe: { inputs: { good: number; amount: number }[]; output: { good: number; amount: number } }) => {
    const inputs = recipe.inputs.map((entry) => goodById.get(entry.good) ?? '?').join(' + ');
    return `${inputs || 'no inputs'} → ${goodById.get(recipe.output.good) ?? '?'}`;
  };
  // 0.6.0: only offer recipes whose tech gate has been passed (see Technology
  // panel for the locked ones). The sim enforces this too; this is UX.
  const researchedTechs = snapshot?.playerTech?.techs;
  const factoryRecipes = (data?.recipes.filter((recipe) => recipe.building === 'factory') ?? [])
    .filter((recipe) => !recipe.requiresTech || (researchedTechs?.includes(recipe.requiresTech) ?? false));
  const sortedStates = (snapshot?.playerStates ?? [])
    .slice()
    .sort((a, b) => b.factoryCount - a.factoryCount || a.name.localeCompare(b.name));
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
      {player.constructionBlocked ? (
        <p className="bankruptcy-pill is-bankrupt">Construction blocked — resolve bankruptcy before expanding industry.</p>
      ) : null}

      <h3 className="atlas-heading panel-small-heading">Build Factories</h3>
      <p className="panel-subtle">
        Margins are live market prices: output value minus input cost per unit.
        Green earns at today's prices; red loses.
      </p>
      <div className="production-build-grid">
        {sortedStates.map((state, stateIndex) => (
          <div key={state.id} className="production-build-row">
            <div className="production-build-row__head">
              <strong>{state.name}</strong>
              <span>{state.factoryCount === 0 ? 'No industry yet' : `Factories: ${state.factoryCount}`}</span>
            </div>
            <div className="production-build-actions">
              {factoryRecipes
                .filter((recipe) => !recipe.requiresCoastal || state.coastal)
                .map((recipe) => ({ recipe, margin: marginOf(recipe) }))
                .sort((a, b) => b.margin - a.margin)
                .map(({ recipe, margin }, recipeIndex) => (
                  <button
                    key={`${state.id}-${recipe.key}`}
                    type="button"
                    className="btn btn--secondary production-build-btn"
                    data-coach-id={stateIndex === 0 && recipeIndex === 0 ? 'build-factory-primary' : undefined}
                    disabled={player.constructionBlocked}
                    title={chainOf(recipe)}
                    onClick={() => sendCommand({ t: 'buildFactory', state: state.id, recipe: recipe.key })}
                  >
                    <span className="production-build-btn__name">{recipe.name ?? recipeLabel(recipe.key)}</span>
                    <span className="production-build-btn__meta">
                      <em>{chainOf(recipe)}</em>
                      <b className={margin >= 0 ? 'positive' : 'negative'}>
                        {margin >= 0 ? '+' : ''}£{formatNumber(margin, 2)}
                      </b>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="atlas-heading panel-small-heading">Active Sites</h3>
      {snapshot.playerProduction.length === 0 ? (
        <p className="panel-subtle">No active production sites yet.</p>
      ) : (
        <ul className="panel-list production-list">
          {snapshot.playerProduction.map((entry, index) => (
            <li key={`${entry.kind}-${entry.locationName}-${entry.recipe}-${index}`}>
              <div>
                <strong>{entry.locationName}</strong>
                <span className="gc-chip">{entry.kind.toUpperCase()} · {recipeLabel(entry.recipe)}</span>
              </div>
              <div>
                <span>{goodById.get(entry.outputGood) ?? `Good ${entry.outputGood}`}</span>
                <span>
                  Jobs{' '}
                  <TraceTooltip
                    value={formatNumber(entry.employment, 0)}
                    trace={[
                      { label: 'Building level', value: entry.level },
                      { label: 'Output amount', value: entry.outputAmount },
                    ]}
                  />
                </span>
                <span>
                  Output{' '}
                  <TraceTooltip
                    value={formatNumber(entry.outputAmount, 2)}
                    trace={[
                      { label: 'Employment', value: entry.employment },
                      { label: 'Building level', value: entry.level },
                    ]}
                  />
                </span>
                <span className={entry.profit >= 0 ? 'positive' : 'negative'}>
                  Profit{' '}
                  <TraceTooltip
                    value={`${entry.profit >= 0 ? '+' : ''}${formatNumber(entry.profit, 2)}`}
                    trace={[
                      { label: 'Output amount', value: entry.outputAmount },
                      { label: 'Employment', value: entry.employment },
                      { label: 'Building level', value: entry.level },
                    ]}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
