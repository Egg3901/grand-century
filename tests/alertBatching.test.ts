import { describe, expect, it } from 'vitest';
import type { UiAlert } from '../src/store';
import { batchAlerts, isProminentAlert, selectToastBatches } from '../src/ui/alertBatching';

function alert(partial: Partial<UiAlert> & Pick<UiAlert, 'id' | 'kind' | 'message'>): UiAlert {
  return {
    day: 100,
    panel: 'politics',
    suggestion: 'hint',
    ...partial,
  };
}

describe('alert batching', () => {
  it('collapses foreign elections into one expandable batch', () => {
    const alerts: UiAlert[] = [
      alert({ id: 'e1', kind: 'election', message: 'France elected Liberal.', day: 100 }),
      alert({ id: 'e2', kind: 'election', message: 'Prussia elected Conservative.', day: 101 }),
      alert({ id: 'e3', kind: 'election', message: 'Austria elected Liberal.', day: 102 }),
    ];
    const batches = batchAlerts(alerts, 'United Kingdom');
    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBe(3);
    expect(batches[0].message).toBe('3 elections this month');
    expect(batches[0].expandable).toBe(true);
    expect(batches[0].prominent).toBe(false);
  });

  it('keeps the player election prominent and toast-eligible', () => {
    const alerts: UiAlert[] = [
      alert({ id: 'e1', kind: 'election', message: 'France elected Liberal.', day: 100 }),
      alert({ id: 'e2', kind: 'election', message: 'United Kingdom elected Whig.', day: 100 }),
      alert({ id: 'w1', kind: 'war', message: 'War declared (War 3).', day: 101, panel: 'military' }),
    ];
    expect(isProminentAlert(alerts[1], 'United Kingdom')).toBe(true);
    expect(isProminentAlert(alerts[0], 'United Kingdom')).toBe(false);

    const batches = batchAlerts(alerts, 'United Kingdom');
    expect(batches).toHaveLength(3);
    const toasts = selectToastBatches(batches, 2);
    expect(toasts).toHaveLength(2);
    expect(toasts.map((t) => t.kind).sort()).toEqual(['election', 'war']);
    expect(toasts.find((t) => t.kind === 'election')?.message).toContain('United Kingdom');
    expect(toasts.every((t) => t.prominent)).toBe(true);
  });

  it('caps the toast stack', () => {
    const alerts: UiAlert[] = [
      alert({ id: 'w1', kind: 'war', message: 'War declared (War 1).', day: 1, panel: 'military' }),
      alert({ id: 'r1', kind: 'rebellion', message: 'Rebellion forces have risen.', day: 2, panel: 'military' }),
      alert({ id: 'u1', kind: 'unrest', message: 'High unrest risk detected (0.60).', day: 3, panel: 'politics' }),
    ];
    const toasts = selectToastBatches(batchAlerts(alerts, 'United Kingdom'), 2);
    expect(toasts).toHaveLength(2);
    expect(toasts[0].id).toBe('u1');
    expect(toasts[1].id).toBe('r1');
  });
});
