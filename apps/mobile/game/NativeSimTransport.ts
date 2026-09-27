import { Worker } from '@ammarahmed/react-native-workers';
import type { FromWorker, ToWorker } from '../../../src/shared/types';

export class NativeSimTransport {
  private readonly worker = new Worker('./sim.worker');
  private handler: ((message: FromWorker) => void) | null = null;

  constructor() {
    this.worker.onmessage = (event: { data: unknown }) => this.handler?.(event.data as FromWorker);
  }

  send(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  onMessage(handler: (message: FromWorker) => void): void {
    this.handler = handler;
  }

  dispose(): void {
    this.worker.terminate();
    this.handler = null;
  }
}
