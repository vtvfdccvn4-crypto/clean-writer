import type { WorkspaceRef } from '../types';

export interface DirectoryHandleEntry {
  id: string;
  displayName: string;
  lastOpenedAt: number;
}

interface HandleStoreRecord extends DirectoryHandleEntry {
  handle: FileSystemDirectoryHandle;
}

type UiStateValue = string;

interface UiStateRecord {
  key: string;
  value: UiStateValue;
}

const DB_NAME = 'clear-writer-directory-handles';
const DB_VERSION = 1;
const HANDLES_STORE = 'handles';
const UI_STATE_STORE = 'ui-state';
const LAST_OPENED_KEY = 'last-opened-id';

export class DirectoryHandleCatalogue {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await openDatabase();
  }

  async store(id: string, handle: FileSystemDirectoryHandle, displayName: string): Promise<void> {
    const db = await this.ensureDb();
    const now = Date.now();
    await transaction(db, [HANDLES_STORE, UI_STATE_STORE], 'readwrite', stores => {
      stores[HANDLES_STORE].put({
        id,
        handle,
        displayName,
        lastOpenedAt: now
      } satisfies HandleStoreRecord);
      stores[UI_STATE_STORE].put({ key: LAST_OPENED_KEY, value: id } satisfies UiStateRecord);
    });
  }

  async getHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
    const db = await this.ensureDb();
    const record = await transaction(db, HANDLES_STORE, 'readonly', stores => stores[HANDLES_STORE].get(id));
    return (record as HandleStoreRecord | undefined)?.handle ?? null;
  }

  async list(): Promise<DirectoryHandleEntry[]> {
    const db = await this.ensureDb();
    const records = await transaction(db, HANDLES_STORE, 'readonly', stores => stores[HANDLES_STORE].getAll());
    return records
      .map((r) => {
        const { handle, ...entry } = r as HandleStoreRecord;
        return entry;
      })
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.displayName.localeCompare(b.displayName));
  }

  async listUsable(): Promise<DirectoryHandleEntry[]> {
    const db = await this.ensureDb();
    const records = await transaction(db, HANDLES_STORE, 'readonly', stores => stores[HANDLES_STORE].getAll());
    const usable: DirectoryHandleEntry[] = [];

    for (const record of records as HandleStoreRecord[]) {
      const permission = await queryHandlePermission(record.handle);
      if (permission === 'denied') {
        await this.remove(record.id);
        continue;
      }
      usable.push({
        id: record.id,
        displayName: record.displayName,
        lastOpenedAt: record.lastOpenedAt
      });
    }

    return usable.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.displayName.localeCompare(b.displayName));
  }

  async getLastOpened(): Promise<WorkspaceRef | null> {
    const db = await this.ensureDb();
    const stateRecord = await transaction(db, UI_STATE_STORE, 'readonly', stores => stores[UI_STATE_STORE].get(LAST_OPENED_KEY));
    const id = (stateRecord as UiStateRecord | undefined)?.value;
    if (!id || typeof id !== 'string') return null;

    const handleRecord = await transaction(db, HANDLES_STORE, 'readonly', stores => stores[HANDLES_STORE].get(id)) as HandleStoreRecord | undefined;
    if (!handleRecord) return null;

    // Verify handle permissions without prompting
    try {
      const permission = await (handleRecord.handle as any).queryPermission({ mode: 'readwrite' });
      if (permission === 'denied') {
        // If explicitly denied, remove from catalogue
        await this.remove(id);
        return null;
      }
    } catch {
      return null;
    }

    return {
      id: handleRecord.id,
      kind: 'directory',
      displayName: handleRecord.displayName
    };
  }

  async pickFromList(): Promise<WorkspaceRef | null> {
    await this.open();
    const entries = await this.list();
    if (!entries.length) {
      return null;
    }
    const picked = [...entries].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];

    return {
      id: picked.id,
      kind: 'directory',
      displayName: picked.displayName
    };
  }

  async remove(id: string): Promise<void> {
    const db = await this.ensureDb();
    await transaction(db, [HANDLES_STORE, UI_STATE_STORE], 'readwrite', stores => {
      stores[HANDLES_STORE].delete(id);
      const lastOpened = stores[UI_STATE_STORE].get(LAST_OPENED_KEY);
      lastOpened.onsuccess = () => {
        const record = lastOpened.result as UiStateRecord | undefined;
        if (record?.value === id) {
          stores[UI_STATE_STORE].delete(LAST_OPENED_KEY);
        }
      };
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await openDatabase();
    }
    return this.db;
  }
}

async function queryHandlePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState | 'unknown'> {
  try {
    if (typeof (handle as any).queryPermission !== 'function') return 'unknown';
    return await (handle as any).queryPermission({ mode: 'readwrite' });
  } catch {
    return 'unknown';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        const store = db.createObjectStore(HANDLES_STORE, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(UI_STATE_STORE)) {
        db.createObjectStore(UI_STATE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database ${DB_NAME}`));
  });
}

function transaction<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (stores: Record<string, IDBObjectStore>) => IDBRequest<T> | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const storeMap: Record<string, IDBObjectStore> = {};
    for (const name of Array.isArray(stores) ? stores : [stores]) {
      storeMap[name] = tx.objectStore(name);
    }

    let request: IDBRequest<T> | undefined;
    try {
      request = run(storeMap) as IDBRequest<T> | undefined;
    } catch (error) {
      reject(error);
      return;
    }

    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    } else {
      tx.oncomplete = () => resolve(undefined as T);
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}
