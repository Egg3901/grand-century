import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

function canHoverFinePointer(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function TraceTooltip({ value, trace }: TraceTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const hasTrace = trace.length > 0;

  const clampToViewport = useCallback(() => {
    const tip = tipRef.current;
    const wrap = wrapRef.current;
    if (!tip || !wrap) return;

    tip.style.position = 'fixed';
    tip.style.right = 'auto';
    tip.style.bottom = 'auto';
    tip.style.transform = 'none';
    tip.style.setProperty('--trace-dx', '0px');

    const wrapRect = wrap.getBoundingClientRect();
    tip.style.maxWidth = `${window.innerWidth - VIEWPORT_MARGIN * 2}px`;
    const tipWidth = Math.min(
      tip.offsetWidth || tip.getBoundingClientRect().width,
      window.innerWidth - VIEWPORT_MARGIN * 2,
    );

    let left = wrapRect.left;
    let top = wrapRect.bottom + 6;

    if (left + tipWidth > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - VIEWPORT_MARGIN - tipWidth;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.bottom > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, wrapRect.top - tipRect.height - 6);
      tip.style.top = `${top}px`;
    }
  }, []);

  const resetPosition = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.position = '';
    tip.style.left = '';
    tip.style.top = '';
    tip.style.right = '';
    tip.style.bottom = '';
    tip.style.maxWidth = '';
    tip.style.transform = '';
    tip.style.setProperty('--trace-dx', '0px');
  }, []);

  useLayoutEffect(() => {
    if (!hasTrace) return;
    if (open) {
      clampToViewport();
    } else {
      resetPosition();
    }
  }, [open, hasTrace, clampToViewport, resetPosition, trace]);

  useEffect(() => {
    if (!open || !hasTrace) return;
    const onResize = () => clampToViewport();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, hasTrace, clampToViewport]);

  useEffect(() => {
    if (!open) return;
    const onDismiss = (event: Event) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDismiss);
    document.addEventListener('touchstart', onDismiss, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDismiss);
      document.removeEventListener('touchstart', onDismiss);
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
      onMouseEnter={() => {
        if (!hasTrace || !canHoverFinePointer()) return;
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (!hasTrace || !canHoverFinePointer()) return;
        setOpen(false);
      }}
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
