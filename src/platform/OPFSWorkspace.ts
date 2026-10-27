import type { ProjectHealthReport, ProjectSettingsData, ProjectSettingsMutation, WorkspaceRef } from '../types';
import type {
  AppLifecycle,
  WorkspaceCapabilities,
  WorkspaceRepository,
  WorkspaceSession
} from './types';
import { createDefaultProjectSettings, normalizeProjectSettings } from '../project-settings/project-settings';
import { OPFSCatalogue } from './OPFSCatalogue';
import { readJson, writeJson, ensureDirectory } from './fs-helpers';
import { applyProjectSettingsMutation } from '../project-settings/settings-mutations';
import { AbstractWorkspaceSession } from './AbstractWorkspaceSession';

export class OPFSWorkspaceSession extends AbstractWorkspaceSession {
  readonly kind = 'opfs';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: false,
    canSaveFile: false,
    supportsAtomicWrite: true,
    canPersistHandle: false
  };

  protected readonly projectDir: FileSystemDirectoryHandle;
  private readonly settingsHandle: FileSystemFileHandle;

  constructor(
    id: string,
    displayName: string,
    projectDir: FileSystemDirectoryHandle,
    settingsHandle: FileSystemFileHandle
  ) {
    super(id, displayName);
    this.projectDir = projectDir;
    this.settingsHandle = settingsHandle;
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.projectDir, 'sections');
    await ensureDirectory(this.projectDir, 'images');
    await ensureDirectory(this.projectDir, 'assets');
  }

  protected async getSettings(): Promise<ProjectSettingsData> {
    return normalizeProjectSettings(await readJson<ProjectSettingsData>(this.settingsHandle)).settings;
  }

  protected async writeSettingsSnapshot(settings: ProjectSettingsData): Promise<void> {
    await this.serializedWrite('settings.json', () => writeJson(this.settingsHandle, settings));
  }

  async mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>> {
    await this.serializedWrite('settings.json', async () => {
      const settings = await this.getSettings();
      applyProjectSettingsMutation(settings, mutation);
      await writeJson(this.settingsHandle, settings);
    });
    return {};
  }

  async inspectProject(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  async recoverProjectSettings(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
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
      await writeJson(settingsHandle, createDefaultProjectSettings());
    }
    const session = new OPFSWorkspaceSession(ref.id, ref.displayName, projectDir, settingsHandle);
    await session.initialize();
    this.activeSessions.set(ref.id, session);
    await this.catalogue.touch(ref.id);
    return session;
  }

  async discardWorkspace(ref: WorkspaceRef): Promise<void> {
    this.activeSessions.delete(ref.id);
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    await projectsDir.removeEntry(ref.id, { recursive: true }).catch(() => undefined);
    await this.catalogue.open();
    await this.catalogue.remove(ref.id);
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
