import type { FromWorker, ToWorker, WorldSnapshot } from '../../../src/shared/types';
export type NativeRequest = ToWorker
  | { t: 'exportSave'; request: number }
  | { t: 'importSave'; request: number; payload: number[] };
export type NativeResponse = FromWorker
  | { t: 'exportedSave'; request: number; payload: number[]; snapshot: WorldSnapshot }
  | { t: 'importedSave'; request: number }
  | { t: 'storageError'; request: number; message: string };
