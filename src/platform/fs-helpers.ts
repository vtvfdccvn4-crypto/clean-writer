import type { FileNode } from '../types';
import { normalizeExplorerPath } from '../utils/path-utils';

export async function readJson<T>(handle: FileSystemFileHandle): Promise<T> {
  const file = await handle.getFile();
  return JSON.parse(await file.text()) as T;
}

export async function writeJson(handle: FileSystemFileHandle, value: unknown): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
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
  for await (const [name, handle] of dir as any as AsyncIterable<[string, FileSystemHandle]>) {
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
    const writable = await target.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return;
  }

  const targetDir = await targetParent.getDirectoryHandle(targetName, { create: true });
  for await (const [name, child] of source as any as AsyncIterable<[string, FileSystemHandle]>) {
    await copyEntry(child as FileSystemDirectoryHandle | FileSystemFileHandle, targetDir, name);
  }
}
