/**
 * 0.6.0 — Technology panel ("The Inventive Century").
 *
 * Five research columns paced across 1820-1920, the active research bar, and
 * the invention ledger. Pure read of `snapshot.playerTech`; the only writes
 * are `setResearch` commands.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import type { TechStatusView } from '../../shared/types';

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

      {currentDef ? (
        <div className="tech-current" data-testid="tech-current">
          <div className="tech-current__head">
            <strong>Researching: {currentDef.name}</strong>
            <span>{view.progress.toFixed(0)} / {currentDef.cost}{monthsLeft > 0 ? ` · ~${monthsLeft} mo` : ''}</span>
          </div>
          <div className="tech-progress" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="tech-progress__fill" style={{ width: `${progressPct}%` }} />
          </div>
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
            <h3 className="atlas-heading panel-small-heading">{column.label}</h3>
            {column.techs.map((tech) => (
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
                <span className="tech-node__head">
                  <strong>{tech.name}</strong>
                  <span className="tech-node__year">{tech.year}</span>
                </span>
                <span className="tech-node__meta">
                  {tech.researched ? 'Researched' : tech.key === view.current ? 'In progress' : tech.available ? `${tech.cost} pts` : tech.reason}
                </span>
                {tech.effectsSummary.length > 0 ? (
                  <span className="tech-node__effects">{tech.effectsSummary.join(' · ')}</span>
                ) : null}
                {tech.unlocksRecipes.length > 0 ? (
                  <span className="tech-node__unlocks">Unlocks: {tech.unlocksRecipes.join(', ')}</span>
                ) : null}
              </button>
            ))}
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
            <li key={invention.key}>
              <div>
                <strong>{invention.name}</strong>
                <span className="gc-chip">Possible</span>
              </div>
              <span>{invention.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
