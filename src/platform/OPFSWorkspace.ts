import type { FileNode, ProjectHealthReport, ProjectSettingsData, WorkspaceRef } from '../types';
import type {
  AppLifecycle,
  ProjectPath,
  SectionPlacement,
  WorkspaceCapabilities,
  WorkspaceRepository,
  WorkspaceSession
} from './types';
import { createDefaultProjectSettings, normalizeProjectSettings } from '../services/project-settings';
import { calculateSectionMove } from './section-order';
import { OPFSCatalogue } from './OPFSCatalogue';
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

export class OPFSWorkspaceSession implements WorkspaceSession {
  readonly kind = 'opfs';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: false,
    canSaveFile: false,
    supportsAtomicWrite: true,
    canPersistHandle: false
  };

  private readonly projectDir: FileSystemDirectoryHandle;
  private readonly settingsHandle: FileSystemFileHandle;
  readonly id: string;
  readonly displayName: string;

  constructor(
    id: string,
    displayName: string,
    projectDir: FileSystemDirectoryHandle,
    settingsHandle: FileSystemFileHandle
  ) {
    this.id = id;
    this.displayName = displayName;
    this.projectDir = projectDir;
    this.settingsHandle = settingsHandle;
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.projectDir, 'sections');
    await ensureDirectory(this.projectDir, 'images');
    await ensureDirectory(this.projectDir, 'assets');
  }

  private async getSettings(): Promise<ProjectSettingsData> {
    return normalizeSettings(await readJson<ProjectSettingsData>(this.settingsHandle));
  }

  async readSettings(): Promise<ProjectSettingsData> {
    return clone(await this.getSettings());
  }

  async mutateSettings(mutation: import('../types').ProjectSettingsMutation): Promise<Record<string, unknown>> {
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
    await writeJson(this.settingsHandle, settings);
    return {};
  }

  async inspectProject(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  async recoverProjectSettings(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
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
    const file = await getFile(this.projectDir, normalized, true);
    if (!file) return false;
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
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
    settings.order = move.order;
    await writeJson(this.settingsHandle, settings);
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

export class OPFSWorkspaceRepository implements WorkspaceRepository {
  private readonly catalogue: OPFSCatalogue;
  private activeSessions = new Map<string, OPFSWorkspaceSession>();

  constructor(catalogue: OPFSCatalogue) {
    this.catalogue = catalogue;
  }

  async open(ref: WorkspaceRef): Promise<WorkspaceSession> {
    const existing = this.activeSessions.get(ref.id);
    if (existing) return existing;

    await this.catalogue.open();
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    const projectDir = await projectsDir.getDirectoryHandle(ref.id, { create: true });
    const settingsHandle = await projectDir.getFileHandle('settings.json', { create: true });
    if ((await settingsHandle.getFile()).size === 0) {
      await writeJson(settingsHandle, createDefaultSettings());
    }
    const session = new OPFSWorkspaceSession(ref.id, ref.displayName, projectDir, settingsHandle);
    await session.initialize();
    this.activeSessions.set(ref.id, session);
    await this.catalogue.touch(ref.id);
    return session;
  }

  async selectDirectory(options?: { kind?: 'opfs' | 'directory', name?: string }): Promise<WorkspaceRef | null> {
    const displayName = options?.name?.trim() || 'Untitled Project';
    if (!displayName) return null;

    await this.catalogue.open();
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `opfs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const ref: WorkspaceRef = { id, kind: 'opfs', displayName };
    await this.catalogue.register(ref);
    return ref;
  }

  async pickWorkspace(): Promise<WorkspaceRef | null> {
    await this.catalogue.open();
    const entries = await this.catalogue.list();
    if (!entries.length) {
      return null;
    }
    const picked = [...entries].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];

    return {
      id: picked.id,
      kind: 'opfs',
      displayName: picked.displayName
    };
  }

  async getLastOpenedWorkspace(): Promise<WorkspaceRef | null> {
    await this.catalogue.open();
    const id = await this.catalogue.getLastOpenedId();
    if (!id) return null;
    const entry = await this.catalogue.get(id);
    if (!entry) return null;
    return {
      id: entry.id,
      kind: 'opfs',
      displayName: entry.displayName
    };
  }
}

export class OPFSAppLifecycle implements AppLifecycle {
  onBeforeClose(_callback: () => void): void {}
  confirmClose(_ok: boolean, _error?: string): void {}
}
