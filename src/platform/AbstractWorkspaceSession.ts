import type {
  FileNode,
  ProjectHealthReport,
  ProjectSettingsData,
  ProjectSettingsMutation
} from '../types';
import type {
  ProjectPath,
  SectionPlacement,
  WorkspaceCapabilities,
  WorkspaceSession
} from './types';
import { calculateSectionMove } from './section-order';
import { getDirectory, getFile, deleteEntry, listEntries, copyEntry } from './fs-helpers';
import { resolveImagePath, resolveSectionPath } from './project-paths';
import { applyProjectSettingsMutation } from '../services/settings-mutations';
import { runCoordinatedMutation } from './mutation-coordinator';

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
    const file = await getFile(this.projectDir, resolvedPath, false);
    if (!file) throw new Error(`File not found: ${resolvedPath}`);
    return (await file.getFile()).text();
  }

  async writeSection(path: ProjectPath, content: string): Promise<boolean> {
    const normalized = resolveSectionPath(path);
    let success = false;
    await this.serializedWrite(normalized, async () => {
      const file = await getFile(this.projectDir, normalized, true);
      if (!file) return;
      const writable = await file.createWritable();
      await writable.write(content);
      await writable.close();
      success = true;
    });
    return success;
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
    const normalized = resolveSectionPath(fileName);
    const entryFile = await getFile(this.projectDir, normalized, false);
    const entryDir = entryFile ? null : await getDirectory(this.projectDir, normalized, false);
    if (!entryFile && !entryDir) return false;
    let deleted = false;
    return runCoordinatedMutation({
      readSettings: () => this.getSettings(),
      writeSettings: settings => this.writeSettingsSnapshot(settings),
      applyFilesystem: async () => {
        if (!await deleteEntry(this.projectDir, normalized)) throw new Error('Unable to delete the entry.');
        deleted = true;
      },
      rollbackFilesystem: async () => {
        if (!deleted) return;
        const parent = await getDirectory(this.projectDir, normalized.split('/').slice(0, -1).join('/'), true);
        if (parent) await copyEntry(entryFile ?? entryDir!, parent, normalized.split('/').pop()!);
      },
      updateSettings: settings => applyProjectSettingsMutation(settings, { type: 'remove-path', path: normalized })
    });
  }

  async writeImage(path: string, data: Uint8Array): Promise<boolean> {
    const resolvedPath = resolveImagePath(path);
    try {
      const fileHandle = await getFile(this.projectDir, resolvedPath, true);
      if (!fileHandle) return false;
      const writable = await fileHandle.createWritable();
      await writable.write(data as any);
      await writable.close();
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
