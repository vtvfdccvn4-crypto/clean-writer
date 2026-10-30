import { describeBytes } from './format';
import { BACKUP_LIMITS_BYTES } from './zip';

/**
 * Errors raised while reading or writing a document, and the checks that run before a document is created. A
 * document is built in memory, so its size limits and storage checks are shared here.
 */

/** An error whose message can be shown to the user as it is. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const OUT_OF_MEMORY = /allocation|out of memory|invalid array length|array buffer|buffer size|memory/i;

/**
 * Turns a failure while making or reading a document into a message a person can act on. A backup is built in
 * memory, so running out of it is named as that, not reported as a general failure.
 */
export function describeBackupFailure(error: unknown, doing: 'make' | 'read'): BackupError | null {
  if (error instanceof BackupError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (name === 'QuotaExceededError' || /quota|no space|disk full/i.test(message)) {
    return new BackupError('Browser storage ran out of space while importing the document, so no project was created. Free space in this browser (delete projects you no longer need, or clear other site data) and try again.');
  }
  if ((error instanceof RangeError && OUT_OF_MEMORY.test(message)) || OUT_OF_MEMORY.test(message) || name === 'NotReadableError') {
    return new BackupError(doing === 'make'
      ? `This browser ran out of memory while making the document (a document is built in memory, up to ${describeBytes(BACKUP_LIMITS_BYTES.project)} of project files). Close other tabs and try again, or delete large images you no longer need.`
      : `This browser ran out of memory while reading the document, or could not read the file. Close other tabs and try again. A backup can hold up to ${describeBytes(BACKUP_LIMITS_BYTES.project)} of project files.`);
  }
  return null;
}

/** Refuses a file that is too large to read in memory, before any of it is read. */
export function checkBackupFileSize(bytes: number): void {
  if (bytes > BACKUP_LIMITS_BYTES.archive) {
    throw new BackupError(`This file is ${describeBytes(bytes)}, larger than the ${describeBytes(BACKUP_LIMITS_BYTES.archive)} a document can be. It cannot be imported here. If it is a Clear Writer backup, the project is too large for a browser-based restore.`);
  }
}

/** Refuses an import that would not fit in the free browser storage, before a project is created. Skipped when the browser cannot say. */
export async function checkStorageFor(projectBytes: number): Promise<void> {
  const estimate = typeof navigator !== 'undefined' ? await navigator.storage?.estimate?.().catch(() => undefined) : undefined;
  if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return;
  const free = estimate.quota - estimate.usage;
  const needed = Math.ceil(projectBytes * 1.1) + 1024 * 1024;
  if (free < needed) {
    throw new BackupError(`There is not enough browser storage to import this backup: it needs about ${describeBytes(needed)} and this browser has about ${describeBytes(Math.max(0, free))} free. Free space (delete projects you no longer need) and try again. Nothing was imported.`);
  }
}
