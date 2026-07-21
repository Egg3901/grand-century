import { useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import type { NationDetail } from '../../shared/types';
import { TraceTooltip } from '../components/TraceTooltip';

function pct(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return `£${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const CATEGORIES = ['economic', 'political', 'social', 'military'] as const;

export function PoliticsPanel() {
  const snapshot = useStore((state) => state.snapshot);
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
  ), [snapshot]);

  const availability = useMemo(() => {
    if (!detail) return new Map<string, NationDetail['reformsAvailable'][number]>();
    return new Map(detail.reformsAvailable.map((entry) => [`${entry.reform}:${entry.level}`, entry]));
  }, [detail]);

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
          <dd>{detail.election.lastResult}</dd>
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
                    { label: 'National consciousness', value: detail.avgConsciousness },
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
                return (
                  <div key={reform.key} className="production-build-row">
                    <strong>{reform.name}</strong>
                    <span>Current: {reform.options[current]?.name ?? 'Unknown'}</span>
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
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={legal ? 'btn btn--primary' : 'btn btn--secondary'}
                            data-coach-id={legal ? 'reform-action' : undefined}
                            disabled={!legal}
                            title={`${reason} | Support ${pct(next?.support ?? 0)} / ${pct(next?.requiredSupport ?? 0)} | Cost ${money(next?.costMoney ?? 0)} + ${next?.costPrestige.toFixed(1) ?? '0.0'} prestige`}
                            onClick={() => sendCommand({ t: 'enactReform', reform: reform.key, level })}
                          >
                            {legal ? `Enact ${option.name}` : `${option.name} (${reason})`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
