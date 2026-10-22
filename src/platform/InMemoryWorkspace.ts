import type {
  ProjectHealthReport,
  ProjectSettingsData,
  ProjectSettingsMutation
} from '../types';
import type {
  WorkspaceRepository,
  WorkspaceSession,
  WorkspaceCapabilities,
  WorkspaceRef,
  AssetResolver
} from './types';
import { normalizeExplorerPath } from '../utils/path-utils';
import { getBlockGlyphLookupPaths } from '../customBlockGlyphs';
import { applyProjectSettingsMutation } from '../project-settings/settings-mutations';
import { createDefaultProjectSettings } from '../project-settings/project-settings';
import { resolveImagePath, resolveSectionPath } from '../project-settings/project-paths';
import { AbstractWorkspaceSession, clone } from './AbstractWorkspaceSession';
import { MemoryDirectoryHandle } from './MemoryFileSystem';

export class InMemoryAssetResolver implements AssetResolver {
  private cache = new Map<string, string>();
  private sessionGetter: () => InMemoryWorkspaceSession | null;

  constructor(sessionGetter: () => InMemoryWorkspaceSession | null) {
    this.sessionGetter = sessionGetter;
  }

  async preloadImages(paths: string[]): Promise<void> {
    const session = this.sessionGetter();
    if (!session) return;

    for (const path of paths) {
      const normalizedPath = normalizeExplorerPath(path);
      if (!normalizedPath || this.cache.has(normalizedPath)) continue;
      try {
        for (const candidate of getBlockGlyphLookupPaths(normalizedPath)) {
          const imgNode = await session.readBlob(candidate).catch(() => null);
          if (imgNode) {
            const url = URL.createObjectURL(imgNode);
            this.cache.set(normalizedPath, url);
            break;
          }
        }
      } catch (e) {
        console.warn('Failed to preload in-memory image:', path, e);
      }
    }
  }

  resolveSync(path: string): string {
    return this.cache.get(normalizeExplorerPath(path)) || path;
  }

  releaseAll(): void {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

/**
 * A transient workspace that runs the shared session code over an in-memory
 * file tree, so its paths and mutations match the OPFS and directory backends.
 */
export class InMemoryWorkspaceSession extends AbstractWorkspaceSession {
  readonly kind = 'memory';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: false,
    canSaveFile: false,
    supportsAtomicWrite: false,
    canPersistHandle: false
  };

  private readonly root = new MemoryDirectoryHandle();
  protected readonly projectDir: FileSystemDirectoryHandle = this.root.asDirectoryHandle();
  private settings: ProjectSettingsData = createDefaultProjectSettings();

  constructor(id: string, displayName: string) {
    super(id, displayName);
  }

  async initialize(): Promise<void> {
    for (const name of ['sections', 'images', 'assets']) {
      await this.root.getDirectoryHandle(name, { create: true });
    }
  }

  protected async getSettings(): Promise<ProjectSettingsData> {
    return clone(this.settings);
  }

  protected async writeSettingsSnapshot(settings: ProjectSettingsData): Promise<void> {
    this.settings = clone(settings);
  }

  async mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>> {
    await this.serializedWrite('settings.json', async () => {
      const next = clone(this.settings);
      applyProjectSettingsMutation(next, mutation);
      this.settings = next;
    });
    return {};
  }

  async inspectProject(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  async recoverProjectSettings(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  /** Synchronously place a section, resolved the same way as writeSection. */
  seedSection(path: string, content: string): void {
    this.root.seedFile(resolveSectionPath(path), new Blob([content]));
  }

  /** Synchronously place an image, resolved the same way as writeImage. */
  seedImage(path: string, data: Blob): void {
    this.root.seedFile(resolveImagePath(path), data);
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private activeSessions = new Map<string, InMemoryWorkspaceSession>();

  async open(ref: WorkspaceRef): Promise<WorkspaceSession> {
    if (!this.activeSessions.has(ref.id)) {
      this.activeSessions.set(ref.id, new InMemoryWorkspaceSession(ref.id, ref.displayName));
    }
    return this.activeSessions.get(ref.id)!;
  }

  async pickWorkspace(): Promise<WorkspaceRef | null> {
    return null;
  }

  async selectDirectory(): Promise<WorkspaceRef | null> {
    const mockId = 'mock-project-' + Math.random().toString(36).substring(7);
    return {
      id: mockId,
      kind: 'memory',
      displayName: 'Mock In-Memory Workspace'
    };
  }
}
