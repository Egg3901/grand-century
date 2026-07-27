import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';
import type { NationDetail } from '../../shared/types';
import { reformMechanicalEffect } from '../../sim/politics';
import { TraceTooltip } from '../components/TraceTooltip';

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return `£${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const CATEGORIES = ['economic', 'political', 'social', 'military'] as const;

const FRANCHISE_LEGEND = [
  { level: 0, name: 'No Franchise', weight: 'Aristocrat / capitalist / officer ≈ 0.8; others 0' },
  { level: 1, name: 'Landed', weight: 'Rich 1.0; clergy/officer 0.65; others 0.15' },
  { level: 2, name: 'Wealth', weight: 'Rich 1.0; clergy/officer/clerk 0.8; craftsman 0.6; rest 0.35' },
  { level: 3, name: 'Universal', weight: 'All pop types vote at full weight' },
] as const;

export function PoliticsPanel() {
  const snapshot = useSnapshotFields(['day', 'playerNation', 'nations'] as const);
  const detail = useStore((state) => state.nationDetail);
  const data = useStore((state) => state.data);
  const requestNation = useStore((state) => state.requestNation);
  const sendCommand = useStore((state) => state.sendCommand);

  useEffect(() => {
    if (!snapshot) return;
    requestNation(snapshot.playerNation);
  }, [requestNation, snapshot?.day, snapshot?.playerNation]);

  const player = useMemo(() => (
    snapshot?.nations.find((nation) => nation.id === snapshot.playerNation) ?? null
  ), [snapshot?.nations, snapshot?.playerNation]);

  const availability = useMemo(() => {
    if (!detail) return new Map<string, NationDetail['reformsAvailable'][number]>();
    return new Map(detail.reformsAvailable.map((entry) => [`${entry.reform}:${entry.level}`, entry]));
  }, [detail]);

  const franchiseLevel = detail?.reforms.voting_franchise ?? 0;

  if (!snapshot || !data || !player || !detail || detail.id !== snapshot.playerNation) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Politics</h2>
        <p>Assembling parliamentary brief...</p>
      </section>
    );
  }

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Politics</h2>
      <p className="panel-subtle">
        {detail.government.replaceAll('_', ' ')} · Ruling party: {detail.rulingParty} ({detail.rulingIdeology})
      </p>

      <dl className="ledger-grid">
        <div>
          <dt>Infamy</dt>
          <dd className={detail.infamy >= detail.infamyLimit ? 'status-danger' : undefined}>
            <TraceTooltip
              value={detail.infamy.toFixed(1)}
              trace={[
                { label: 'Infamy limit', value: detail.infamyLimit },
                { label: 'Coalition size', value: detail.coalitionAgainst.length },
              ]}
            />
            <span className="ledger-suffix"> / {detail.infamyLimit.toFixed(1)}</span>
          </dd>
        </div>
        <div>
          <dt>Suppression</dt>
          <dd className={detail.politicalSuppression >= 0.7 ? 'unrest' : undefined}>
            <TraceTooltip
              value={pct(detail.politicalSuppression)}
              trace={[
                { label: 'Franchise level', value: franchiseLevel },
                { label: 'Press level', value: detail.reforms.press_rights ?? 0 },
                { label: 'Feeds militancy & unrest', value: detail.politicalSuppression },
              ]}
            />
          </dd>
        </div>
        <div>
          <dt>Avg Militancy</dt>
          <dd className={detail.avgMilitancy >= 4 ? 'unrest' : undefined}>
            <TraceTooltip
              value={detail.avgMilitancy.toFixed(2)}
              trace={detail.stateUnrest.slice(0, 4).map((entry) => ({ label: entry.name, value: entry.militancy }))}
            />
          </dd>
        </div>
        <div>
          <dt>Avg Consciousness</dt>
          <dd>
            <TraceTooltip
              value={detail.avgConsciousness.toFixed(2)}
              trace={[
                { label: 'National consciousness', value: detail.avgConsciousness },
                { label: 'Average militancy', value: detail.avgMilitancy },
                { label: 'Top reform demand', value: detail.topReformDemands[0]?.support ?? 0 },
              ]}
            />
          </dd>
        </div>
        <div>
          <dt>Election</dt>
          <dd>
            {detail.election.elective
              ? `${detail.election.yearsToNext}y · ${detail.election.nextYear}`
              : 'Not elective'}
          </dd>
        </div>
        <div>
          <dt>Last Result</dt>
          <dd>
            {detail.election.lastResult}
            {detail.election.winnerShare > 0 ? ` (${pct(detail.election.winnerShare)})` : ''}
          </dd>
        </div>
        <div>
          <dt>Mobilization Cap</dt>
          <dd>{detail.military.mobilizationCapacity}</dd>
        </div>
        <div>
          <dt>Standing Cap</dt>
          <dd>{detail.military.standingRegimentCapacity}</dd>
        </div>
        <div>
          <dt>Org / Morale</dt>
          <dd>
            ×{detail.military.armyOrganization.toFixed(2)} · ×{detail.military.armyMorale.toFixed(2)}
          </dd>
        </div>
      </dl>

      <h3 className="atlas-heading panel-small-heading">Franchise Weights</h3>
      <ul className="panel-list">
        {FRANCHISE_LEGEND.map((entry) => (
          <li key={entry.level} className={entry.level === franchiseLevel ? undefined : 'panel-subtle'}>
            <span>
              {entry.level === franchiseLevel ? '▸ ' : ''}
              {entry.name}
            </span>
            <span>{entry.weight}</span>
          </li>
        ))}
      </ul>

      {detail.election.ideologyShares.length > 0 ? (
        <>
          <h3 className="atlas-heading panel-small-heading">Last Election — Ideology Vote Share</h3>
          <ul className="panel-list">
            {detail.election.ideologyShares.map((entry) => (
              <li key={entry.ideology}>
                <span>{entry.ideology}</span>
                <span>{pct(entry.share)}</span>
              </li>
            ))}
            <li>
              <span>Winner share</span>
              <span>{pct(detail.election.winnerShare)}</span>
            </li>
          </ul>
        </>
      ) : null}

      <h3 className="atlas-heading panel-small-heading">Parties & Platforms</h3>
      <ul className="panel-list mil-list">
        {detail.parties.map((party) => {
          const ahead = party.positions.filter((pos) => pos.level > pos.current);
          const behind = party.positions.filter((pos) => pos.level < pos.current);
          return (
            <li key={party.key}>
              <div>
                <strong>
                  {party.name}
                  {party.ruling ? ' (ruling)' : ''}
                </strong>
                <span>{party.ideology}</span>
              </div>
              <div>
                <span>
                  Enacts toward:{' '}
                  {ahead.length > 0
                    ? ahead.slice(0, 4).map((pos) => `${pos.reform.replaceAll('_', ' ')}→${pos.level}`).join(', ')
                    : 'current levels'}
                </span>
                {behind.length > 0 ? (
                  <span className="panel-subtle">
                    Below current: {behind.slice(0, 3).map((pos) => pos.reform.replaceAll('_', ' ')).join(', ')}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="atlas-heading panel-small-heading">Upper House</h3>
      <ul className="panel-list">
        {detail.upperHouse.map((entry) => (
          <li key={entry.ideology}>
            <span>{entry.ideology}</span>
            <span>{pct(entry.share)}</span>
          </li>
        ))}
      </ul>

      <h3 className="atlas-heading panel-small-heading">Issues & Unrest</h3>
      <ul className="panel-list">
        {detail.topReformDemands.map((entry) => (
          <li key={entry.reform}>
            <span>{entry.reform.replaceAll('_', ' ')}</span>
            <span>{pct(entry.support)}</span>
          </li>
        ))}
        {detail.topReformDemands.length === 0 ? <li><span>No major agitation</span><span>0%</span></li> : null}
      </ul>
      <ul className="panel-list mil-list">
        {detail.stateUnrest.slice(0, 3).map((entry) => (
          <li key={entry.stateId}>
            <div>
              <strong>{entry.name}</strong>
              <span>
                Risk{' '}
                <TraceTooltip
                  value={entry.risk.toFixed(2)}
                  trace={[
                    { label: 'State militancy', value: entry.militancy },
                    { label: 'Suppression', value: detail.politicalSuppression },
                    { label: 'Reform pressure', value: detail.topReformDemands[0]?.support ?? 0 },
                  ]}
                />
                {' · '}
                Mil{' '}
                <TraceTooltip
                  value={entry.militancy.toFixed(2)}
                  trace={[
                    { label: 'State militancy', value: entry.militancy },
                    { label: 'State unrest risk', value: entry.risk },
                    { label: 'National militancy', value: detail.avgMilitancy },
                  ]}
                />
              </span>
            </div>
          </li>
        ))}
      </ul>

      {CATEGORIES.map((category) => (
        <div key={category}>
          <h3 className="atlas-heading panel-small-heading">{category[0].toUpperCase()}{category.slice(1)} Reforms</h3>
          <div className="production-build-grid">
            {data.reforms
              .filter((reform) => reform.category === category)
              .map((reform) => {
                const current = detail.reforms[reform.key] ?? 0;
                const currentMech = reformMechanicalEffect(reform.key, current);
                return (
                  <div key={reform.key} className="production-build-row">
                    <strong>{reform.name}</strong>
                    <span>Current: {reform.options[current]?.name ?? 'Unknown'}</span>
                    {currentMech ? <span className="panel-subtle">Effect: {currentMech}</span> : null}
                    <div className="production-build-actions">
                      {reform.options.map((option, level) => {
                        if (level <= current) {
                          return (
                            <button key={option.key} type="button" className="btn btn--ghost" disabled>
                              {option.name} (Enacted)
                            </button>
                          );
                        }
                        const next = availability.get(`${reform.key}:${level}`);
                        const legal = next?.legal ?? false;
                        const reason = next?.reason ?? 'Unavailable';
                        const isNextStep = level === current + 1;
                        const supportLabel = isNextStep
                          ? `UH ${pct(next?.support ?? 0)} / ${pct(next?.requiredSupport ?? 0)}`
                          : null;
                        const mech = reformMechanicalEffect(reform.key, level);
                        const titleParts = [
                          reason,
                          `Support ${pct(next?.support ?? 0)} / ${pct(next?.requiredSupport ?? 0)}`,
                          `Cost ${money(next?.costMoney ?? 0)} + ${next?.costPrestige.toFixed(1) ?? '0.0'} prestige`,
                        ];
                        if (mech) titleParts.push(`Effect: ${mech}`);
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={legal ? 'btn btn--primary' : 'btn btn--secondary'}
                            data-coach-id={legal ? 'reform-action' : undefined}
                            disabled={!legal}
                            title={titleParts.join(' | ')}
                            onClick={() => sendCommand({ t: 'enactReform', reform: reform.key, level })}
                          >
                            {legal
                              ? `Enact ${option.name}${supportLabel ? ` · ${supportLabel}` : ''}`
                              : `${option.name}${supportLabel ? ` · ${supportLabel}` : ''} (${reason})`}
                          </button>
                        );
                      })}
                    </div>
                    {reform.options[current + 1] ? (
                      <span className="panel-subtle">
                        Next effect: {reformMechanicalEffect(reform.key, current + 1)
                          ?? (reform.options[current + 1]?.effects[0] ?? '—')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
