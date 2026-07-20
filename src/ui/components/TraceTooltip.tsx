import type { TraceLine } from '../../shared/types';

interface TraceTooltipProps {
  value: string;
  trace: TraceLine[];
}

function formatTraceValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function TraceTooltip({ value, trace }: TraceTooltipProps) {
  return (
    <span className="trace-value-wrap">
      <span className="trace-value-display">{value}</span>
      {trace.length > 0 ? (
        <span className="trace-tooltip atlas-panel" role="tooltip">
          <strong className="trace-tooltip__title">Trace Inputs</strong>
          <ul className="trace-tooltip__list">
            {trace.map((entry) => (
              <li key={`${entry.label}-${entry.value}`}>
                <span>{entry.label}</span>
                <span>{formatTraceValue(entry.value)}</span>
              </li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}
