import type {
  FileNode,
  PageSetup,
  TypographySetup,
  ListSetup,
  TableSetup,
  ProjectMetadata,
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
  writeImage(path: string, data: Uint8Array): Promise<boolean>;
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
  preloadImages(paths: string[]): Promise<void>;
  resolveSync(path: string): string;
  release(url: string): void;
  releaseAll(): void;
}

export type ExportResult =
  | { status: 'saved' }
  | { status: 'cancelled' }
  | { status: 'failed'; error?: string };

export interface ExportSupport {
  readonly docx: boolean;
  readonly pdf: boolean;
}

export interface PdfExportDocument {
  readonly html: string;
  /** Generated Paged.js geometry bound to this exact paginated DOM. */
  readonly paginationCss: string;
  readonly pageSetup: PageSetup;
  readonly isPaginated: true;
}

export interface DocumentExportService {
  readonly support: ExportSupport;
  preparePdfExport?(): Window | null;
  saveDocx(data: Uint8Array, suggestedName: string): Promise<ExportResult>;
  exportPdf(
    html: string,
    pageSetup: PageSetup,
    typographySetup: TypographySetup,
    listSetup: ListSetup,
    tableSetup: TableSetup,
    projectMetadata: ProjectMetadata,
    projectPath: string | null,
    exportWindow?: Window | null,
    paginationCss?: string
  ): Promise<boolean>;
}

export interface PdfPaginationPayload {
  requestId: string;
  html: string;
  pageSetup: PageSetup;
  typographySetup: TypographySetup;
  listSetup: ListSetup;
  tableSetup: TableSetup;
  projectMetadata: ProjectMetadata;
  projectPath: string | null;
}

export interface PaginationTransport {
  onExecutePagination(callback: (payload: PdfPaginationPayload) => void): void;
  sendPaginationResult(result: {
    requestId: string;
    ok: boolean;
    pageCount?: number;
    error?: string;
  }): void;
}

export interface AppLifecycle {
  onBeforeClose(callback: () => void): void;
  confirmClose(ok: boolean, error?: string): void;
}

export interface Platform {
  workspaceRepository: WorkspaceRepository;
  assetResolver: AssetResolver;
  exportService: DocumentExportService;
  paginationTransport: PaginationTransport;
  appLifecycle: AppLifecycle;
}
