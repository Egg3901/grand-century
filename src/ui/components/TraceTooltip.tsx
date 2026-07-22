import { useCallback, useEffect, useRef, useState } from 'react';
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

const VIEWPORT_MARGIN = 8;

export function TraceTooltip({ value, trace }: TraceTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const hasTrace = trace.length > 0;

  const clampToViewport = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.setProperty('--trace-dx', '0px');
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) {
      dx = window.innerWidth - VIEWPORT_MARGIN - rect.right;
    }
    if (rect.left + dx < VIEWPORT_MARGIN) {
      dx += VIEWPORT_MARGIN - (rect.left + dx);
    }
    tip.style.setProperty('--trace-dx', `${dx}px`);
  }, []);

  useEffect(() => {
    if (!open || !hasTrace) return;
    clampToViewport();
    const onResize = () => clampToViewport();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, hasTrace, clampToViewport, trace]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!hasTrace) return;
    setOpen((prev) => !prev);
  };

  return (
    <span
      ref={wrapRef}
      className={`trace-value-wrap${open ? ' is-open' : ''}`}
      onMouseEnter={hasTrace ? clampToViewport : undefined}
    >
      <span
        className="trace-value-display"
        tabIndex={hasTrace ? 0 : undefined}
        role={hasTrace ? 'button' : undefined}
        aria-expanded={hasTrace ? open : undefined}
        aria-haspopup={hasTrace ? 'true' : undefined}
        data-testid={hasTrace ? 'trace-tooltip-trigger' : undefined}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        {value}
      </span>
      {hasTrace ? (
        <span
          ref={tipRef}
          className="trace-tooltip atlas-panel"
          role="tooltip"
          data-testid="trace-tooltip"
        >
          <strong className="trace-tooltip__title">Trace Inputs</strong>
          <span className="trace-tooltip__list">
            {trace.map((entry) => (
              <span className="trace-tooltip__row" key={`${entry.label}-${entry.value}`}>
                <span>{entry.label}</span>
                <span>{formatTraceValue(entry.value)}</span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
