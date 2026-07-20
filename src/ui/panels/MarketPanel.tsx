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

export function MarketPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const data = useStore((state) => state.data);

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
      <table className="market-table">
        <thead>
          <tr>
            <th>Good</th>
            <th>Price</th>
            <th>Supply</th>
            <th>Demand</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.market.map((good) => {
            const trace = [
              { label: 'Base price', value: good.priceTrace.basePrice },
              { label: 'Demand ratio', value: good.priceTrace.ratio },
              { label: 'Demand', value: good.priceTrace.requestedDemand },
              { label: 'Effective supply', value: good.priceTrace.effectiveSupply },
              { label: 'Stockpile start', value: good.priceTrace.stockpileStart },
              { label: 'Stockpile end', value: good.priceTrace.stockpileEnd },
            ];
            return (
              <tr key={good.good}>
                <td>{goodById.get(good.good) ?? `Good ${good.good}`}</td>
                <td><TraceTooltip value={`£${good.price.toFixed(2)}`} trace={trace} /></td>
                <td>{good.supply.toFixed(1)}</td>
                <td>{good.demand.toFixed(1)}</td>
                <td><Sparkline values={good.trend} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
