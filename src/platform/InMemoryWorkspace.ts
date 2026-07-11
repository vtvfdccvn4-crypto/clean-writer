import type {
  FileNode,
  ProjectSettingsMutation,
  ProjectHealthReport,
  ProjectSettingsData
} from '../types';
import type {
  WorkspaceRepository,
  WorkspaceSession,
  WorkspaceCapabilities,
  WorkspaceRef,
  AssetResolver,
  DocumentExportService,
  ExportResult,
  PaginationTransport,
  PdfPaginationPayload,
  AppLifecycle,
  SectionPlacement
} from './types';
import {
  DEFAULT_PAGE_SETUP,
  DEFAULT_TYPOGRAPHY_SETUP,
  DEFAULT_LIST_SETUP,
  DEFAULT_TABLE_SETUP,
  DEFAULT_PROJECT_METADATA
} from '../config/defaults';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../services/project-settings';
import { normalizeExplorerPath, replacePathPrefix } from '../utils/path-utils';
import { calculateSectionMove } from './section-order';
import { getBlockGlyphLookupPaths } from '../customBlockGlyphs';
import { removeSettingsPath, replaceSettingsPath } from './project-paths';

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
          const imgNode = session.imagesMap.get(candidate);
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

  release(url: string): void {
    for (const [key, value] of this.cache.entries()) {
      if (value === url) {
        URL.revokeObjectURL(url);
        this.cache.delete(key);
        break;
      }
    }
  }

  releaseAll(): void {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

export class InMemoryWorkspaceSession implements WorkspaceSession {
  readonly kind = 'memory';
  readonly capabilities: WorkspaceCapabilities = {
    canSelectDirectory: false,
    canSaveFile: false,
    supportsAtomicWrite: false,
    canPersistHandle: false
  };

  sectionsMap = new Map<string, string>(); // path -> content
  foldersSet = new Set<string>();
  imagesMap = new Map<string, Blob>();
  settings: ProjectSettingsData;
  readonly id: string;
  readonly displayName: string;

  constructor(
    id: string,
    displayName: string
  ) {
    this.id = id;
    this.displayName = displayName;
    this.settings = {
      schemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION,
      order: [],
      pageBreaks: [],
      hiddenHeaders: [],
      hiddenFooters: [],
      numberedHeadings: [],
      tocSections: [],
      pageSetup: { ...DEFAULT_PAGE_SETUP },
      typographySetup: { ...DEFAULT_TYPOGRAPHY_SETUP },
      listSetup: { ...DEFAULT_LIST_SETUP },
      tableSetup: { ...DEFAULT_TABLE_SETUP },
      projectMetadata: { ...DEFAULT_PROJECT_METADATA },
      customStyles: [],
      customBlockStyles: []
    };
  }

  async readSettings(): Promise<ProjectSettingsData> {
    return JSON.parse(JSON.stringify(this.settings));
  }

  async mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>> {
    const clone = JSON.parse(JSON.stringify(this.settings));

    if (mutation.type === 'patch') {
      Object.assign(clone, mutation.values);
    } else if (mutation.type === 'append-order') {
      const normalized = normalizeExplorerPath(mutation.path);
      if (!clone.order.includes(normalized)) {
        clone.order.push(normalized);
      }
    } else if (mutation.type === 'set-path-flag') {
      const normalized = normalizeExplorerPath(mutation.path);
      const list = clone[mutation.key] as string[];
      if (list) {
        const isEnabled = mutation.enabled ?? !list.includes(normalized);
        if (isEnabled && !list.includes(normalized)) {
          list.push(normalized);
        } else if (!isEnabled) {
          const index = list.indexOf(normalized);
          if (index !== -1) list.splice(index, 1);
        }
      }
    } else if (mutation.type === 'replace-path') {
      const oldNorm = normalizeExplorerPath(mutation.oldPath);
      const newNorm = normalizeExplorerPath(mutation.newPath);
      replaceSettingsPath(clone, oldNorm, newNorm);
    } else if (mutation.type === 'remove-path') {
      const norm = normalizeExplorerPath(mutation.path);
      removeSettingsPath(clone, norm);
    }

    this.settings = clone;
    return {};
  }

  async inspectProject(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  async recoverProjectSettings(): Promise<ProjectHealthReport> {
    return { valid: true, recoverable: true, issues: [] };
  }

  async listSections(): Promise<FileNode[]> {
    const list: FileNode[] = [];
    for (const folder of this.foldersSet) {
      list.push({ path: folder, isDir: true });
    }
    for (const file of this.sectionsMap.keys()) {
      list.push({ path: file, isDir: false });
    }
    return list;
  }

  async listImages(): Promise<FileNode[]> {
    const list: FileNode[] = [];
    for (const file of this.imagesMap.keys()) {
      list.push({ path: file, isDir: false });
    }
    return list;
  }

  async writeImage(path: string, data: Uint8Array): Promise<boolean> {
    const normalized = normalizeExplorerPath(path);
    if (!normalized) return false;
    this.imagesMap.set(normalized, new Blob([data as any]));
    return true;
  }

  async readSection(path: string): Promise<string> {
    const normalized = normalizeExplorerPath(path);
    if (!this.sectionsMap.has(normalized)) {
      throw new Error(`File not found: ${normalized}`);
    }
    return this.sectionsMap.get(normalized)!;
  }

  async writeSection(path: string, content: string): Promise<boolean> {
    const normalized = normalizeExplorerPath(path);
    this.sectionsMap.set(normalized, content);
    return true;
  }

  async createSection(fileName: string, content: string): Promise<{ success: boolean; newPath?: string }> {
    const normalized = normalizeExplorerPath(fileName);
    if (this.sectionsMap.has(normalized)) return { success: false };
    this.sectionsMap.set(normalized, content);
    return { success: true, newPath: normalized };
  }

  async createFolder(folderName: string): Promise<{ success: boolean; newPath?: string }> {
    const normalized = normalizeExplorerPath(folderName);
    if (this.foldersSet.has(normalized)) return { success: false };
    this.foldersSet.add(normalized);
    return { success: true, newPath: normalized };
  }

  async renameSection(oldName: string, newName: string): Promise<boolean> {
    const normalizedOld = normalizeExplorerPath(oldName);
    const normalizedNew = normalizeExplorerPath(newName);
    if (!normalizedOld || !normalizedNew) return false;
    if (normalizedOld === normalizedNew) {
      return this.foldersSet.has(normalizedOld) || this.sectionsMap.has(normalizedOld);
    }
    if (this.foldersSet.has(normalizedNew) || this.sectionsMap.has(normalizedNew)) return false;

    if (this.foldersSet.has(normalizedOld)) {
      const nextFolders = new Set<string>();
      for (const folder of this.foldersSet) {
        nextFolders.add(replacePathPrefix(folder, normalizedOld, normalizedNew));
      }
      const nextSections = new Map<string, string>();
      for (const [key, value] of this.sectionsMap.entries()) {
        nextSections.set(replacePathPrefix(key, normalizedOld, normalizedNew), value);
      }
      this.foldersSet = nextFolders;
      this.sectionsMap = nextSections;
      replaceSettingsPath(this.settings, normalizedOld, normalizedNew);
      return true;
    }

    if (this.sectionsMap.has(normalizedOld)) {
      const nextSections = new Map<string, string>();
      for (const [key, value] of this.sectionsMap.entries()) {
        if (key === normalizedOld) {
          nextSections.set(normalizedNew, value);
        } else {
          nextSections.set(key, value);
        }
      }
      this.sectionsMap = nextSections;
      replaceSettingsPath(this.settings, normalizedOld, normalizedNew);
      return true;
    }

    return false;
  }

  async moveSection(
    sourceName: string,
    targetName: string | null,
    placement: SectionPlacement
  ): Promise<{ success: boolean; newPath?: string }> {
    const entries = await this.listSections();
    const move = calculateSectionMove(entries, this.settings.order, sourceName, targetName, placement);
    if (!move) return { success: false };

    const renamed = await this.renameSection(move.source, move.destination);
    if (!renamed) return { success: false };

    this.settings.order = move.order;
    return { success: true, newPath: move.destination };
  }

  async deleteSection(fileName: string): Promise<boolean> {
    const normalized = normalizeExplorerPath(fileName);
    if (this.foldersSet.has(normalized)) {
      const nextFolders = new Set<string>();
      for (const folder of this.foldersSet) {
        if (folder !== normalized && !folder.startsWith(`${normalized}/`)) {
          nextFolders.add(folder);
        }
      }
      const nextSections = new Map<string, string>();
      for (const [key, value] of this.sectionsMap.entries()) {
        if (key !== normalized && !key.startsWith(`${normalized}/`)) {
          nextSections.set(key, value);
        }
      }
      this.foldersSet = nextFolders;
      this.sectionsMap = nextSections;
      removeSettingsPath(this.settings, normalized);
      return true;
    }

    if (this.sectionsMap.has(normalized)) {
      this.sectionsMap.delete(normalized);
      removeSettingsPath(this.settings, normalized);
      return true;
    }

    return false;
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

export class InMemoryExportService implements DocumentExportService {
  readonly support = {
    docx: true,
    pdf: true
  } as const;

  async saveDocx(_data: Uint8Array, _suggestedName: string): Promise<ExportResult> {
    return { status: 'saved' };
  }

  async exportPdf(): Promise<boolean> {
    return true;
  }
}

export class InMemoryPaginationTransport implements PaginationTransport {
  onExecutePagination(_callback: (payload: PdfPaginationPayload) => void): void {
    // No-op
  }

  sendPaginationResult(_result: unknown): void {
    // No-op
  }
}

export class InMemoryAppLifecycle implements AppLifecycle {
  onBeforeClose(_callback: () => void): void {
    // No-op
  }

  confirmClose(_ok: boolean, _error?: string): void {
    // No-op
  }
}
