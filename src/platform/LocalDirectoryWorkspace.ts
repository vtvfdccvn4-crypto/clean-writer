import type { ProjectHealthReport, ProjectHealthIssue, ProjectSettingsData, ProjectSettingsMutation, WorkspaceRef } from '../types';
import type {
  WorkspaceCapabilities,
  WorkspaceRepository,
  WorkspaceSession
} from './types';
import { createDefaultProjectSettings, normalizeProjectSettings } from '../project-settings/project-settings';
import { DirectoryHandleCatalogue } from './DirectoryHandleCatalogue';
import { readJson, writeFile, writeJson, ensureDirectory, getDirectory, getFile } from './fs-helpers';
import { applyProjectSettingsMutation } from '../project-settings/settings-mutations';
import { AbstractWorkspaceSession } from './AbstractWorkspaceSession';

export class LocalDirectoryWorkspaceSession extends AbstractWorkspaceSession {
  readonly kind = 'directory';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: true,
    canSaveFile: true,
    supportsAtomicWrite: true,
    canPersistHandle: true
  };

  protected readonly projectDir: FileSystemDirectoryHandle;
  private settingsHandle: FileSystemFileHandle | null = null;

  constructor(
    id: string,
    displayName: string,
    projectDir: FileSystemDirectoryHandle
  ) {
    super(id, displayName);
    this.projectDir = projectDir;
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.projectDir, 'sections');
    await ensureDirectory(this.projectDir, 'images');
    await ensureDirectory(this.projectDir, 'assets');
    this.settingsHandle = await this.projectDir.getFileHandle('settings.json', { create: true });
    if ((await this.settingsHandle.getFile()).size === 0) {
      await writeJson(this.settingsHandle, createDefaultProjectSettings());
    }
  }

  protected async getSettings(): Promise<ProjectSettingsData> {
    if (!this.settingsHandle) return createDefaultProjectSettings();
    return normalizeProjectSettings(await readJson<ProjectSettingsData>(this.settingsHandle)).settings;
  }

  protected async writeSettingsSnapshot(settings: ProjectSettingsData): Promise<void> {
    await this.serializedWrite('settings.json', async () => {
      if (!this.settingsHandle) this.settingsHandle = await getFile(this.projectDir, 'settings.json', true);
      if (!this.settingsHandle) throw new Error('Could not create settings.json handle');
      await writeJson(this.settingsHandle, settings);
    });
  }

  async mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>> {
    await this.serializedWrite('settings.json', async () => {
      if (!this.settingsHandle) {
        this.settingsHandle = await getFile(this.projectDir, 'settings.json', true);
      }
      if (!this.settingsHandle) throw new Error('Could not create settings.json handle');
      const settings = await this.getSettings();
      applyProjectSettingsMutation(settings, mutation);
      try {
        await writeJson(this.settingsHandle, settings);
      } catch (err) {
        console.error('Failed to write settings.json', err);
        throw err;
      }
    });
    return {};
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
            await writeFile(backupHandle, content);
          }
        } catch (err) {
          console.warn('Failed to backup settings.json', err);
        }
      }

      const newSettingsHandle = await getFile(this.projectDir, 'settings.json', true);
      if (newSettingsHandle) {
        this.settingsHandle = newSettingsHandle;
        await writeJson(newSettingsHandle, createDefaultProjectSettings());
      }
    }

    const newReport = await this.inspectProject();
    newReport.backupPath = backupPath;
    return newReport;
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
      handle = await window.showDirectoryPicker({ mode: 'readwrite' });
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

    const permission = await handle.requestPermission({ mode: 'readwrite' });
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
