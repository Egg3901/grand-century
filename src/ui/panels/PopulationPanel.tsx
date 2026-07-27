import type { ReactNode } from 'react';
import { useSnapshotFields } from '../useSnapshotFields';
import { TraceTooltip } from '../components/TraceTooltip';
import {
  POP_COMPOSITION_HEIGHT,
  POP_COMPOSITION_WIDTH,
  populationComposition,
  shareToSvgX,
  type PopShareSegment,
} from '../populationComposition';

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

/** Inline mini-bar for 0–1 fractions (needs) or 0–10 scales (mil/con). */
function PopMetricBar({
  label,
  fill,
  valueNode,
  tone,
}: {
  label: string;
  /** Fill fraction in [0, 1]. */
  fill: number;
  valueNode: ReactNode;
  tone?: 'unrest' | 'positive' | 'negative';
}) {
  const width = `${Math.max(0, Math.min(100, fill * 100))}%`;
  return (
    <div className={`pop-metric${tone ? ` pop-metric--${tone}` : ''}`}>
      <span className="pop-metric__label">{label}</span>
      <span className="pop-metric__track" aria-hidden="true">
        <span className="pop-metric__fill" style={{ width }} />
      </span>
      <span className="pop-metric__value">{valueNode}</span>
    </div>
  );
}

function PopulationCompositionChart({ segments }: { segments: PopShareSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <figure className="pop-composition" data-testid="pop-composition-chart">
      <svg
        className="pop-composition__bar"
        viewBox={`0 0 ${POP_COMPOSITION_WIDTH} ${POP_COMPOSITION_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Population composition by class"
      >
        {segments.map((segment, index) => {
          const x = shareToSvgX(segment.offset);
          const width = Math.max(segment.share > 0 ? 0.4 : 0, shareToSvgX(segment.share));
          return (
            <rect
              key={segment.type}
              className={`pop-composition__seg pop-composition__seg--${index % 6}`}
              x={x}
              y={0}
              width={width}
              height={POP_COMPOSITION_HEIGHT}
              data-type={segment.type}
              data-share={segment.share.toFixed(4)}
            />
          );
        })}
      </svg>
      <ul className="pop-composition__legend">
        {segments.map((segment, index) => (
          <li key={segment.type}>
            <span className={`pop-composition__swatch pop-composition__seg--${index % 6}`} aria-hidden="true" />
            <span className="pop-composition__label">{segment.type}</span>
            <span className="pop-composition__share">{pct(segment.share)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function PopulationPanel() {
  const snapshot = useSnapshotFields(['playerPopulation', 'playerReformAgitation', 'playerPopMobility'] as const);

  if (!snapshot) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Population</h2>
        <p>Awaiting census data...</p>
      </section>
    );
  }

  const total = snapshot.playerPopulation.reduce((sum, entry) => sum + entry.size, 0);
  const composition = populationComposition(snapshot.playerPopulation);
  const topAgitation = snapshot.playerReformAgitation.slice(0, 3);
  const mobility = snapshot.playerPopMobility;
  const hasMobility = Boolean(
    mobility && (mobility.migrated > 0 || mobility.conversions.length > 0),
  );

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Population Census</h2>
      <p className="panel-subtle">National pop totals by class, with needs, militancy, and agitation pressure.</p>

      <dl className="ledger-grid">
        <div>
          <dt>Total Population</dt>
          <dd>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</dd>
        </div>
        <div>
          <dt>Pop Classes</dt>
          <dd>{snapshot.playerPopulation.length}</dd>
        </div>
        <div>
          <dt>Migrated (month)</dt>
          <dd>{(mobility?.migrated ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</dd>
        </div>
      </dl>

      <h3 className="atlas-heading panel-small-heading">Top Agitation</h3>
      {topAgitation.length === 0 ? (
        <p className="panel-subtle status-positive">Reform pressure is currently low.</p>
      ) : (
        <ul className="panel-list">
          {topAgitation.map((entry) => (
            <li key={entry.reform}>
              <span>{entry.reform.replaceAll('_', ' ')}</span>
              <span className={entry.support >= 0.4 ? 'unrest' : undefined}>{pct(entry.support)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">This Month</h3>
      {!hasMobility ? (
        <p className="panel-subtle">No domestic migration or class conversion this month.</p>
      ) : (
        <ul className="panel-list">
          {(mobility?.migrations ?? []).map((entry) => (
            <li key={`mig-${entry.type}`}>
              <span>Migrated {entry.type}</span>
              <span>{entry.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </li>
          ))}
          {(mobility?.conversions ?? []).map((entry) => (
            <li key={`conv-${entry.from}-${entry.to}`}>
              <span>{entry.from} → {entry.to}</span>
              <span>{entry.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Classes</h3>
      <PopulationCompositionChart segments={composition} />
      <ul className="panel-list population-list">
        {snapshot.playerPopulation.map((entry) => (
          <li key={entry.type}>
            <div className="pop-class__head">
              <strong>{entry.type}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="pop-class__meta">
              <span className="pop-class__ideology">{entry.dominantIdeology}</span>
              <span className={`pop-class__growth${entry.growth >= 0 ? ' positive' : ' negative'}`}>
                Growth{' '}
                <TraceTooltip
                  value={`${entry.growth >= 0 ? '+' : ''}${entry.growth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  trace={entry.growthDrivers ?? [
                    { label: 'Monthly growth', value: entry.growth },
                    { label: 'Population size', value: entry.size },
                  ]}
                />
              </span>
            </div>
            <div className="pop-class__metrics">
              <PopMetricBar
                label="Needs"
                fill={entry.avgNeedsMet}
                valueNode={(
                  <TraceTooltip
                    value={pct(entry.avgNeedsMet)}
                    trace={[
                      { label: 'Life needs', value: entry.avgLifeNeeds ?? entry.avgNeedsMet },
                      { label: 'Everyday needs', value: entry.avgEverydayNeeds ?? entry.avgNeedsMet },
                      { label: 'Luxury needs', value: entry.avgLuxuryNeeds ?? 1 },
                      { label: 'Welfare score', value: entry.avgNeedsMet },
                      ...(entry.scarceGoods ?? []).map((good) => ({
                        label: `Scarce: ${good.name}`,
                        value: good.fill,
                      })),
                    ]}
                  />
                )}
              />
              <PopMetricBar
                label="Mil"
                fill={entry.avgMilitancy / 10}
                tone={entry.avgMilitancy >= 4 ? 'unrest' : undefined}
                valueNode={(
                  <TraceTooltip
                    value={entry.avgMilitancy.toFixed(2)}
                    trace={[
                      { label: 'Average militancy', value: entry.avgMilitancy },
                      { label: 'Needs met', value: entry.avgNeedsMet },
                      { label: 'Reform demands', value: entry.agitatingFor.length },
                      { label: 'Population size', value: entry.size },
                    ]}
                  />
                )}
              />
              <PopMetricBar
                label="Con"
                fill={entry.avgConsciousness / 10}
                valueNode={(
                  <TraceTooltip
                    value={entry.avgConsciousness.toFixed(2)}
                    trace={entry.consciousnessDrivers ?? [
                      { label: 'Average consciousness', value: entry.avgConsciousness },
                      { label: 'Needs met', value: entry.avgNeedsMet },
                    ]}
                  />
                )}
              />
            </div>
            <p className={`pop-class__agitation${entry.agitatingFor.length > 0 ? ' unrest' : ''}`}>
              {entry.agitatingFor.length > 0
                ? `Agitating: ${entry.agitatingFor.map((reform) => reform.replaceAll('_', ' ')).join(', ')}`
                : 'Agitating: none'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
