import type { FileNode, ProjectHealthReport, ProjectHealthIssue, ProjectSettingsData, WorkspaceRef } from '../types';
import type {
  ProjectPath,
  SectionPlacement,
  WorkspaceCapabilities,
  WorkspaceRepository,
  WorkspaceSession
} from './types';
import { createDefaultProjectSettings, normalizeProjectSettings } from '../services/project-settings';
import { calculateSectionMove } from './section-order';
import { DirectoryHandleCatalogue } from './DirectoryHandleCatalogue';
import { normalizeExplorerPath } from '../utils/path-utils';
import { readJson, writeJson, ensureDirectory, getDirectory, getFile, deleteEntry, listEntries, copyEntry } from './fs-helpers';
import { removeSettingsPath, replaceSettingsPath, resolveImagePath, resolveSectionPath } from './project-paths';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultSettings(): ProjectSettingsData {
  return createDefaultProjectSettings();
}

function normalizeSettings(raw: unknown): ProjectSettingsData {
  return normalizeProjectSettings(raw).settings;
}

export class LocalDirectoryWorkspaceSession implements WorkspaceSession {
  readonly kind = 'directory';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: true,
    canSaveFile: true,
    supportsAtomicWrite: true,
    canPersistHandle: true
  };

  readonly id: string;
  readonly displayName: string;
  private readonly projectDir: FileSystemDirectoryHandle;
  private settingsHandle: FileSystemFileHandle | null = null;
  private writeQueue = new Map<string, Promise<unknown>>();

  constructor(
    id: string,
    displayName: string,
    projectDir: FileSystemDirectoryHandle
  ) {
    this.id = id;
    this.displayName = displayName;
    this.projectDir = projectDir;
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.projectDir, 'sections');
    await ensureDirectory(this.projectDir, 'images');
    await ensureDirectory(this.projectDir, 'assets');
    this.settingsHandle = await this.projectDir.getFileHandle('settings.json', { create: true });
    
    // In local directory, the file might have been empty if just created
    if ((await this.settingsHandle.getFile()).size === 0) {
      await writeJson(this.settingsHandle, createDefaultSettings());
    }
  }

  private serializedWrite(path: string, perform: () => Promise<void>): Promise<void> {
    const prev = this.writeQueue.get(path) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(perform);
    this.writeQueue.set(path, next);
    return next.finally(() => {
      if (this.writeQueue.get(path) === next) this.writeQueue.delete(path);
    });
  }

  private async getSettings(): Promise<ProjectSettingsData> {
    if (!this.settingsHandle) return createDefaultSettings();
    return normalizeSettings(await readJson<ProjectSettingsData>(this.settingsHandle));
  }

  async readSettings(): Promise<ProjectSettingsData> {
    return clone(await this.getSettings());
  }

  async mutateSettings(mutation: import('../types').ProjectSettingsMutation): Promise<Record<string, unknown>> {
    let result = {};
    await this.serializedWrite('settings.json', async () => {
      if (!this.settingsHandle) {
        this.settingsHandle = await getFile(this.projectDir, 'settings.json', true);
      }
      if (!this.settingsHandle) throw new Error('Could not create settings.json handle');
      const settings = await this.getSettings();
      if (mutation.type === 'patch') {
        Object.assign(settings, mutation.values);
      } else if (mutation.type === 'append-order') {
        const normalized = normalizeExplorerPath(mutation.path);
        if (!settings.order.includes(normalized)) settings.order.push(normalized);
      } else if (mutation.type === 'set-path-flag') {
        const normalized = normalizeExplorerPath(mutation.path);
        const list = (settings as unknown as Record<string, unknown>)[mutation.key] as string[] | undefined;
        if (list) {
          const enabled = mutation.enabled ?? !list.includes(normalized);
          if (enabled && !list.includes(normalized)) list.push(normalized);
          if (!enabled) {
            const index = list.indexOf(normalized);
            if (index !== -1) list.splice(index, 1);
          }
        }
      } else if (mutation.type === 'replace-path') {
        replaceSettingsPath(settings, normalizeExplorerPath(mutation.oldPath), normalizeExplorerPath(mutation.newPath));
      } else if (mutation.type === 'remove-path') {
        removeSettingsPath(settings, normalizeExplorerPath(mutation.path));
      }
      try {
        await writeJson(this.settingsHandle, settings);
      } catch (err) {
        console.error('Failed to write settings.json', err);
        throw err;
      }
    });
    return result;
  }

  async inspectProject(): Promise<ProjectHealthReport> {
    const issues: ProjectHealthIssue[] = [];
    
    const sectionsDir = await getDirectory(this.projectDir, 'sections', false);
    if (!sectionsDir) {
      issues.push({ code: 'sections-missing', severity: 'error', message: 'The project requires a sections directory.', recoverable: false });
    }

    const settingsHandle = await getFile(this.projectDir, 'settings.json', false);
    if (!settingsHandle) {
      issues.push({ code: 'settings-missing', severity: 'error', message: 'settings.json is missing.', recoverable: true });
    } else {
      try {
        const file = await settingsHandle.getFile();
        const text = await file.text();
        const settings = JSON.parse(text);
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
          issues.push({ code: 'settings-invalid', severity: 'error', message: 'settings.json must contain a JSON object.', recoverable: true });
        }
      } catch {
        issues.push({ code: 'settings-invalid', severity: 'error', message: 'settings.json contains malformed JSON.', recoverable: true });
      }
    }

    const errors = issues.filter(issue => issue.severity === 'error');
    return {
      valid: errors.length === 0,
      recoverable: errors.length > 0 && errors.every(issue => issue.recoverable),
      issues
    };
  }

  async recoverProjectSettings(): Promise<ProjectHealthReport> {
    const report = await this.inspectProject();
    if (report.valid || !report.recoverable) return report;

    let backupPath: string | undefined;
    const needsSettingsRecovery = report.issues.some(i => i.code === 'settings-missing' || i.code === 'settings-invalid');
    
    if (needsSettingsRecovery) {
      const settingsHandle = await getFile(this.projectDir, 'settings.json', false);
      if (settingsHandle) {
        try {
          const file = await settingsHandle.getFile();
          const content = await file.text();
          backupPath = `settings-${Date.now()}.bak`;
          const backupHandle = await getFile(this.projectDir, backupPath, true);
          if (backupHandle) {
            const writable = await backupHandle.createWritable();
            await writable.write(content);
            await writable.close();
          }
        } catch (err) {
          console.warn('Failed to backup settings.json', err);
        }
      }
      
      const newSettingsHandle = await getFile(this.projectDir, 'settings.json', true);
      if (newSettingsHandle) {
        this.settingsHandle = newSettingsHandle;
        await writeJson(newSettingsHandle, createDefaultSettings());
      }
    }

    const newReport = await this.inspectProject();
    newReport.backupPath = backupPath;
    return newReport;
  }

  async listSections(): Promise<FileNode[]> {
    const sectionsDir = await this.projectDir.getDirectoryHandle('sections', { create: true });
    const entries = await listEntries(sectionsDir, 'sections');
    return entries;
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

    await copyEntry(sourceFile ?? sourceDir!, newParent, newNamePart);
    try {
      await this.mutateSettings({ type: 'replace-path', oldPath, newPath });
    } catch (error) {
      await deleteEntry(this.projectDir, newPath);
      throw error;
    }

    if (await deleteEntry(this.projectDir, oldPath)) return true;

    // The source remains intact when deletion fails. Restore its metadata and
    // remove the copied destination so the project returns to its old state.
    await this.mutateSettings({ type: 'replace-path', oldPath: newPath, newPath: oldPath });
    await deleteEntry(this.projectDir, newPath);
    return false;
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
    if (!await this.renameSection(move.source, move.destination)) return { success: false };
    
    await this.serializedWrite('settings.json', async () => {
      const updatedSettings = await this.getSettings();
      updatedSettings.order = move.order;
      if (this.settingsHandle) {
        await writeJson(this.settingsHandle, updatedSettings);
      }
    });

    return { success: true, newPath: move.destination };
  }

  async deleteSection(fileName: string): Promise<boolean> {
    const normalized = resolveSectionPath(fileName);
    const deleted = await deleteEntry(this.projectDir, normalized);
    if (!deleted) return false;
    await this.mutateSettings({ type: 'remove-path', path: normalized });
    return true;
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

export class LocalDirectoryWorkspaceRepository implements WorkspaceRepository {
  private readonly catalogue: DirectoryHandleCatalogue;
  private activeSessions = new Map<string, LocalDirectoryWorkspaceSession>();

  constructor(catalogue: DirectoryHandleCatalogue) {
    this.catalogue = catalogue;
  }

  async selectDirectory(): Promise<WorkspaceRef | null> {
    if (!('showDirectoryPicker' in window)) return null;

    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
      throw err;
    }
    return this.openHandle(handle);
  }

  async open(ref: WorkspaceRef): Promise<WorkspaceSession> {
    if (this.activeSessions.has(ref.id)) {
      return this.activeSessions.get(ref.id)!;
    }
    await this.catalogue.open();
    const handle = await this.catalogue.getHandle(ref.id);
    if (!handle) throw new Error(`No stored handle for workspace ${ref.id}`);
    
    const permission = await (handle as any).requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('Read-write permission was not granted.');
    
    await this.openHandle(handle, ref.id);
    return this.activeSessions.get(ref.id)!;
  }

  async pickWorkspace(): Promise<WorkspaceRef | null> {
    return this.catalogue.pickFromList();
  }

  async getLastOpenedWorkspace(): Promise<WorkspaceRef | null> {
    return this.catalogue.getLastOpened();
  }

  private async openHandle(
    handle: FileSystemDirectoryHandle,
    existingId?: string
  ): Promise<WorkspaceRef> {
    const id = existingId ?? crypto.randomUUID();
    const displayName = handle.name;
    const ref: WorkspaceRef = { id, kind: 'directory', displayName };

    await this.catalogue.open();
    await this.catalogue.store(id, handle, displayName);

    const session = new LocalDirectoryWorkspaceSession(id, displayName, handle);
    await session.initialize();
    this.activeSessions.set(id, session);

    return ref;
  }
}
