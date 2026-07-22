import { useMemo } from 'react';
import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 56;
    const y = 16 - ((value - min) / range) * 16;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 56 16" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

/** Default standing-order rate (units/day) when the player clicks Buy/Sell —
 * matches BALANCE.economy.stockpileOrderMaxDaily's order of magnitude without
 * needing a bespoke amount-input widget per row. */
const DEFAULT_STOCKPILE_DAILY_AMOUNT = 15;

export function MarketPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const data = useStore((state) => state.data);
  const sendCommand = useStore((state) => state.sendCommand);

  const goodById = useMemo(() => new Map(data?.goods.map((good) => [good.id, good.name]) ?? []), [data]);

  if (!snapshot || !data) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">World Market</h2>
        <p>Awaiting market ticker...</p>
      </section>
    );
  }

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">World Market</h2>
      <p className="panel-subtle">Global prices, supply, demand, stockpile, and shortages. Hover a figure for pricing trace inputs.</p>

      <div className="market-table-wrap">
        <table className="market-table">
          <thead>
            <tr>
              <th>Good</th>
              <th>Price</th>
              <th>Supply</th>
              <th>Demand</th>
              <th>Sold</th>
              <th>Stockpile</th>
              <th>Unmet</th>
              <th className="market-table__trend">Trend</th>
              <th>Your Reserve</th>
              <th>Standing Order</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.market.map((good) => {
              const reserve = snapshot.playerStockpile?.[good.good] ?? 0;
              const order = snapshot.playerStockpileOrders?.[good.good];
              const trace = [
                { label: 'Base price', value: good.priceTrace.basePrice },
                { label: 'Demand ratio', value: good.priceTrace.ratio },
                { label: 'Demand', value: good.priceTrace.requestedDemand },
                { label: 'Effective supply', value: good.priceTrace.effectiveSupply },
                { label: 'Stockpile start', value: good.priceTrace.stockpileStart },
                { label: 'Stockpile end', value: good.priceTrace.stockpileEnd },
              ];
              const tight = good.demand > good.supply * 1.05 || good.unmet > good.supply * 0.05;
              return (
                <tr key={good.good}>
                  <td>{goodById.get(good.good) ?? `Good ${good.good}`}</td>
                  <td className={tight ? 'status-danger' : undefined}>
                    <TraceTooltip value={`£${good.price.toFixed(2)}`} trace={trace} />
                  </td>
                  <td>
                    <TraceTooltip
                      value={good.supply.toFixed(1)}
                      trace={[
                        { label: 'Effective supply', value: good.priceTrace.effectiveSupply },
                        { label: 'Stockpile start', value: good.priceTrace.stockpileStart },
                      ]}
                    />
                  </td>
                  <td>
                    <TraceTooltip
                      value={good.demand.toFixed(1)}
                      trace={[
                        { label: 'Requested demand', value: good.priceTrace.requestedDemand },
                        { label: 'Demand ratio', value: good.priceTrace.ratio },
                      ]}
                    />
                  </td>
                  <td>{good.sold.toFixed(1)}</td>
                  <td>
                    <TraceTooltip
                      value={good.worldStockpile.toFixed(1)}
                      trace={[
                        { label: 'Stockpile start', value: good.priceTrace.stockpileStart },
                        { label: 'Stockpile end', value: good.priceTrace.stockpileEnd },
                      ]}
                    />
                  </td>
                  <td className={good.unmet > 0.5 ? 'status-danger' : undefined}>
                    {good.unmet.toFixed(1)}
                  </td>
                  <td className="market-table__trend"><Sparkline values={good.trend} /></td>
                  <td>{reserve.toFixed(1)}</td>
                  <td className="market-order-cell">
                    <button
                      type="button"
                      className={`btn btn--secondary btn--xs${order?.mode === 'buy' ? ' is-active' : ''}`}
                      title={`Buy ${DEFAULT_STOCKPILE_DAILY_AMOUNT}/day into your national reserve`}
                      onClick={() => sendCommand({
                        t: 'setStockpileOrder', good: good.good, mode: 'buy', dailyAmount: DEFAULT_STOCKPILE_DAILY_AMOUNT,
                      })}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      className={`btn btn--secondary btn--xs${order?.mode === 'sell' ? ' is-active' : ''}`}
                      title={`Sell ${DEFAULT_STOCKPILE_DAILY_AMOUNT}/day from your national reserve`}
                      onClick={() => sendCommand({
                        t: 'setStockpileOrder', good: good.good, mode: 'sell', dailyAmount: DEFAULT_STOCKPILE_DAILY_AMOUNT,
                      })}
                    >
                      Sell
                    </button>
                    {order ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        title="Stop this standing order"
                        onClick={() => sendCommand({ t: 'setStockpileOrder', good: good.good, mode: 'off', dailyAmount: 0 })}
                      >
                        Off
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
