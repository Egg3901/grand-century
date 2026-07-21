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
  // 0.6.0: only offer recipes whose tech gate has been passed (see Technology
  // panel for the locked ones). The sim enforces this too; this is UX.
  const researchedTechs = snapshot?.playerTech?.techs;
  const factoryRecipes = (data?.recipes.filter((recipe) => recipe.building === 'factory') ?? [])
    .filter((recipe) => !recipe.requiresTech || (researchedTechs?.includes(recipe.requiresTech) ?? false));
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
      <div className="production-build-grid">
        {snapshot.playerStates.map((state, stateIndex) => (
          <div key={state.id} className="production-build-row">
            <strong>{state.name}</strong>
            <span>Factories: {state.factoryCount}</span>
            <div className="production-build-actions">
              {factoryRecipes.filter((recipe) => !recipe.requiresCoastal || state.coastal).map((recipe, recipeIndex) => (
                <button
                  key={`${state.id}-${recipe.key}`}
                  type="button"
                  className="btn btn--secondary"
                  data-coach-id={stateIndex === 0 && recipeIndex === 0 ? 'build-factory-primary' : undefined}
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
