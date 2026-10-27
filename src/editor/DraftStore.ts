/**
 * Recovery drafts for unsaved section text. Each draft is one record keyed by
 * project and section path, so a write touches only that section.
 *
 * A write resolves only after its IndexedDB transaction completes. That is the
 * strongest guarantee this store makes: browsers do not promise that committed
 * data survives a crash or power loss, so recovery stays best-effort and the
 * UI reports the health of every write.
 */

export const DRAFT_SCHEMA_VERSION = 1;
const DRAFT_DB_NAME = 'clear-writer-drafts';
const DRAFT_DB_VERSION = 1;
const DRAFT_STORE_NAME = 'drafts';
const LEGACY_DRAFT_PREFIX = 'cw-draft:';
const LEGACY_SAVED_PREFIX = 'cw-draft-saved:';

export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DRAFT_ORPHAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export type DraftHealth = 'ok' | 'degraded' | 'unavailable';

export interface DraftTarget {
  readonly projectId: string;
  readonly path: string;
}

export interface DraftRecord extends DraftTarget {
  readonly schema: number;
  readonly content: string;
  /** SHA-256 of `content`, so corruption is detectable on read. */
  readonly contentHash: string;
  /** SHA-256 of the file content when the editor loaded it. Empty when unknown (migrated drafts). */
  readonly baseHash: string;
  readonly updatedAt: number;
  readonly byteLength: number;
}

/** A draft as read back, with whether its content still matches its hash. */
export interface DraftLookup {
  readonly record: DraftRecord;
  readonly intact: boolean;
}

export type DraftRestoreDecision = 'discard' | 'restore' | 'conflict';

/** Persistence port. The IndexedDB and in-memory implementations share it. */
export interface DraftBackend {
  get(target: DraftTarget): Promise<DraftRecord | undefined>;
  put(record: DraftRecord): Promise<void>;
  delete(target: DraftTarget): Promise<void>;
  list(): Promise<DraftRecord[]>;
}

export interface DraftPruneOptions {
  /** Returns true when the section is still in an open project's tree, false when it is gone, undefined for unknown projects. */
  readonly isLive?: (target: DraftTarget) => boolean | undefined;
  readonly maxTotalBytes?: number;
  readonly now?: number;
}

export async function hashDraftText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A draft whose content equals the file is obsolete. One written from the file
 * version still on disk can be restored safely. Anything else conflicts with a
 * change made after the draft was written.
 */
export function decideDraftRestore(draft: DraftRecord, currentFileHash: string): DraftRestoreDecision {
  if (draft.contentHash === currentFileHash) return 'discard';
  if (draft.baseHash !== '' && draft.baseHash === currentFileHash) return 'restore';
  return 'conflict';
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function describeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class DraftStore {
  private readonly backend: DraftBackend | null;
  private readonly now: () => number;
  private currentHealth: DraftHealth = 'ok';
  private readonly listeners = new Set<(health: DraftHealth, error?: Error) => void>();

  constructor(backend: DraftBackend | null, now: () => number = Date.now) {
    this.backend = backend;
    this.now = now;
    if (!backend) this.setHealth('unavailable', new Error('Browser storage for drafts is not available.'));
  }

  get health(): DraftHealth {
    return this.currentHealth;
  }

  onHealthChange(listener: (health: DraftHealth, error?: Error) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Returns the stored draft and whether its content still matches the hash written with it. */
  async read(target: DraftTarget): Promise<DraftLookup | null> {
    if (!this.backend) return null;
    let record: DraftRecord | undefined;
    try {
      record = await this.backend.get(target);
      this.setHealth('ok');
    } catch (error) {
      this.setHealth('unavailable', describeError(error));
      return null;
    }
    // A record from a newer schema is kept untouched: this build cannot read it.
    if (!record || record.schema > DRAFT_SCHEMA_VERSION) return null;
    const intact = record.contentHash === await hashDraftText(record.content);
    return { record, intact };
  }

  /** Stores the draft. Returns false when it could not be stored; health explains why. */
  async write(target: DraftTarget, content: string, baseHash: string): Promise<boolean> {
    if (!this.backend) return false;
    const record = await this.createRecord(target, content, baseHash);
    try {
      await this.backend.put(record);
      this.setHealth('ok');
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        // Free the drafts that can be spared, then retry once before reporting.
        await this.prune();
        try {
          await this.backend.put(record);
          this.setHealth('ok');
          return true;
        } catch (retryError) {
          this.setHealth('unavailable', describeError(retryError));
          return false;
        }
      }
      this.setHealth('degraded', describeError(error));
      return false;
    }
  }

  /** Removes the draft only when it holds exactly the content that was just saved. */
  async discardIfSaved(target: DraftTarget, savedContent: string): Promise<void> {
    if (!this.backend) return;
    try {
      const record = await this.backend.get(target);
      if (record && record.contentHash === await hashDraftText(savedContent)) {
        await this.backend.delete(target);
      }
      this.setHealth('ok');
    } catch (error) {
      this.setHealth('degraded', describeError(error));
    }
  }

  async discard(target: DraftTarget): Promise<void> {
    if (!this.backend) return;
    try {
      await this.backend.delete(target);
      this.setHealth('ok');
    } catch (error) {
      this.setHealth('degraded', describeError(error));
    }
  }

  /**
   * Deletes drafts that are obsolete: sections no longer in their project,
   * drafts older than their retention window, and the oldest drafts above the
   * byte cap. Returns the number deleted.
   */
  async prune(options: DraftPruneOptions = {}): Promise<number> {
    if (!this.backend) return 0;
    const now = options.now ?? this.now();
    const maxTotalBytes = options.maxTotalBytes ?? DRAFT_MAX_TOTAL_BYTES;
    let records: DraftRecord[];
    try {
      records = await this.backend.list();
    } catch (error) {
      this.setHealth('degraded', describeError(error));
      return 0;
    }

    const doomed = new Set<DraftRecord>();
    for (const record of records) {
      const age = now - record.updatedAt;
      const live = options.isLive?.(record);
      if (age > DRAFT_MAX_AGE_MS) doomed.add(record);
      else if (live === false && age > DRAFT_ORPHAN_MAX_AGE_MS) doomed.add(record);
    }
    let remainingBytes = 0;
    const survivors = records.filter(record => !doomed.has(record));
    for (const record of survivors) remainingBytes += record.byteLength;
    // Oldest first, so the most recent unsaved work survives the cap.
    for (const record of [...survivors].sort((a, b) => a.updatedAt - b.updatedAt)) {
      if (remainingBytes <= maxTotalBytes) break;
      doomed.add(record);
      remainingBytes -= record.byteLength;
    }

    let deleted = 0;
    for (const record of doomed) {
      try {
        await this.backend.delete(record);
        deleted += 1;
      } catch (error) {
        this.setHealth('degraded', describeError(error));
      }
    }
    return deleted;
  }

  /**
   * Moves drafts written by the earlier localStorage implementation into the
   * database, then removes the legacy keys. Legacy drafts have no base hash.
   * A draft older than its saved marker was already saved, so it is dropped.
   */
  async migrateLegacy(storage: Pick<Storage, 'key' | 'length' | 'getItem' | 'removeItem'>): Promise<number> {
    if (!this.backend) return 0;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_DRAFT_PREFIX)) keys.push(key);
    }

    let migrated = 0;
    for (const key of keys) {
      const target = parseLegacyKey(key);
      if (!target) continue;
      const raw = storage.getItem(key);
      const savedAt = Number(storage.getItem(`${LEGACY_SAVED_PREFIX}${key.slice(LEGACY_DRAFT_PREFIX.length)}`));
      const { content, updatedAt } = parseLegacyDraft(raw ?? '');
      const alreadySaved = Number.isFinite(savedAt) && savedAt > 0 && updatedAt <= savedAt;
      if (!alreadySaved && content !== null) {
        const record = await this.createRecord(target, content, '', updatedAt);
        try {
          await this.backend.put(record);
          migrated += 1;
        } catch (error) {
          this.setHealth('degraded', describeError(error));
          continue;
        }
      }
      storage.removeItem(key);
      storage.removeItem(`${LEGACY_SAVED_PREFIX}${key.slice(LEGACY_DRAFT_PREFIX.length)}`);
    }
    return migrated;
  }

  private async createRecord(target: DraftTarget, content: string, baseHash: string, updatedAt = this.now()): Promise<DraftRecord> {
    return {
      schema: DRAFT_SCHEMA_VERSION,
      projectId: target.projectId,
      path: target.path,
      content,
      contentHash: await hashDraftText(content),
      baseHash,
      updatedAt,
      byteLength: new TextEncoder().encode(content).byteLength
    };
  }

  private setHealth(next: DraftHealth, error?: Error): void {
    if (next === this.currentHealth) return;
    this.currentHealth = next;
    for (const listener of this.listeners) listener(next, error);
  }
}

/** Legacy keys are `cw-draft:<projectId>:<path>`; the project id comes first and contains no colon. */
function parseLegacyKey(key: string): DraftTarget | null {
  const rest = key.slice(LEGACY_DRAFT_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) return null;
  return { projectId: rest.slice(0, separator), path: rest.slice(separator + 1) };
}

function parseLegacyDraft(raw: string): { content: string | null; updatedAt: number } {
  try {
    const parsed = JSON.parse(raw) as { content?: unknown; updatedAt?: unknown };
    if (parsed && typeof parsed.content === 'string') {
      const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
      return { content: parsed.content, updatedAt };
    }
  } catch {
    // A raw string written by the first legacy version: no timestamp survives.
  }
  return { content: raw === '' ? null : raw, updatedAt: 0 };
}

/** In-memory backend for tests and for code paths that cannot use IndexedDB. */
export class MemoryDraftBackend implements DraftBackend {
  private readonly records = new Map<string, DraftRecord>();

  async get(target: DraftTarget): Promise<DraftRecord | undefined> {
    return this.records.get(draftKey(target));
  }

  async put(record: DraftRecord): Promise<void> {
    this.records.set(draftKey(record), record);
  }

  async delete(target: DraftTarget): Promise<void> {
    this.records.delete(draftKey(target));
  }

  async list(): Promise<DraftRecord[]> {
    return [...this.records.values()];
  }
}

function draftKey(target: DraftTarget): string {
  return `${target.projectId}\u0000${target.path}`;
}

/** IndexedDB backend. One object store, keyed by [projectId, path]. */
export class IndexedDbDraftBackend implements DraftBackend {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
        request.onupgradeneeded = (event) => {
          const database = request.result;
          // Future schema versions add their upgrade steps here, keyed by event.oldVersion.
          if (event.oldVersion < 1 && !database.objectStoreNames.contains(DRAFT_STORE_NAME)) {
            database.createObjectStore(DRAFT_STORE_NAME, { keyPath: ['projectId', 'path'] });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          // Another tab upgrading the schema must not be blocked by this one.
          database.onversionchange = () => {
            database.close();
            this.databasePromise = null;
          };
          resolve(database);
        };
        request.onerror = () => reject(request.error ?? new Error('Draft database could not be opened.'));
        request.onblocked = () => reject(new Error('Draft database upgrade is blocked by another window.'));
      }).catch(error => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  private async transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, mode);
      const request = operation(transaction.objectStore(DRAFT_STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Draft transaction was aborted.'));
    });
  }

  async get(target: DraftTarget): Promise<DraftRecord | undefined> {
    return this.transact('readonly', store => store.get([target.projectId, target.path]));
  }

  async put(record: DraftRecord): Promise<void> {
    await this.transact('readwrite', store => store.put(record));
  }

  async delete(target: DraftTarget): Promise<void> {
    await this.transact('readwrite', store => store.delete([target.projectId, target.path]));
  }

  async list(): Promise<DraftRecord[]> {
    return this.transact('readonly', store => store.getAll());
  }
}

/** The draft store for this browser: IndexedDB when it exists, otherwise unavailable. */
export function createBrowserDraftStore(): DraftStore {
  return new DraftStore(typeof indexedDB === 'undefined' ? null : new IndexedDbDraftBackend());
}
