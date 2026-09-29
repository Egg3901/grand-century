import { Worker } from '@ammarahmed/react-native-workers';
import type { FromWorker, ToWorker, WorldSnapshot } from '../../../src/shared/types';
import type { NativeRequest, NativeResponse } from './nativeProtocol';

type Exported = { payload: Uint8Array; snapshot: WorldSnapshot };
export class NativeSimTransport {
  private readonly worker = new Worker('./sim.worker');
  private handler: ((message: FromWorker) => void) | null = null;
  private sequence = 0;
  private requests = new Map<number, { resolve: (result: Exported | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor() {
    this.worker.onmessage = (event: { data: unknown }) => {
      const message = event.data as NativeResponse;
      if ('request' in message) {
        const pending = this.requests.get(message.request);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.requests.delete(message.request);
        if (message.t === 'storageError') pending.reject(new Error(message.message));
        else pending.resolve(message.t === 'exportedSave' ? { payload: new Uint8Array(message.payload), snapshot: message.snapshot } : null);
      } else this.handler?.(message);
    };
  }
  send(message: ToWorker): void { this.worker.postMessage(message); }
  onMessage(handler: (message: FromWorker) => void): void { this.handler = handler; }
  private request(message: { t: 'exportSave' } | { t: 'importSave'; payload: number[] }): Promise<Exported | null> {
    const request = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(request); reject(new Error('The campaign took too long to respond. Please try again.')); }, 30000);
      this.requests.set(request, { resolve, reject, timer });
      this.worker.postMessage({ ...message, request } satisfies NativeRequest);
    });
  }
  async exportSave(): Promise<Exported> { return (await this.request({ t: 'exportSave' }))!; }
  async importSave(payload: Uint8Array): Promise<void> { await this.request({ t: 'importSave', payload: Array.from(payload) }); }
  dispose(): void {
    for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(new Error('Campaign closed.')); }
    this.requests.clear();
    this.worker.terminate();
    this.handler = null;
  }
}
