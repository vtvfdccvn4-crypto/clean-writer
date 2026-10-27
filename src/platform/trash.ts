import { normalizeExplorerPath } from '../utils/path-utils';
import { EMPTY_PATH_SETTINGS, type PathSettingsSnapshot } from '../project-settings/project-paths';
import { copyEntry, deleteEntry, getDirectory, getFile, readJson, writeJson } from './fs-helpers';

/**
 * The project's trash. A deleted file or folder is moved into `.trash/<id>/data/`, and `.trash/<id>/meta.json`
 * records where it came from, when, and which project settings it had, so it can be restored in place. An
 * entry from before the metadata existed is a lone item in `.trash/<id>/`; its original place is taken to be
 * the `sections` folder.
 */
export const TRASH_DIRECTORY = '.trash';
const DATA_DIRECTORY = 'data';
const METADATA_FILE = 'meta.json';

export interface TrashRecord {
  readonly id: string;
  readonly name: string;
  readonly originalPath: string;
  readonly kind: 'file' | 'folder';
  readonly deletedAt: number;
  readonly settings: PathSettingsSnapshot;
}

/** A record with the path of the trashed data inside the project. */
export interface TrashEntry extends TrashRecord {
  readonly storedPath: string;
}

/** Ids are `<milliseconds>-<hex>`; anything else cannot name a batch, so a path cannot be smuggled in. */
const isTrashId = (id: string): boolean => /^[0-9]+-[0-9a-f]+$/.test(id);

/**
 * Moves a file or folder into the project's trash and returns its trash path, or null when nothing was moved.
 * The copy and its metadata are written before the original is removed.
 */
export async function trashEntry(
  parent: FileSystemDirectoryHandle,
  path: string,
  settings: PathSettingsSnapshot = EMPTY_PATH_SETTINGS
): Promise<string | null> {
  const normalized = normalizeExplorerPath(path);
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.pop();
  if (!name) return null;
  const source = await getFile(parent, normalized, false) ?? await getDirectory(parent, normalized, false);
  if (!source) return null;

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const trash = await parent.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
  const batchDir = await trash.getDirectoryHandle(id, { create: true });
  try {
    const dataDir = await batchDir.getDirectoryHandle(DATA_DIRECTORY, { create: true });
    await copyEntry(source, dataDir, name);
    const record: TrashRecord = {
      id,
      name,
      originalPath: normalized,
      kind: source.kind === 'directory' ? 'folder' : 'file',
      deletedAt: Date.now(),
      settings
    };
    await writeJson(await batchDir.getFileHandle(METADATA_FILE, { create: true }), record);
    if (!await deleteEntry(parent, normalized)) throw new Error('The original could not be removed.');
  } catch {
    await trash.removeEntry(id, { recursive: true }).catch(() => undefined);
    return null;
  }
  return `${TRASH_DIRECTORY}/${id}/${DATA_DIRECTORY}/${name}`;
}

async function readRecord(batchDir: FileSystemDirectoryHandle, id: string): Promise<TrashEntry | null> {
  const metadata = await batchDir.getFileHandle(METADATA_FILE).then(handle => readJson<Partial<TrashRecord>>(handle)).catch(() => null);
  if (metadata && typeof metadata.name === 'string' && typeof metadata.originalPath === 'string') {
    return {
      id,
      name: metadata.name,
      originalPath: metadata.originalPath,
      kind: metadata.kind === 'folder' ? 'folder' : 'file',
      deletedAt: typeof metadata.deletedAt === 'number' ? metadata.deletedAt : 0,
      settings: metadata.settings ?? EMPTY_PATH_SETTINGS,
      storedPath: `${TRASH_DIRECTORY}/${id}/${DATA_DIRECTORY}/${metadata.name}`
    };
  }
  // An entry from before the metadata: the lone item in the batch.
  for await (const [name, handle] of batchDir) {
    if (name === METADATA_FILE || name === DATA_DIRECTORY) continue;
    return {
      id,
      name,
      originalPath: `sections/${name}`,
      kind: handle.kind === 'directory' ? 'folder' : 'file',
      deletedAt: Number(id.split('-')[0]) || 0,
      settings: EMPTY_PATH_SETTINGS,
      storedPath: `${TRASH_DIRECTORY}/${id}/${name}`
    };
  }
  return null;
}

/** Everything in the trash, newest first. */
export async function listTrash(parent: FileSystemDirectoryHandle): Promise<TrashEntry[]> {
  const trash = await parent.getDirectoryHandle(TRASH_DIRECTORY, { create: false }).catch(() => null);
  if (!trash) return [];
  const entries: TrashEntry[] = [];
  for await (const [id, handle] of trash) {
    if (handle.kind !== 'directory' || !isTrashId(id)) continue;
    const entry = await readRecord(handle as FileSystemDirectoryHandle, id);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Puts a trashed entry back at a path and removes its batch from the trash. */
export async function restoreTrashedEntry(parent: FileSystemDirectoryHandle, trashPath: string, targetPath: string): Promise<boolean> {
  const segments = normalizeExplorerPath(trashPath).split('/').filter(Boolean);
  const [trashRoot, id] = segments;
  if (trashRoot !== TRASH_DIRECTORY || !id || segments.length < 3) return false;
  const source = await getFile(parent, trashPath, false) ?? await getDirectory(parent, trashPath, false);
  if (!source) return false;

  const targetSegments = normalizeExplorerPath(targetPath).split('/').filter(Boolean);
  const targetName = targetSegments.pop();
  const targetParent = await getDirectory(parent, targetSegments.join('/'), true);
  if (!targetName || !targetParent) return false;
  await copyEntry(source, targetParent, targetName);
  await purgeTrashEntry(parent, id);
  return true;
}

/** Removes one batch from the trash for good. Returns whether it was there. */
export async function purgeTrashEntry(parent: FileSystemDirectoryHandle, id: string): Promise<boolean> {
  if (!isTrashId(id)) return false;
  const trash = await parent.getDirectoryHandle(TRASH_DIRECTORY, { create: false }).catch(() => null);
  if (!trash) return false;
  try {
    await trash.removeEntry(id, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Empties the trash. Returns how many items it held. */
export async function purgeAllTrash(parent: FileSystemDirectoryHandle): Promise<number> {
  const entries = await listTrash(parent);
  let removed = 0;
  for (const entry of entries) {
    if (await purgeTrashEntry(parent, entry.id)) removed += 1;
  }
  return removed;
}
