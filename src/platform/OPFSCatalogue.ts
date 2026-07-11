import type { WorkspaceRef } from '../types';

export interface WorkspaceCatalogueEntry {
  id: string;
  displayName: string;
  createdAt: number;
  lastOpenedAt: number;
}

type UiStateValue = string;

interface UiStateRecord {
  key: string;
  value: UiStateValue;
}

const DB_NAME = 'clear-writer-catalogue';
const DB_VERSION = 1;
const WORKSPACES_STORE = 'workspaces';
const UI_STATE_STORE = 'ui-state';
const LAST_OPENED_KEY = 'last-opened-id';

export class OPFSCatalogue {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await openDatabase();
  }

  async register(ref: WorkspaceRef): Promise<void> {
    const db = await this.ensureDb();
    const now = Date.now();
    await transaction(db, [WORKSPACES_STORE, UI_STATE_STORE], 'readwrite', stores => {
      stores[WORKSPACES_STORE].put({
        id: ref.id,
        displayName: ref.displayName,
        createdAt: now,
        lastOpenedAt: now
      } satisfies WorkspaceCatalogueEntry);
      stores[UI_STATE_STORE].put({ key: LAST_OPENED_KEY, value: ref.id } satisfies UiStateRecord);
    });
  }

  async touch(id: string): Promise<void> {
    const db = await this.ensureDb();
    const now = Date.now();
    const entry = await transaction(db, WORKSPACES_STORE, 'readonly', stores => stores[WORKSPACES_STORE].get(id)) as WorkspaceCatalogueEntry | undefined;
    if (!entry) return;
    await transaction(db, [WORKSPACES_STORE, UI_STATE_STORE], 'readwrite', stores => {
      stores[WORKSPACES_STORE].put({ ...entry, lastOpenedAt: now });
      stores[UI_STATE_STORE].put({ key: LAST_OPENED_KEY, value: id } satisfies UiStateRecord);
    });
  }

  async list(): Promise<WorkspaceCatalogueEntry[]> {
    const db = await this.ensureDb();
    const entries = await transaction(db, WORKSPACES_STORE, 'readonly', stores => stores[WORKSPACES_STORE].getAll());
    return entries
      .map(entry => entry as WorkspaceCatalogueEntry)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.createdAt - a.createdAt || a.displayName.localeCompare(b.displayName));
  }

  async get(id: string): Promise<WorkspaceCatalogueEntry | null> {
    const db = await this.ensureDb();
    const entry = await transaction(db, WORKSPACES_STORE, 'readonly', stores => stores[WORKSPACES_STORE].get(id));
    return (entry as WorkspaceCatalogueEntry | undefined) ?? null;
  }

  async getLastOpenedId(): Promise<string | null> {
    const db = await this.ensureDb();
    const record = await transaction(db, UI_STATE_STORE, 'readonly', stores => stores[UI_STATE_STORE].get(LAST_OPENED_KEY));
    const value = (record as UiStateRecord | undefined)?.value;
    return typeof value === 'string' && value ? value : null;
  }

  async setLastOpenedId(id: string | null): Promise<void> {
    const db = await this.ensureDb();
    await transaction(db, UI_STATE_STORE, 'readwrite', stores => {
      if (id) {
        stores[UI_STATE_STORE].put({ key: LAST_OPENED_KEY, value: id } satisfies UiStateRecord);
      } else {
        stores[UI_STATE_STORE].delete(LAST_OPENED_KEY);
      }
    });
  }

  async rename(id: string, displayName: string): Promise<void> {
    const db = await this.ensureDb();
    await transaction(db, WORKSPACES_STORE, 'readwrite', stores => {
      const current = stores[WORKSPACES_STORE].get(id);
      current.onsuccess = () => {
        const entry = current.result as WorkspaceCatalogueEntry | undefined;
        if (!entry) return;
        stores[WORKSPACES_STORE].put({ ...entry, displayName });
      };
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.ensureDb();
    await transaction(db, [WORKSPACES_STORE, UI_STATE_STORE], 'readwrite', stores => {
      stores[WORKSPACES_STORE].delete(id);
      const lastOpened = stores[UI_STATE_STORE].get(LAST_OPENED_KEY);
      lastOpened.onsuccess = () => {
        const record = lastOpened.result as UiStateRecord | undefined;
        if (record?.value === id) {
          stores[UI_STATE_STORE].delete(LAST_OPENED_KEY);
        }
      };
    });
  }

  async getUiState(key: string): Promise<string | null> {
    const db = await this.ensureDb();
    const record = await transaction(db, UI_STATE_STORE, 'readonly', stores => stores[UI_STATE_STORE].get(key));
    const value = (record as UiStateRecord | undefined)?.value;
    return typeof value === 'string' ? value : null;
  }

  async setUiState(key: string, value: string): Promise<void> {
    const db = await this.ensureDb();
    await transaction(db, UI_STATE_STORE, 'readwrite', stores => {
      stores[UI_STATE_STORE].put({ key, value } satisfies UiStateRecord);
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await openDatabase();
    }
    return this.db;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACES_STORE)) {
        const store = db.createObjectStore(WORKSPACES_STORE, { keyPath: 'id' });
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
