export interface SaveRequest {
  slot: string;
  action: 'save' | 'autosave' | 'load';
  worldGeneration?: number;
}

/** Serializes saves while retaining only the newest request waiting behind one in flight. */
export class CoalescingSaveQueue {
  private active = false;
  private pendingManual: SaveRequest | null = null;
  private pendingAutosave: SaveRequest | null = null;

  get busy(): boolean {
    return this.active;
  }

  request(next: SaveRequest): SaveRequest | null {
    if (!this.active) {
      this.active = true;
      return next;
    }
    if (next.action !== 'autosave') this.pendingManual = next;
    else this.pendingAutosave = next;
    return null;
  }

  complete(): SaveRequest | null {
    const next = this.pendingManual ?? this.pendingAutosave;
    if (next) {
      if (next.action !== 'autosave') this.pendingManual = null;
      else this.pendingAutosave = null;
      return next;
    }
    this.active = false;
    return null;
  }
}
