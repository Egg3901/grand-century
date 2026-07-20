import { openDB } from 'idb';

const DB_NAME = 'grand-century-saves';
const DB_VERSION = 1;
const STORE = 'slots';

interface SaveSlotRecord {
  slot: string;
  updatedAt: number;
  day: number;
  playerNation: number;
  payload: ArrayBufferLike;
}

export interface SaveSlotSummary {
  slot: string;
  updatedAt: number;
  day: number;
  playerNation: number;
}

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'slot' });
      }
    },
  });
}

export async function writeSaveSlot(
  slot: string,
  payload: Uint8Array,
  day: number,
  playerNation: number,
): Promise<void> {
  const database = await db();
  const record: SaveSlotRecord = {
    slot,
    updatedAt: Date.now(),
    day,
    playerNation,
    payload: payload.slice().buffer,
  };
  await database.put(STORE, record);
}

export async function readSaveSlot(slot: string): Promise<Uint8Array | null> {
  const database = await db();
  const record = await database.get(STORE, slot) as SaveSlotRecord | undefined;
  if (!record?.payload) return null;
  return new Uint8Array(record.payload);
}

export async function listSaveSlots(): Promise<SaveSlotSummary[]> {
  const database = await db();
  const records = await database.getAll(STORE) as SaveSlotRecord[];
  return records
    .map((record) => ({
      slot: record.slot,
      updatedAt: record.updatedAt,
      day: record.day,
      playerNation: record.playerNation,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.slot.localeCompare(b.slot));
}

