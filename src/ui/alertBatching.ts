import type { UiAlert } from '../store';

/** High-signal kinds that may appear as toast popups. */
const PROMINENT_KINDS = new Set<UiAlert['kind']>([
  'war',
  'peace',
  'bankruptcy',
  'rebellion',
  'formation',
  'unrest',
  'event',
  'market',
]);

export type AlertBatch = {
  id: string;
  kind: UiAlert['kind'];
  day: number;
  message: string;
  suggestion?: string;
  panel: UiAlert['panel'];
  count: number;
  members: UiAlert[];
  prominent: boolean;
  expandable: boolean;
};

function monthBucket(day: number): number {
  return Math.floor(Math.max(0, day) / 30);
}

function groupKey(alert: UiAlert, playerNationName: string | null): string {
  if (alert.kind === 'election') {
    const isPlayer = Boolean(playerNationName && alert.message.startsWith(`${playerNationName} `));
    if (isPlayer) return alert.id;
    return `election-${monthBucket(alert.day)}`;
  }
  if (alert.kind === 'save') return `save-${alert.day}`;
  if (alert.kind === 'peace' && alert.message.startsWith('Peace signed')) {
    return `peace-signed-${monthBucket(alert.day)}`;
  }
  return alert.id;
}

function batchMessage(kind: UiAlert['kind'], members: UiAlert[]): string {
  if (members.length === 1) return members[0].message;
  if (kind === 'election') return `${members.length} elections this month`;
  if (kind === 'peace') return `${members.length} peace settlements this month`;
  if (kind === 'save') return `${members.length} save notices`;
  return `${members.length} ${kind} alerts`;
}

/** Whether an alert should interrupt as a toast (vs quiet outliner only). */
export function isProminentAlert(alert: UiAlert, playerNationName: string | null): boolean {
  if (alert.kind === 'election') {
    if (!playerNationName) return false;
    return alert.message.startsWith(`${playerNationName} `);
  }
  if (alert.kind === 'bankruptcy') {
    if (!playerNationName) return true;
    return alert.message.startsWith(`${playerNationName} `);
  }
  if (alert.kind === 'peace') {
    // Routine "Peace signed" is quieter; leverage windows stay prominent.
    return alert.message.startsWith('Peace leverage');
  }
  return PROMINENT_KINDS.has(alert.kind);
}

/** Collapse similar routine alerts (elections, etc.) into expandable groups. */
export function batchAlerts(alerts: UiAlert[], playerNationName: string | null): AlertBatch[] {
  const groups = new Map<string, UiAlert[]>();
  for (const alert of alerts) {
    const key = groupKey(alert, playerNationName);
    const list = groups.get(key);
    if (list) list.push(alert);
    else groups.set(key, [alert]);
  }

  const batches: AlertBatch[] = [];
  for (const [key, members] of groups) {
    const newest = members[members.length - 1];
    const prominent = members.some((m) => isProminentAlert(m, playerNationName));
    batches.push({
      id: key,
      kind: newest.kind,
      day: newest.day,
      message: batchMessage(newest.kind, members),
      suggestion: newest.suggestion,
      panel: newest.panel,
      count: members.length,
      members,
      prominent,
      expandable: members.length > 1,
    });
  }

  return batches.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
}

/** Toast stack: only prominent batches, newest first, hard-capped. */
export function selectToastBatches(batches: AlertBatch[], cap = 2): AlertBatch[] {
  return batches.filter((b) => b.prominent).slice(-cap).reverse();
}

export const TOAST_AUTO_DISMISS_MS = 4500;
export const TOAST_STACK_CAP = 2;
export const OUTLINER_VISIBLE_CAP = 8;
