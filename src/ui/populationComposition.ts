/** Pure helpers for the Population Census composition chart. */

export interface PopSizeEntry {
  type: string;
  size: number;
}

export interface PopShareSegment {
  type: string;
  size: number;
  /** Share of total population in [0, 1]. */
  share: number;
  /** Cumulative share before this segment (stacked-bar x origin). */
  offset: number;
}

/**
 * Build left-to-right stacked-bar segments sized by population share.
 * Zero-total or empty input yields an empty array.
 */
export function populationComposition(entries: readonly PopSizeEntry[]): PopShareSegment[] {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.size), 0);
  if (total <= 0 || entries.length === 0) return [];

  let offset = 0;
  return entries.map((entry) => {
    const size = Math.max(0, entry.size);
    const share = size / total;
    const segment: PopShareSegment = { type: entry.type, size, share, offset };
    offset += share;
    return segment;
  });
}

/** SVG viewBox width used by the composition bar (unitless). */
export const POP_COMPOSITION_WIDTH = 100;
export const POP_COMPOSITION_HEIGHT = 12;

/** Map a share/offset in [0, 1] onto the composition SVG x-axis. */
export function shareToSvgX(fraction: number, width = POP_COMPOSITION_WIDTH): number {
  return Math.max(0, Math.min(width, fraction * width));
}
