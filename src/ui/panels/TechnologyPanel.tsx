/**
 * 0.6.0 / 0.7.0 — Technology panel ("The Inventive Century" + depth).
 *
 * Five research columns paced across 1820-1920, the active research bar, and
 * the invention ledger. Pure read of `snapshot.playerTech`; the only writes
 * are `setResearch` commands. Columns scroll independently so a 50+ tech tree
 * stays usable; each node shows prereq + ETA.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import type { TechModifiers, TechStatusView } from '../../shared/types';

const CATEGORY_ORDER = ['army', 'navy', 'commerce', 'industry', 'culture'] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  army: 'Army',
  navy: 'Navy',
  commerce: 'Commerce',
  industry: 'Industry',
  culture: 'Culture',
};

function techStateClass(tech: TechStatusView, current: string | null): string {
  if (tech.researched) return 'is-researched';
  if (tech.key === current) return 'is-current';
  if (tech.available) return 'is-available';
  return 'is-locked';
}

function etaLabel(tech: TechStatusView, current: string | null): string {
  if (tech.researched) return 'Researched';
  if (tech.key === current) {
    return tech.etaMonths != null ? `In progress · ~${tech.etaMonths} mo` : 'In progress';
  }
  if (tech.available) {
    const eta = tech.etaMonths != null ? ` · ~${tech.etaMonths} mo` : '';
    return `${tech.cost} pts${eta}`;
  }
  return tech.reason;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

/** Compact aggregate bonus sheet from techModifiersFor totals. */
function formatAggregateModifiers(mods: TechModifiers): string[] {
  const parts: string[] = [];
  if (mods.factoryThroughput) parts.push(`${formatPct(mods.factoryThroughput)} factory throughput`);
  if (mods.rgoThroughput) parts.push(`${formatPct(mods.rgoThroughput)} RGO throughput`);
  if (mods.taxEfficiency) parts.push(`${formatPct(mods.taxEfficiency)} tax efficiency`);
  if (mods.researchRate) parts.push(`${formatPct(mods.researchRate)} research`);
  if (mods.literacyRate) parts.push(`+${(mods.literacyRate * 100).toFixed(2)}% lit/mo`);
  if (mods.prestigeMonthly) parts.push(`+${mods.prestigeMonthly.toFixed(1)} prestige/mo`);
  if (mods.popGrowth) parts.push('+pop growth');
  if (mods.armyMovement) parts.push(`${formatPct(mods.armyMovement)} army movement`);
  if (mods.supplyRange) parts.push(`+${mods.supplyRange.toFixed(1)} supply range`);
  if (mods.factoryProfit) parts.push(`${formatPct(mods.factoryProfit)} factory profit`);
  if (mods.tradeEfficiency) parts.push(`${formatPct(mods.tradeEfficiency)} tariff yield`);
  return parts;
}

export function TechnologyPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  const view = snapshot?.playerTech;

  const columns = useMemo(() => {
    if (!view) return [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      techs: view.statuses
        .filter((tech) => tech.category === category)
        .slice()
        .sort((a, b) => a.year - b.year || a.cost - b.cost),
    }));
  }, [view]);

  const modifierLines = useMemo(
    () => (view?.modifiers ? formatAggregateModifiers(view.modifiers) : []),
    [view?.modifiers],
  );

  if (!snapshot || !view) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Technology</h2>
        <p>Awaiting research ledger...</p>
      </section>
    );
  }

  const currentDef = view.current
    ? view.statuses.find((tech) => tech.key === view.current) ?? null
    : null;
  const progressPct = currentDef && currentDef.cost > 0
    ? Math.min(100, (view.progress / currentDef.cost) * 100)
    : 0;
  const monthsLeft = currentDef && view.monthlyResearch > 0
    ? Math.max(0, Math.ceil((currentDef.cost - view.progress - view.researchPoints) / view.monthlyResearch))
    : 0;
  const discovered = view.inventionStatuses.filter((invention) => invention.owned);
  const brewing = view.inventionStatuses.filter((invention) => !invention.owned && invention.prereqMet);
  const breakdown = view.researchBreakdown;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Technology</h2>
      <p className="panel-subtle">
        Direct the century of invention. Research unlocks factories, sharpens armies and fleets,
        and compounds into national power.
      </p>

      <div className="tech-status-row">
        <div>
          <span className="tech-status-label">Research points</span>
          <strong data-testid="tech-points">{view.researchPoints.toFixed(1)}</strong>
        </div>
        <div>
          <span className="tech-status-label">Per month</span>
          <strong>+{view.monthlyResearch.toFixed(1)}</strong>
        </div>
        <div>
          <span className="tech-status-label">Researched</span>
          <strong>{view.techs.length} / {view.statuses.length}</strong>
        </div>
      </div>

      {breakdown ? (
        <div className="tech-breakdown" data-testid="tech-rp-breakdown">
          <span className="tech-status-label">RP formula</span>
          <p>
            {breakdown.flatBase.toFixed(1)}
            {' + lit '}
            {(breakdown.literacy * 100).toFixed(0)}%
            {' × 4.8 (= '}
            {breakdown.literacyBonus.toFixed(2)}
            {')'}
            {breakdown.gpBonus > 0 ? ` + GP ${breakdown.gpBonus.toFixed(1)}` : ''}
            {' = '}
            {breakdown.base.toFixed(2)}
            {' × (1 + '}
            {formatPct(breakdown.researchRate)}
            {' research) = '}
            <strong>+{breakdown.monthly.toFixed(2)}/mo</strong>
          </p>
        </div>
      ) : null}

      {modifierLines.length > 0 ? (
        <div className="tech-bonuses" data-testid="tech-modifiers">
          <span className="tech-status-label">Active bonuses</span>
          <ul className="tech-bonuses__list">
            {modifierLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {currentDef ? (
        <div className="tech-current" data-testid="tech-current">
          <div className="tech-current__head">
            <strong>Researching: {currentDef.name}</strong>
            <span>{view.progress.toFixed(0)} / {currentDef.cost}{monthsLeft > 0 ? ` · ~${monthsLeft} mo` : ''}</span>
          </div>
          <div className="tech-progress" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="tech-progress__fill" style={{ width: `${progressPct}%` }} />
          </div>
          {currentDef.prereqName ? (
            <span className="tech-current__prereq">Built on {currentDef.prereqName}</span>
          ) : null}
          <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'setResearch', tech: null })}>
            Halt research (bank points)
          </button>
        </div>
      ) : (
        <p className="panel-subtle" data-testid="tech-idle">
          No active research — points are banking. Choose a technology below.
        </p>
      )}

      <div className="tech-columns">
        {columns.map((column) => (
          <div key={column.category} className="tech-column">
            <h3 className="atlas-heading panel-small-heading">
              {column.label}
              <span className="tech-column__count">
                {column.techs.filter((tech) => tech.researched).length}/{column.techs.length}
              </span>
            </h3>
            <div className="tech-column__scroll">
              {column.techs.map((tech, index) => (
                <button
                  key={tech.key}
                  type="button"
                  data-testid={`tech-${tech.key}`}
                  className={`tech-node ${techStateClass(tech, view.current)}`}
                  disabled={!tech.available && tech.key !== view.current}
                  title={tech.researched ? 'Researched' : tech.available ? `Research ${tech.name}` : tech.reason}
                  onClick={() => {
                    if (tech.available) sendCommand({ t: 'setResearch', tech: tech.key });
                  }}
                >
                  {index > 0 ? <span className="tech-node__chain" aria-hidden="true" /> : null}
                  <span className="tech-node__head">
                    <strong>{tech.name}</strong>
                    <span className="tech-node__year">{tech.year}</span>
                  </span>
                  <span className="tech-node__meta">{etaLabel(tech, view.current)}</span>
                  {tech.prereqName && !tech.researched ? (
                    <span className="tech-node__prereq">Requires {tech.prereqName}</span>
                  ) : null}
                  {tech.effectsSummary.length > 0 ? (
                    <span className="tech-node__effects">{tech.effectsSummary.join(' · ')}</span>
                  ) : null}
                  {tech.unlocksRecipes.length > 0 ? (
                    <span className="tech-node__unlocks">Unlocks: {tech.unlocksRecipes.join(', ')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="atlas-heading panel-small-heading">Inventions</h3>
      <p className="panel-subtle">
        Discoveries strike on their own once the underlying science is in place — literacy hurries them along.
      </p>
      {discovered.length === 0 && brewing.length === 0 ? (
        <p className="panel-subtle">Nothing on the horizon yet. Advance the tree.</p>
      ) : (
        <ul className="panel-list tech-invention-list">
          {discovered.map((invention) => (
            <li key={invention.key} className="is-owned">
              <div>
                <strong>{invention.name}</strong>
                <span className="gc-chip">Discovered</span>
              </div>
              <span>{invention.description}{invention.effectsSummary.length > 0 ? ` (${invention.effectsSummary.join(', ')})` : ''}</span>
            </li>
          ))}
          {brewing.map((invention) => (
            <li key={invention.key} data-testid={`invention-brewing-${invention.key}`}>
              <div>
                <strong>{invention.name}</strong>
                <span className="gc-chip">
                  {invention.monthlyChance != null
                    ? `${(invention.monthlyChance * 100).toFixed(1)}%/mo`
                    : 'Possible'}
                </span>
              </div>
              <span>
                {invention.description}
                {invention.effectsSummary.length > 0
                  ? ` (${invention.effectsSummary.join(', ')})`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
