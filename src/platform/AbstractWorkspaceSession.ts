import type {
  FileNode,
  ProjectHealthReport,
  ProjectSettingsData,
  ProjectSettingsMutation
} from '../types';
import type {
  ProjectPath,
  SectionPlacement,
  SectionWriteOutcome,
  TrashItem,
  TrashRestoreResult,
  WorkspaceCapabilities,
  WorkspaceSession
} from './types';
import { calculateSectionMove } from './section-order';
import { getDirectory, getFile, deleteEntry, listEntries, copyEntry, writeFile } from './fs-helpers';
import { listTrash, purgeAllTrash, purgeTrashEntry, restoreTrashedEntry, trashEntry } from './trash';
import { resolveImagePath, resolveSectionPath, restoreSettingsPaths, snapshotSettingsPaths } from '../project-settings/project-paths';
import { normalizeProjectSettings } from '../project-settings/project-settings';
import { getBaseName, getParentPath } from '../utils/path-utils';
import { applyProjectSettingsMutation } from '../project-settings/settings-mutations';
import { runCoordinatedMutation } from './mutation-coordinator';

/** The folders and file that make up a project, apart from its trash. */
const PROJECT_FILE_ROOTS = ['sections', 'images', 'assets'] as const;
const SETTINGS_FILE = 'settings.json';

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export abstract class AbstractWorkspaceSession implements WorkspaceSession {
  abstract readonly kind: 'memory' | 'opfs' | 'directory';
  abstract readonly capabilities: WorkspaceCapabilities;

  readonly id: string;
  readonly displayName: string;

  protected abstract readonly projectDir: FileSystemDirectoryHandle;

  private writeQueue = new Map<string, Promise<unknown>>();
  /**
   * Section text by resolved path, with the file metadata it was read at.
   * Search, review, export and full-document preview each read every
   * section; this lets them skip unchanged files. A copy is used only while
   * the file's size and last-modified time still match, so edits made outside
   * the app are picked up, and this session's own changes drop entries too.
   */
  private readonly sectionCache = new Map<string, { text: string; size: number; lastModified: number }>();
  /**
   * The file version this session last read or wrote, by resolved path. A save
   * compares it with the file on disk, so a change made outside the app is not
   * overwritten.
   */
  private readonly knownVersions = new Map<string, { size: number; lastModified: number }>();

  constructor(id: string, displayName: string) {
    this.id = id;
    this.displayName = displayName;
  }

  abstract initialize(): Promise<void>;
  protected abstract getSettings(): Promise<ProjectSettingsData>;
  protected abstract writeSettingsSnapshot(settings: ProjectSettingsData): Promise<void>;
  abstract mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>>;
  abstract inspectProject(): Promise<ProjectHealthReport>;
  abstract recoverProjectSettings(): Promise<ProjectHealthReport>;

  protected serializedWrite(path: string, perform: () => Promise<void>): Promise<void> {
    const prev = this.writeQueue.get(path) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(perform);
    this.writeQueue.set(path, next);
    return next.finally(() => {
      if (this.writeQueue.get(path) === next) this.writeQueue.delete(path);
    });
  }

  async readSettings(): Promise<ProjectSettingsData> {
    return clone(await this.getSettings());
  }

  async listSections(): Promise<FileNode[]> {
    const sectionsDir = await this.projectDir.getDirectoryHandle('sections', { create: true });
    return listEntries(sectionsDir, 'sections');
  }

  async listImages(): Promise<FileNode[]> {
    const imagesDir = await this.projectDir.getDirectoryHandle('images', { create: true });
    const assetsDir = await this.projectDir.getDirectoryHandle('assets', { create: true });
    return [...await listEntries(imagesDir, 'images'), ...await listEntries(assetsDir, 'assets')];
  }

  async readSection(path: ProjectPath): Promise<string> {
    const resolvedPath = resolveSectionPath(path);
    const handle = await getFile(this.projectDir, resolvedPath, false);
    if (!handle) {
      this.sectionCache.delete(resolvedPath);
      throw new Error(`File not found: ${resolvedPath}`);
    }
    const file = await handle.getFile();
    this.knownVersions.set(resolvedPath, { size: file.size, lastModified: file.lastModified });
    const cached = this.sectionCache.get(resolvedPath);
    if (cached && cached.size === file.size && cached.lastModified === file.lastModified) return cached.text;
    const text = await file.text();
    this.sectionCache.set(resolvedPath, { text, size: file.size, lastModified: file.lastModified });
    return text;
  }

  /** Saves a section unless its file changed since this session last read or wrote it. */
  async writeSection(path: ProjectPath, content: string): Promise<boolean> {
    return (await this.writeSectionChecked(path, content)) === 'saved';
  }

  async writeSectionChecked(path: ProjectPath, content: string): Promise<SectionWriteOutcome> {
    const normalized = resolveSectionPath(path);
    let outcome: SectionWriteOutcome = 'failed';
    await this.serializedWrite(normalized, async () => {
      const file = await getFile(this.projectDir, normalized, true);
      if (!file) return;
      const onDisk = await file.getFile();
      const known = this.knownVersions.get(normalized);
      if (known && (known.size !== onDisk.size || known.lastModified !== onDisk.lastModified)) {
        outcome = 'conflict';
        return;
      }
      this.sectionCache.delete(normalized);
      await writeFile(file, content);
      const written = await file.getFile();
      this.knownVersions.set(normalized, { size: written.size, lastModified: written.lastModified });
      outcome = 'saved';
    });
    return outcome;
  }

  async createSection(fileName: string, content: string): Promise<{ success: boolean; newPath?: string }> {
    const normalized = resolveSectionPath(fileName);
    if (await getFile(this.projectDir, normalized, false)) return { success: false };
    const success = await this.writeSection(normalized, content);
    return { success, newPath: normalized };
  }

  async createFolder(folderName: string): Promise<{ success: boolean; newPath?: string }> {
    const normalized = resolveSectionPath(folderName);
    const dir = await getDirectory(this.projectDir, normalized, false);
    if (dir) return { success: false };
    const parts = normalized.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) return { success: false };
    const parent = await getDirectory(this.projectDir, parts.join('/'), true);
    if (!parent) return { success: false };
    await parent.getDirectoryHandle(name, { create: true });
    return { success: true, newPath: normalized };
  }

  async renameSection(oldName: string, newName: string): Promise<boolean> {
    // Renames and deletes can move whole folders; validation would catch them,
    // but dropping everything keeps the rule simple for these rare operations.
    this.sectionCache.clear();
    const oldPath = resolveSectionPath(oldName);
    const newPath = resolveSectionPath(newName);
    if (!oldPath || !newPath) return false;
    if (oldPath === newPath) return true;
    if (await getFile(this.projectDir, newPath, false) || await getDirectory(this.projectDir, newPath, false)) return false;

    const sourceFile = await getFile(this.projectDir, oldPath, false);
    const sourceDir = sourceFile ? null : await getDirectory(this.projectDir, oldPath, false);
    if (!sourceFile && !sourceDir) return false;

    const newParentPath = newPath.split('/').slice(0, -1).join('/');
    const newParent = await getDirectory(this.projectDir, newParentPath, true);
    if (!newParent) return false;
    const newNamePart = newPath.split('/').pop()!;

    const sourceParent = await getDirectory(this.projectDir, oldPath.split('/').slice(0, -1).join('/'), true);
    if (!sourceParent) return false;
    let sourceDeleted = false;
    return runCoordinatedMutation({
      readSettings: () => this.getSettings(),
      writeSettings: settings => this.writeSettingsSnapshot(settings),
      applyFilesystem: async () => {
        await copyEntry(sourceFile ?? sourceDir!, newParent, newNamePart);
        if (!await deleteEntry(this.projectDir, oldPath)) throw new Error('Unable to remove the original entry.');
        sourceDeleted = true;
      },
      rollbackFilesystem: async () => {
        if (sourceDeleted) {
          const copiedFile = await getFile(this.projectDir, newPath, false);
          const copiedDir = copiedFile ? null : await getDirectory(this.projectDir, newPath, false);
          if (copiedFile || copiedDir) await copyEntry(copiedFile ?? copiedDir!, sourceParent, oldPath.split('/').pop()!);
        }
        await deleteEntry(this.projectDir, newPath);
      },
      updateSettings: settings => applyProjectSettingsMutation(settings, { type: 'replace-path', oldPath, newPath })
    });
  }

  async moveSection(
    sourceName: string,
    targetName: string | null,
    placement: SectionPlacement
  ): Promise<{ success: boolean; newPath?: string }> {
    this.sectionCache.clear();
    const entries = await this.listSections();
    const settings = await this.getSettings();
    const move = calculateSectionMove(entries, settings.order, sourceName, targetName, placement);
    if (!move) return { success: false };
    if (move.source === move.destination) return { success: false };
    const sourcePath = resolveSectionPath(move.source);
    const destinationPath = resolveSectionPath(move.destination);
    const sourceFile = await getFile(this.projectDir, sourcePath, false);
    const sourceDir = sourceFile ? null : await getDirectory(this.projectDir, sourcePath, false);
    const destinationParent = await getDirectory(this.projectDir, destinationPath.split('/').slice(0, -1).join('/'), true);
    if ((!sourceFile && !sourceDir) || !destinationParent) return { success: false };
    const sourceParent = await getDirectory(this.projectDir, sourcePath.split('/').slice(0, -1).join('/'), true);
    if (!sourceParent) return { success: false };
    let sourceDeleted = false;
    const committed = await runCoordinatedMutation({
      readSettings: () => this.getSettings(),
      writeSettings: settings => this.writeSettingsSnapshot(settings),
      applyFilesystem: async () => {
        await copyEntry(sourceFile ?? sourceDir!, destinationParent, destinationPath.split('/').pop()!);
        const copiedFile = await getFile(this.projectDir, destinationPath, false);
        const copiedDir = copiedFile ? null : await getDirectory(this.projectDir, destinationPath, false);
        if (!copiedFile && !copiedDir) throw new Error('The moved section was not written to its destination.');
        if (!await deleteEntry(this.projectDir, sourcePath)) throw new Error('Unable to remove the original entry.');
        sourceDeleted = true;
      },
      rollbackFilesystem: async () => {
        if (sourceDeleted) {
          const copiedFile = await getFile(this.projectDir, destinationPath, false);
          const copiedDir = copiedFile ? null : await getDirectory(this.projectDir, destinationPath, false);
          if (copiedFile || copiedDir) await copyEntry(copiedFile ?? copiedDir!, sourceParent, sourcePath.split('/').pop()!);
        }
        await deleteEntry(this.projectDir, destinationPath);
      },
      updateSettings: value => {
        value.order = move.order;
        applyProjectSettingsMutation(value, { type: 'replace-path', oldPath: move.source, newPath: move.destination });
      }
    });
    return committed ? { success: true, newPath: move.destination } : { success: false };
  }

  async deleteSection(fileName: string): Promise<boolean> {
    // Renames and deletes can move whole folders; validation would catch them,
    // but dropping everything keeps the rule simple for these rare operations.
    this.sectionCache.clear();
    const normalized = resolveSectionPath(fileName);
    const entryFile = await getFile(this.projectDir, normalized, false);
    const entryDir = entryFile ? null : await getDirectory(this.projectDir, normalized, false);
    if (!entryFile && !entryDir) return false;
    // The entry moves to the trash rather than being removed, so the deletion can be
    // rolled back here and undone later from the trash. The trash keeps the entry's
    // place in the project order and its flags, so a restore can put them back.
    const settingsSnapshot = snapshotSettingsPaths(await this.getSettings(), normalized);
    let trashPath: string | null = null;
    const result = await runCoordinatedMutation({
      readSettings: () => this.getSettings(),
      writeSettings: settings => this.writeSettingsSnapshot(settings),
      applyFilesystem: async () => {
        trashPath = await trashEntry(this.projectDir, normalized, settingsSnapshot);
        if (!trashPath) throw new Error('Unable to move the entry to the trash.');
      },
      rollbackFilesystem: async () => {
        if (trashPath) await restoreTrashedEntry(this.projectDir, trashPath, normalized);
      },
      updateSettings: settings => applyProjectSettingsMutation(settings, { type: 'remove-path', path: normalized })
    });
    if (result) this.forgetVersions(normalized);
    return result;
  }

  async listProjectFiles(): Promise<string[]> {
    const files = [SETTINGS_FILE];
    for (const root of PROJECT_FILE_ROOTS) {
      const directory = await this.projectDir.getDirectoryHandle(root, { create: true });
      for (const entry of await listEntries(directory, root)) {
        if (!entry.isDir) files.push(entry.path);
      }
    }
    return files.sort();
  }

  async readProjectFile(path: string): Promise<Uint8Array> {
    if (path === SETTINGS_FILE) return new TextEncoder().encode(JSON.stringify(await this.getSettings(), null, 2));
    const handle = this.isProjectFilePath(path) ? await getFile(this.projectDir, path, false) : null;
    if (!handle) throw new Error(`File not found: ${path}`);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }

  async writeProjectFile(path: string, data: Uint8Array): Promise<void> {
    if (path === SETTINGS_FILE) {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
      await this.writeSettingsSnapshot(normalizeProjectSettings(parsed as ProjectSettingsData).settings);
      return;
    }
    if (!this.isProjectFilePath(path)) throw new Error(`Not a project file path: ${path}`);
    this.sectionCache.delete(path);
    this.knownVersions.delete(path);
    await this.serializedWrite(path, async () => {
      const handle = await getFile(this.projectDir, path, true);
      if (!handle) throw new Error(`Could not create ${path}.`);
      await writeFile(handle, data as Uint8Array<ArrayBuffer>);
    });
  }

  /** A path inside sections, images or assets, with no segment that could leave them. */
  private isProjectFilePath(path: string): boolean {
    const segments = path.split('/');
    return segments.length >= 2
      && (PROJECT_FILE_ROOTS as readonly string[]).includes(segments[0]!)
      && segments.every(segment => segment !== '' && segment !== '.' && segment !== '..' && !segment.includes('\0'));
  }

  async listTrash(): Promise<TrashItem[]> {
    const entries = await listTrash(this.projectDir);
    return entries.map(({ id, name, originalPath, kind, deletedAt }) => ({ id, name, originalPath, kind, deletedAt }));
  }

  async restoreFromTrash(id: string): Promise<TrashRestoreResult> {
    this.sectionCache.clear();
    const entry = (await listTrash(this.projectDir)).find(candidate => candidate.id === id);
    if (!entry) return { success: false, reason: 'That item is no longer in the trash.' };
    const source = await getFile(this.projectDir, entry.storedPath, false) ?? await getDirectory(this.projectDir, entry.storedPath, false);
    if (!source) return { success: false, reason: 'The trashed item could not be read.' };

    const targetPath = await this.freeRestorePath(entry.originalPath);
    let copied = false;
    const restored = await runCoordinatedMutation({
      readSettings: () => this.getSettings(),
      writeSettings: settings => this.writeSettingsSnapshot(settings),
      applyFilesystem: async () => {
        const parent = await getDirectory(this.projectDir, getParentPath(targetPath) ?? '', true);
        if (!parent) throw new Error('The folder to restore into could not be created.');
        await copyEntry(source, parent, getBaseName(targetPath));
        copied = true;
      },
      rollbackFilesystem: async () => {
        if (copied) await deleteEntry(this.projectDir, targetPath);
      },
      updateSettings: settings => restoreSettingsPaths(settings, entry.settings, entry.originalPath, targetPath)
    });
    if (!restored) return { success: false, reason: 'The item could not be restored. It is still in the trash.' };
    await purgeTrashEntry(this.projectDir, id);
    return { success: true, restoredPath: targetPath };
  }

  async purgeTrash(id?: string): Promise<boolean> {
    if (id === undefined) {
      await purgeAllTrash(this.projectDir);
      return true;
    }
    return purgeTrashEntry(this.projectDir, id);
  }

  /** The original path if it is free; otherwise the name with "(restored)" added, so nothing is overwritten. */
  private async freeRestorePath(originalPath: string): Promise<string> {
    const taken = async (path: string) => Boolean(await getFile(this.projectDir, path, false) || await getDirectory(this.projectDir, path, false));
    if (!await taken(originalPath)) return originalPath;
    const parent = getParentPath(originalPath);
    const name = getBaseName(originalPath);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    for (let attempt = 1; ; attempt += 1) {
      const suffix = attempt === 1 ? ' (restored)' : ` (restored ${attempt})`;
      const candidate = `${parent ? `${parent}/` : ''}${stem}${suffix}${extension}`;
      if (!await taken(candidate)) return candidate;
    }
  }

  /** Drops the recorded versions of a path and everything under it. */
  private forgetVersions(path: string): void {
    for (const key of [...this.knownVersions.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.knownVersions.delete(key);
    }
  }

  async writeImage(path: string, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
    const resolvedPath = resolveImagePath(path);
    try {
      const fileHandle = await getFile(this.projectDir, resolvedPath, true);
      if (!fileHandle) return false;
      await writeFile(fileHandle, data);
      return true;
    } catch {
      return false;
    }
  }

  async readBlob(path: string): Promise<Blob> {
    const resolvedPath = resolveImagePath(path);
    const file = await getFile(this.projectDir, resolvedPath, false);
    if (!file) throw new Error(`File not found: ${resolvedPath}`);
    return file.getFile();
  }
}
