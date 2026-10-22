import type {
  FileNode,
  ProjectSettingsMutation,
  ProjectHealthReport,
  ProjectSettingsData,
  WorkspaceRef,
  SectionPlacement
} from '../types';

export type WorkspaceId = string;
export type ProjectPath = string; // relative path

export interface WorkspaceCapabilities {
  readonly canSelectDirectory: boolean;
  readonly canSaveFile: boolean;
  readonly supportsAtomicWrite: boolean;
  readonly canPersistHandle: boolean;
}

export type { WorkspaceRef, SectionPlacement };

export interface WorkspaceSession {
  readonly id: WorkspaceId;
  readonly kind: 'memory' | 'opfs' | 'directory';
  readonly displayName: string;
  readonly capabilities: WorkspaceCapabilities;

  readSettings(): Promise<ProjectSettingsData>;
  mutateSettings(mutation: ProjectSettingsMutation): Promise<Record<string, unknown>>;
  inspectProject(): Promise<ProjectHealthReport>;
  recoverProjectSettings(): Promise<ProjectHealthReport>;

  listSections(): Promise<FileNode[]>;
  listImages(): Promise<FileNode[]>;
  readSection(path: ProjectPath): Promise<string>;
  writeSection(path: ProjectPath, content: string): Promise<boolean>;
  createSection(fileName: string, content: string): Promise<{ success: boolean; newPath?: string }>;
  createFolder(folderName: string): Promise<{ success: boolean; newPath?: string }>;
  renameSection(oldName: string, newName: string): Promise<boolean>;
  moveSection(
    sourceName: string,
    targetName: string | null,
    placement: SectionPlacement
  ): Promise<{ success: boolean; newPath?: string }>;
  deleteSection(fileName: string): Promise<boolean>;
  writeImage(path: string, data: Uint8Array<ArrayBuffer>): Promise<boolean>;
  readBlob?(path: string): Promise<Blob>;
}

export interface WorkspaceRepository {
  open(ref: WorkspaceRef): Promise<WorkspaceSession>;
  selectDirectory(options?: { kind?: 'opfs' | 'directory', name?: string }): Promise<WorkspaceRef | null>;
  pickWorkspace(): Promise<WorkspaceRef | null>;
  getLastOpenedWorkspace?(): Promise<WorkspaceRef | null>;
  listKnownBrowserWorkspaces?(): Promise<Array<{ref: WorkspaceRef, displayName: string, time: number}>>;
}

export interface AssetResolver {
  /** Stops scheduling work when the caller no longer needs the resolved assets. */
  preloadImages(paths: string[], signal?: AbortSignal): Promise<void>;
  resolveSync(path: string): string;
  releaseAll(): void;
}

export interface AppLifecycle {
  onBeforeClose(callback: () => void): void;
  confirmClose(ok: boolean, error?: string): void;
}

export interface Platform {
  workspaceRepository: WorkspaceRepository;
  assetResolver: AssetResolver;
  appLifecycle: AppLifecycle;
}
