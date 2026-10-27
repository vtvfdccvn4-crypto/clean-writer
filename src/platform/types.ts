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

/** `conflict`: the file changed outside the app since it was last read or written, so it was left as it is. */
export type SectionWriteOutcome = 'saved' | 'conflict' | 'failed';

/** A deleted file or folder waiting in the project's trash. */
export interface TrashItem {
  readonly id: string;
  readonly name: string;
  /** Where it was before it was deleted. */
  readonly originalPath: ProjectPath;
  readonly kind: 'file' | 'folder';
  /** Total bytes of the trashed content, recorded when the item was deleted. Absent for entries trashed before this field was added. */
  readonly sizeBytes?: number;
  /** Milliseconds since the Unix epoch. */
  readonly deletedAt: number;
}

export interface TrashRestoreResult {
  readonly success: boolean;
  /** Where it was put back. This differs from the original path when something else had taken that name. */
  readonly restoredPath?: ProjectPath;
  readonly reason?: string;
}

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
  /** Like writeSection, but says whether the file changed outside the app. */
  writeSectionChecked(path: ProjectPath, content: string): Promise<SectionWriteOutcome>;
  createSection(fileName: string, content: string): Promise<{ success: boolean; newPath?: string }>;
  createFolder(folderName: string): Promise<{ success: boolean; newPath?: string }>;
  renameSection(oldName: string, newName: string): Promise<boolean>;
  moveSection(
    sourceName: string,
    targetName: string | null,
    placement: SectionPlacement
  ): Promise<{ success: boolean; newPath?: string }>;
  /** Moves a section or folder to the project's trash. */
  deleteSection(fileName: string): Promise<boolean>;
  listTrash(): Promise<TrashItem[]>;
  restoreFromTrash(id: string): Promise<TrashRestoreResult>;
  /** Removes one item from the trash for good, or every item when no id is given. */
  purgeTrash(id?: string): Promise<boolean>;
  /**
   * The project's files as stored, for backup and restore: every file under sections, images and assets, and
   * `settings.json`. The trash is not included.
   */
  listProjectFiles(): Promise<string[]>;
  readProjectFile(path: string): Promise<Uint8Array>;
  /** Writes a file in the same set. `settings.json` is checked and normalised before it is kept. */
  writeProjectFile(path: string, data: Uint8Array): Promise<void>;
  writeImage(path: string, data: Uint8Array<ArrayBuffer>): Promise<boolean>;
  readBlob?(path: string): Promise<Blob>;
}

export interface WorkspaceRepository {
  open(ref: WorkspaceRef): Promise<WorkspaceSession>;
  /** Forgets a browser-storage project and deletes its files, for example after a restore that failed part-way. */
  discardWorkspace?(ref: WorkspaceRef): Promise<void>;
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
