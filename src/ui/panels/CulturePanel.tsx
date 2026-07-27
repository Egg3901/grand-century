import { useState } from 'react';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';
import type { CulturePolicy } from '../../shared/types';
import { TraceTooltip } from '../components/TraceTooltip';
import { heartlandDisplay } from '../heartlandDisplay';

/**
 * 0.8.0 — The Cultures ledger: national makeup, acceptance, culture policy and
 * national movements.
 */

const POLICIES: { id: CulturePolicy; label: string; blurb: string }[] = [
  { id: 'exclusionary', label: 'Exclusionary', blurb: 'Forced assimilation. Minorities melt faster but seethe.' },
  { id: 'assimilationist', label: 'Assimilationist', blurb: 'Steady state-building. The default posture.' },
  { id: 'pluralist', label: 'Pluralist', blurb: 'Minorities live freely. Calm, but identities endure.' },
];

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function signed(value: number): string {
  const fixed = value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
}

export function CulturePanel() {
  const snapshot = useSnapshotFields([
    'playerCultures',
    'playerCulturePolicy',
    'playerMovements',
    'nations',
    'playerNation',
    'playerCulturePolicyCost',
    'playerCulturePolicyCooldownDays',
  ] as const);
  const sendCommand = useStore((state) => state.sendCommand);
  const [expandedHeartlandId, setExpandedHeartlandId] = useState<number | null>(null);

  if (!snapshot || !snapshot.playerCultures) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Cultures</h2>
        <p>Awaiting the cultural census...</p>
      </section>
    );
  }

  const policy = snapshot.playerCulturePolicy ?? 'assimilationist';
  const cultures = snapshot.playerCultures;
  const movements = snapshot.playerMovements ?? [];
  const player = snapshot.nations.find((nation) => nation.id === snapshot.playerNation);
  const prestige = player?.prestige ?? 0;
  const policyCost = snapshot.playerCulturePolicyCost ?? 4;
  const policyCooldown = snapshot.playerCulturePolicyCooldownDays ?? 0;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Cultures of the Nation</h2>
      <p className="panel-subtle">
        Accepted cultures are content and serve in the army. Non-accepted peoples simmer,
        assimilate — or awaken into national movements.
      </p>

      <h3 className="atlas-heading panel-small-heading">Cultural Policy</h3>
      <p className="panel-subtle">
        Flip cost {policyCost} prestige
        {policyCooldown > 0
          ? ` · cooldown ${Math.ceil(policyCooldown / 365)}y remaining`
          : ' · ready'}
        {' · '}
        Prestige {prestige.toFixed(1)}
      </p>
      <div className="culture-policy-row">
        {POLICIES.map((entry) => {
          const active = policy === entry.id;
          const blocked = !active && (policyCooldown > 0 || prestige < policyCost);
          return (
            <button
              key={entry.id}
              type="button"
              className={`culture-policy-btn${active ? ' culture-policy-btn--active' : ''}`}
              title={
                active
                  ? entry.blurb
                  : blocked
                    ? `${entry.blurb} (unavailable: ${policyCooldown > 0 ? 'cooldown' : 'prestige'})`
                    : `${entry.blurb} (−${policyCost} prestige)`
              }
              disabled={blocked}
              onClick={() => sendCommand({ t: 'setCulturePolicy', policy: entry.id })}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <p className="panel-subtle">{POLICIES.find((entry) => entry.id === policy)?.blurb}</p>

      <h3 className="atlas-heading panel-small-heading">National Movements</h3>
      {movements.length === 0 ? (
        <p className="panel-subtle status-positive">No separatist movement is organising.</p>
      ) : (
        <ul className="panel-list culture-movement-list">
          {movements.map((movement) => {
            const gateLabel = movement.boiling
              ? 'On the brink of rebellion'
              : movement.gateBlocked === 'radicalism'
                ? `Needs radicalism ≥ 85 (at ${movement.radicalism.toFixed(0)})`
                : movement.gateBlocked === 'militancy'
                  ? `Needs militancy ≥ 4.2 (at ${movement.militancy.toFixed(2)})`
                  : 'Organising';
            const heartlandExpanded = expandedHeartlandId === movement.id;
            const heartland = heartlandDisplay(movement.heartlandNames, heartlandExpanded);
            return (
              <li key={movement.id}>
                <div>
                  <strong>{movement.cultureName} movement</strong>
                  <span className={movement.boiling ? 'unrest' : undefined}>{gateLabel}</span>
                </div>
                <div className="culture-radical-bar" title={`Radicalism ${movement.radicalism.toFixed(0)} / 100`}>
                  <div
                    className={`culture-radical-fill${movement.boiling ? ' culture-radical-fill--hot' : ''}`}
                    style={{ width: `${Math.max(2, Math.min(100, movement.radicalism))}%` }}
                  />
                </div>
                <div>
                  <span>
                    Radicalism{' '}
                    <TraceTooltip
                      value={`${movement.radicalism.toFixed(0)} (${signed(movement.radicalDelta.total)}/mo)`}
                      trace={[
                        { label: 'Base', value: movement.radicalDelta.base },
                        { label: 'Consciousness term', value: movement.radicalDelta.consciousness },
                        { label: 'Militancy term', value: movement.radicalDelta.militancy },
                        { label: 'Needs relief', value: movement.radicalDelta.needs },
                        { label: 'Policy term', value: movement.radicalDelta.policy },
                        { label: 'Total Δ/mo', value: movement.radicalDelta.total },
                      ]}
                    />
                  </span>
                  <span>{movement.adherents.toLocaleString(undefined, { maximumFractionDigits: 0 })} adherents</span>
                  {heartland.visible.length === 0 ? (
                    <span>Heartland: dispersed</span>
                  ) : (
                    <span className="culture-heartland" data-testid="culture-heartland">
                      Heartland: {heartland.visible.join(', ')}
                      {heartland.canToggle ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="culture-heartland__toggle"
                            aria-expanded={heartlandExpanded}
                            onClick={() => setExpandedHeartlandId(heartlandExpanded ? null : movement.id)}
                          >
                            {heartlandExpanded ? 'Show less' : `+${heartland.hiddenCount} more`}
                          </button>
                        </>
                      ) : null}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Cultural Census</h3>
      <ul className="panel-list culture-list">
        {cultures.map((entry) => (
          <li key={entry.culture}>
            <div>
              <strong>{entry.name}</strong>
              <span>{entry.size.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct(entry.share)})</span>
              {entry.primary ? (
                <span className="culture-badge culture-badge--primary">Primary</span>
              ) : entry.accepted ? (
                <span className="culture-badge culture-badge--accepted">Accepted</span>
              ) : (
                <span className="culture-badge">Non-accepted</span>
              )}
            </div>
            <div>
              <span className={entry.avgMilitancy >= 4 ? 'unrest' : undefined}>
                Mil {entry.avgMilitancy.toFixed(2)}
              </span>
              <span>Con {entry.avgConsciousness.toFixed(2)}</span>
              {!entry.primary && !entry.accepted ? (
                <span>
                  Assimilated{' '}
                  <TraceTooltip
                    value={`${entry.assimilatedLastMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo`}
                    trace={[
                      { label: 'Assimilated last month', value: entry.assimilatedLastMonth },
                      { label: 'Surround^1.5', value: entry.assimilationFactors?.surround ?? 0 },
                      { label: 'Literacy factor', value: entry.assimilationFactors?.literacy ?? 0 },
                      { label: 'Policy factor', value: entry.assimilationFactors?.policy ?? 0 },
                      { label: 'Religion factor', value: entry.assimilationFactors?.religion ?? 0 },
                      { label: 'Movement resistance', value: entry.assimilationFactors?.resistance ?? 0 },
                      { label: 'Rate', value: entry.assimilationFactors?.rate ?? 0 },
                    ]}
                  />
                </span>
              ) : null}
              {!entry.primary ? (
                entry.accepted ? (
                  <button
                    type="button"
                    className="culture-accept-btn culture-accept-btn--revoke"
                    onClick={() => sendCommand({ t: 'setCultureAccepted', culture: entry.culture, accepted: false })}
                  >
                    Revoke acceptance
                  </button>
                ) : (
                  <button
                    type="button"
                    className="culture-accept-btn"
                    disabled={!entry.canAccept}
                    title={
                      entry.canAccept
                        ? `Grant acceptance: −${entry.acceptCost} prestige (→ ${entry.prestigeAfterAccept.toFixed(1)}); `
                          + `mil −1.5; radical −40; unlocks ~${entry.manpowerPreview.toLocaleString(undefined, { maximumFractionDigits: 0 })} recruitable pops.`
                        : entry.acceptBlockedReason || 'Cannot grant acceptance.'
                    }
                    onClick={() => sendCommand({ t: 'setCultureAccepted', culture: entry.culture, accepted: true })}
                  >
                    {entry.canAccept
                      ? `Grant (−${entry.acceptCost} prest · +${entry.manpowerPreview.toLocaleString(undefined, { maximumFractionDigits: 0 })} pool)`
                      : 'Grant acceptance'}
                  </button>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
