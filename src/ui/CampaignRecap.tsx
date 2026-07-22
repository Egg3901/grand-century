import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { NationFlag } from './components/NationFlag';
import './CampaignRecap.css';

function sparkline(values: number[], width = 220, height = 44): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${(height - ((value - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return `${Math.round(value)}`;
}

/**
 * U5 — the finish line. A campaign ENDS: at 1920 (the century played out)
 * or on elimination, the chronicle becomes a set of atlas plates worth a
 * screenshot. Continue-playing stays available; history does not stop.
 */
export function CampaignRecap() {
  const snapshot = useStore((state) => state.snapshot);
  const [dismissed, setDismissed] = useState(false);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);

  const chronicle = snapshot?.chronicle ?? [];
  const over = snapshot?.campaignOver ?? null;

  const derived = useMemo(() => {
    if (chronicle.length === 0) return null;
    const first = chronicle[0];
    const last = chronicle[chronicle.length - 1];
    const peakPrestige = chronicle.reduce((best, entry) => Math.max(best, entry.prestige), 0);
    const bestRank = chronicle.reduce(
      (best, entry) => (entry.gpRank > 0 && (best === 0 || entry.gpRank < best) ? entry.gpRank : best),
      0,
    );
    const identities = [...new Set(chronicle.map((entry) => entry.name))];
    return { first, last, peakPrestige, bestRank, identities };
  }, [chronicle]);

  if (!over || dismissed || !snapshot || !derived) return null;
  const { first, last, peakPrestige, bestRank, identities } = derived;

  return (
    <div className="recap-overlay" data-testid="campaign-recap">
      <section className="recap-card atlas-panel">
        <p className="recap-kicker">
          {over === 'century' ? 'The Long Century, concluded' : 'The chronicle closes'}
        </p>
        <div className="recap-title-row">
          <NationFlag tag={last.tag} size={34} />
          <h1>{last.name}</h1>
        </div>
        <p className="recap-subtitle">
          {over === 'century'
            ? `1820–${last.year}. One hundred years on the board.`
            : `1820–${last.year}. The map closed over ${last.name}.`}
          {identities.length > 1 ? ` Began the age as ${identities[0]}.` : ''}
        </p>

        <div className="recap-grid">
          <div className="recap-stat">
            <b>{last.provinces}</b>
            <span>provinces{first.provinces !== last.provinces
              ? ` (${last.provinces >= first.provinces ? '+' : ''}${last.provinces - first.provinces} since 1820)` : ''}</span>
          </div>
          <div className="recap-stat">
            <b>{formatCount(last.population)}</b>
            <span>souls under the crown</span>
          </div>
          <div className="recap-stat">
            <b>{snapshot.chronicleWarsFought ?? 0}</b>
            <span>wars fought</span>
          </div>
          <div className="recap-stat">
            <b>{bestRank > 0 ? `#${bestRank}` : '—'}</b>
            <span>best great-power rank</span>
          </div>
          <div className="recap-stat">
            <b>{Math.round(peakPrestige)}</b>
            <span>peak prestige</span>
          </div>
          <div className="recap-stat">
            <b>{last.techs}</b>
            <span>technologies mastered</span>
          </div>
        </div>

        <div className="recap-charts">
          <figure>
            <svg viewBox="0 0 220 44" preserveAspectRatio="none" aria-hidden="true">
              <path d={sparkline(chronicle.map((entry) => entry.prestige))} />
            </svg>
            <figcaption>Prestige, {first.year}–{last.year}</figcaption>
          </figure>
          <figure>
            <svg viewBox="0 0 220 44" preserveAspectRatio="none" aria-hidden="true">
              <path d={sparkline(chronicle.map((entry) => entry.provinces))} />
            </svg>
            <figcaption>Territory</figcaption>
          </figure>
          <figure>
            <svg viewBox="0 0 220 44" preserveAspectRatio="none" aria-hidden="true">
              <path d={sparkline(chronicle.map((entry) => entry.population))} />
            </svg>
            <figcaption>Population</figcaption>
          </figure>
        </div>

        <div className="recap-actions">
          <button type="button" className="btn btn--secondary" onClick={() => setDismissed(true)}>
            Keep playing
          </button>
          <button type="button" className="btn btn--primary" onClick={() => { setDismissed(true); setShowMainMenu(true); }}>
            New campaign
          </button>
        </div>
      </section>
    </div>
  );
}
