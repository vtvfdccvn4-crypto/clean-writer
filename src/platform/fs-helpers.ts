import type { FileNode } from '../types';
import { normalizeExplorerPath } from '../utils/path-utils';

export async function readJson<T>(handle: FileSystemFileHandle): Promise<T> {
  const file = await handle.getFile();
  return JSON.parse(await file.text()) as T;
}

/**
 * Writes a whole file. Browser writes land in a swap buffer and replace the file
 * only on close, so a failed write that is aborted leaves the previous contents in place.
 */
export async function writeFile(handle: FileSystemFileHandle, data: FileSystemWriteChunkType): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function writeJson(handle: FileSystemFileHandle, value: unknown): Promise<void> {
  await writeFile(handle, JSON.stringify(value, null, 2));
}

export async function ensureDirectory(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function getDirectory(parent: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemDirectoryHandle | null> {
  const parts = normalizeExplorerPath(path).split('/').filter(Boolean);
  let current: FileSystemDirectoryHandle = parent;
  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part, { create });
    } catch {
      return null;
    }
  }
  return current;
}

export async function getFile(parent: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemFileHandle | null> {
  const parts = normalizeExplorerPath(path).split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  const dir = await getDirectory(parent, parts.join('/'), create);
  if (!dir) return null;
  try {
    return await dir.getFileHandle(fileName, { create });
  } catch {
    return null;
  }
}

export async function deleteEntry(parent: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  const normalized = normalizeExplorerPath(path);
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.pop();
  if (!name) return false;

  const file = await getFile(parent, normalized, false);
  if (file) {
    const parentDir = await getDirectory(parent, segments.join('/'), false);
    if (!parentDir) return false;
    try {
      await parentDir.removeEntry(name, { recursive: false });
      return true;
    } catch {
      return false;
    }
  }
  const dir = await getDirectory(parent, normalized, false);
  if (!dir) return false;
  const parentDir = await getDirectory(parent, segments.join('/'), false);
  if (!parentDir) return false;
  try {
    await parentDir.removeEntry(name, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function listEntries(dir: FileSystemDirectoryHandle, prefix = ''): Promise<FileNode[]> {
  const entries: FileNode[] = [];
  for await (const [name, handle] of dir) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      entries.push({ path, isDir: true });
      entries.push(...await listEntries(handle as FileSystemDirectoryHandle, path));
    } else {
      entries.push({ path, isDir: false });
    }
  }
  return entries;
}

export async function copyEntry(source: FileSystemDirectoryHandle | FileSystemFileHandle, targetParent: FileSystemDirectoryHandle, targetName: string): Promise<void> {
  if (source.kind === 'file') {
    const file = await source.getFile();
    const target = await targetParent.getFileHandle(targetName, { create: true });
    await writeFile(target, await file.arrayBuffer());
    return;
  }

  const targetDir = await targetParent.getDirectoryHandle(targetName, { create: true });
  for await (const [name, child] of source) {
    await copyEntry(child as FileSystemDirectoryHandle | FileSystemFileHandle, targetDir, name);
  }
}

/** Deleted entries are moved here rather than removed, so a deletion can be undone. */
export const TRASH_DIRECTORY = '.trash';

/**
 * Moves a file or folder into the project's trash and returns its trash path, or null
 * when nothing was moved. The copy is made before the original is removed.
 */
export async function trashEntry(parent: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  const normalized = normalizeExplorerPath(path);
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.pop();
  if (!name) return null;
  const source = await getFile(parent, normalized, false) ?? await getDirectory(parent, normalized, false);
  if (!source) return null;

  const batch = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const trash = await parent.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
  const batchDir = await trash.getDirectoryHandle(batch, { create: true });
  await copyEntry(source, batchDir, name);
  if (!await deleteEntry(parent, normalized)) {
    await trash.removeEntry(batch, { recursive: true }).catch(() => undefined);
    return null;
  }
  return `${TRASH_DIRECTORY}/${batch}/${name}`;
}

/** Puts a trashed entry back at its original path and empties its trash batch. */
export async function restoreTrashedEntry(parent: FileSystemDirectoryHandle, trashPath: string, targetPath: string): Promise<boolean> {
  const segments = normalizeExplorerPath(trashPath).split('/').filter(Boolean);
  const [trashRoot, batch, name] = segments;
  if (trashRoot !== TRASH_DIRECTORY || !batch || !name) return false;
  const source = await getFile(parent, trashPath, false) ?? await getDirectory(parent, trashPath, false);
  if (!source) return false;

  const targetSegments = normalizeExplorerPath(targetPath).split('/').filter(Boolean);
  const targetName = targetSegments.pop();
  const targetParent = await getDirectory(parent, targetSegments.join('/'), true);
  if (!targetName || !targetParent) return false;
  await copyEntry(source, targetParent, targetName);
  const trash = await parent.getDirectoryHandle(TRASH_DIRECTORY, { create: false }).catch(() => null);
  await trash?.removeEntry(batch, { recursive: true }).catch(() => undefined);
  return true;
}
