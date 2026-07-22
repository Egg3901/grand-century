/** Heartland name list truncation for National Movements. */

export const HEARTLAND_PREVIEW_LIMIT = 5;

export interface HeartlandDisplay {
  /** Names shown for the current expanded/collapsed state. */
  visible: string[];
  /** How many names are hidden when collapsed (0 when expanded or short). */
  hiddenCount: number;
  /** Whether the list is long enough to offer expand/collapse. */
  canToggle: boolean;
}

/**
 * Truncate an unbounded heartland name list for ledger display.
 * Empty input means "dispersed" at the call site — returns empty visible.
 */
export function heartlandDisplay(
  names: readonly string[],
  expanded: boolean,
  limit = HEARTLAND_PREVIEW_LIMIT,
): HeartlandDisplay {
  if (names.length === 0) {
    return { visible: [], hiddenCount: 0, canToggle: false };
  }
  if (names.length <= limit) {
    return { visible: [...names], hiddenCount: 0, canToggle: false };
  }
  if (expanded) {
    return { visible: [...names], hiddenCount: 0, canToggle: true };
  }
  return {
    visible: names.slice(0, limit),
    hiddenCount: names.length - limit,
    canToggle: true,
  };
}
