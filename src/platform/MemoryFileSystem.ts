/**
 * Minimal in-memory stand-in for the File System Access handles that
 * AbstractWorkspaceSession and fs-helpers use, so the in-memory workspace runs
 * the same session code as the OPFS and local-directory backends.
 */

type MemoryHandle = MemoryDirectoryHandle | MemoryFileHandle;

function domError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export class MemoryFileHandle {
  readonly kind = 'file' as const;
  readonly name: string;
  private data: Blob = new Blob([]);

  constructor(name: string) {
    this.name = name;
  }

  async getFile(): Promise<File> {
    return new File([this.data], this.name);
  }

  async createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }> {
    // Like the real API, writes land in a swap buffer and replace the file on close.
    const chunks: BlobPart[] = [];
    return {
      write: async data => { chunks.push(data); },
      close: async () => { this.data = new Blob(chunks); }
    };
  }

  setBlob(blob: Blob): void {
    this.data = blob;
  }
}

export class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly name: string;
  private readonly children = new Map<string, MemoryHandle>();

  constructor(name = '') {
    this.name = name;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectoryHandle> {
    return this.getDirectorySync(name, options.create ?? false);
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFileHandle> {
    return this.getFileSync(name, options.create ?? false);
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
    const entry = this.children.get(name);
    if (!entry) throw domError('NotFoundError', `${name} was not found.`);
    if (entry.kind === 'directory' && !options.recursive && entry.children.size > 0) {
      throw domError('InvalidModificationError', `${name} is not empty.`);
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, MemoryHandle]> {
    yield* [...this.children];
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, MemoryHandle]> {
    return this.entries();
  }

  getDirectorySync(name: string, create: boolean): MemoryDirectoryHandle {
    const existing = this.children.get(name);
    if (existing?.kind === 'directory') return existing;
    if (existing) throw domError('TypeMismatchError', `${name} is a file.`);
    if (!create) throw domError('NotFoundError', `${name} was not found.`);
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }

  getFileSync(name: string, create: boolean): MemoryFileHandle {
    const existing = this.children.get(name);
    if (existing?.kind === 'file') return existing;
    if (existing) throw domError('TypeMismatchError', `${name} is a directory.`);
    if (!create) throw domError('NotFoundError', `${name} was not found.`);
    const created = new MemoryFileHandle(name);
    this.children.set(name, created);
    return created;
  }

  /** Synchronously create a file at a slash-separated path, making parent directories. */
  seedFile(path: string, blob: Blob): void {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid seed path: ${path}`);
    let dir: MemoryDirectoryHandle = this;
    for (const part of parts) dir = dir.getDirectorySync(part, true);
    dir.getFileSync(fileName, true).setBlob(blob);
  }

  /** This handle typed as the browser handle the session code expects. */
  asDirectoryHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}
