import { createDocumentFromSource } from '../backup/document-bundle';
import { BackupError } from '../backup/document-errors';
import { InMemoryWorkspaceSession } from './InMemoryWorkspace';

/** How long a change waits before it is written to the file, so a run of edits becomes one write. */
const SAVE_DELAY_MS = 1500;

/**
 * A document opened in place from a `.cwdoc` file on the computer. The document is held in memory, as a transient
 * workspace is, and every change is written back to that file after a short delay. A save refuses to overwrite
 * the file if it changed on disk since it was opened.
 */
export class CwdocFileWorkspace extends InMemoryWorkspaceSession {
  /** Told when a write to the file fails, so the person hears about it rather than losing the change silently. */
  onSaveError: ((error: unknown) => void) | null = null;

  private handle: FileSystemFileHandle | null = null;
  private knownModified = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  /** The file name on disk, or null before a file is attached. */
  get fileName(): string | null {
    return this.handle?.name ?? null;
  }

  /**
   * Starts writing changes back to the file. Call it after the document's content has been loaded, so loading
   * itself does not count as a change. `lastModified` is the file's timestamp when it was read.
   */
  attachFile(handle: FileSystemFileHandle, lastModified: number): void {
    this.handle = handle;
    this.knownModified = lastModified;
  }

  protected serializedWrite(path: string, perform: () => Promise<void>): Promise<void> {
    return super.serializedWrite(path, perform).then(() => this.scheduleSave());
  }

  /** Writes any pending change to the file now. Resolves when the file holds the latest content. */
  flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.handle) return Promise.resolve();
    const write = this.pendingWrite.then(() => this.writeToFile());
    this.pendingWrite = write.catch(() => undefined);
    return write;
  }

  private scheduleSave(): void {
    if (!this.handle) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch(error => this.onSaveError?.(error));
    }, SAVE_DELAY_MS);
  }

  private async writeToFile(): Promise<void> {
    const handle = this.handle;
    if (!handle) return;
    const onDisk = await handle.getFile();
    if (onDisk.lastModified !== this.knownModified) {
      throw new BackupError(`${handle.name} changed on disk after it was opened, so your changes were not written to it. Keep the file that is on disk, then open it again to continue.`);
    }
    const saved = await createDocumentFromSource(this);
    await writeHandle(handle, saved.bytes);
    this.knownModified = (await handle.getFile()).lastModified;
  }
}

/** Replaces the contents of a file on disk. The browser keeps the old contents unless the write completes. */
export async function writeHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}
