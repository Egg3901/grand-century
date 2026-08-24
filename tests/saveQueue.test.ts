import { describe, expect, it } from 'vitest';
import { CoalescingSaveQueue, type SaveRequest } from '../src/worker/saveQueue';

describe('worker save queue', () => {
  it('runs one save and retains the newest request that arrives while busy', () => {
    const queue = new CoalescingSaveQueue();
    const manual: SaveRequest = { slot: 'manual-1', action: 'save' };
    const oldAutosave: SaveRequest = { slot: 'autosave-1', action: 'autosave' };
    const newestAutosave: SaveRequest = { slot: 'autosave-2', action: 'autosave' };

    expect(queue.request(manual)).toEqual(manual);
    expect(queue.request(oldAutosave)).toBeNull();
    expect(queue.request(newestAutosave)).toBeNull();
    expect(queue.complete()).toEqual(newestAutosave);
    expect(queue.complete()).toBeNull();
    expect(queue.busy).toBe(false);
  });

  it('does not let an autosave displace a pending manual save', () => {
    const queue = new CoalescingSaveQueue();
    const active: SaveRequest = { slot: 'autosave-1', action: 'autosave' };
    const manual: SaveRequest = { slot: 'manual-1', action: 'save' };
    const autosave: SaveRequest = { slot: 'autosave-2', action: 'autosave' };

    expect(queue.request(active)).toEqual(active);
    expect(queue.request(manual)).toBeNull();
    expect(queue.request(autosave)).toBeNull();
    expect(queue.complete()).toEqual(manual);
    expect(queue.complete()).toEqual(autosave);
    expect(queue.complete()).toBeNull();
  });
});
