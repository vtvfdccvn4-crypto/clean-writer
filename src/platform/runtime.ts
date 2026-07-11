import type { Platform, WorkspaceRepository, WorkspaceSession, WorkspaceRef, AssetResolver, PaginationTransport } from './types';
import {
  InMemoryAssetResolver,
  InMemoryPaginationTransport,
} from './InMemoryWorkspace';
import { OPFSCatalogue } from './OPFSCatalogue';
import { OPFSAppLifecycle, OPFSWorkspaceRepository, OPFSWorkspaceSession } from './OPFSWorkspace';
import { DirectoryHandleCatalogue } from './DirectoryHandleCatalogue';
import { LocalDirectoryWorkspaceRepository, LocalDirectoryWorkspaceSession } from './LocalDirectoryWorkspace';
import { BlobUrlAssetResolver } from './BlobUrlAssetResolver';
import { ProjectService } from '../services/ProjectService';
import { BrowserExportService } from './BrowserExportService';

export type RecentWorkspaceEntry = { ref: WorkspaceRef, displayName: string, time: number };

export function sortRecentWorkspaceEntries(entries: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] {
  const deduped = new Map<string, RecentWorkspaceEntry>();
  for (const entry of entries) {
    const key = `${entry.ref.kind}:${entry.ref.id}`;
    const existing = deduped.get(key);
    if (!existing || entry.time > existing.time) {
      deduped.set(key, entry);
    }
  }
  return [...deduped.values()].sort((a, b) => b.time - a.time || a.displayName.localeCompare(b.displayName));
}

export function pickMostRecentWorkspace(entries: RecentWorkspaceEntry[]): WorkspaceRef | null {
  return sortRecentWorkspaceEntries(entries)[0]?.ref ?? null;
}

class CompositeWorkspaceRepository implements WorkspaceRepository {
  private opfsRepo: OPFSWorkspaceRepository;
  private directoryRepo: LocalDirectoryWorkspaceRepository | null;

  constructor(
    opfsRepo: OPFSWorkspaceRepository,
    directoryRepo: LocalDirectoryWorkspaceRepository | null
  ) {
    this.opfsRepo = opfsRepo;
    this.directoryRepo = directoryRepo;
  }

  async open(ref: WorkspaceRef): Promise<WorkspaceSession> {
    if (ref.kind === 'directory') {
      if (!this.directoryRepo) {
        throw new Error('Local folder access is unavailable in this browser.');
      }
      return this.directoryRepo.open(ref);
    }
    return this.opfsRepo.open(ref);
  }

  async selectDirectory(options?: { kind?: 'opfs' | 'directory', name?: string }): Promise<WorkspaceRef | null> {
    if (!this.directoryRepo) {
      return this.opfsRepo.selectDirectory(options);
    }

    if (options?.kind === 'directory') {
      return this.directoryRepo.selectDirectory();
    }
    if (options?.kind === 'opfs') {
      return this.opfsRepo.selectDirectory(options);
    }
    return null;
  }

  async listKnownBrowserWorkspaces(): Promise<RecentWorkspaceEntry[]> {
    const opfsCatalogue = (this.opfsRepo as any).catalogue as OPFSCatalogue;
    const dirCatalogue = this.directoryRepo ? (this.directoryRepo as any).catalogue as DirectoryHandleCatalogue : null;
    
    const opfsEntries = await opfsCatalogue.list();
    const dirEntries = dirCatalogue ? await dirCatalogue.listUsable() : [];

    return sortRecentWorkspaceEntries([
      ...dirEntries.map(e => ({ ref: { id: e.id, kind: 'directory' as const, displayName: e.displayName }, displayName: e.displayName, time: e.lastOpenedAt })),
      ...opfsEntries.map(e => ({ ref: { id: e.id, kind: 'opfs' as const, displayName: e.displayName }, displayName: e.displayName, time: e.lastOpenedAt }))
    ]);
  }

  async pickWorkspace(): Promise<WorkspaceRef | null> {
    const allEntries = await this.listKnownBrowserWorkspaces();

    if (allEntries.length === 0) {
      return null;
    }
    return allEntries[0].ref;
  }

  async getLastOpenedWorkspace(): Promise<WorkspaceRef | null> {
    return pickMostRecentWorkspace(await this.listKnownBrowserWorkspaces());
  }
}

class TrackingWorkspaceRepository implements WorkspaceRepository {
  private repository: WorkspaceRepository;
  private onOpen: (session: WorkspaceSession) => void;

  constructor(repository: WorkspaceRepository, onOpen: (session: WorkspaceSession) => void) {
    this.repository = repository;
    this.onOpen = onOpen;
  }

  async open(ref: WorkspaceRef): Promise<WorkspaceSession> {
    const session = await this.repository.open(ref);
    this.onOpen(session);
    return session;
  }

  async selectDirectory(options?: { kind?: 'opfs' | 'directory', name?: string }): Promise<WorkspaceRef | null> {
    return this.repository.selectDirectory(options);
  }

  async pickWorkspace(): Promise<WorkspaceRef | null> {
    return this.repository.pickWorkspace ? this.repository.pickWorkspace() : null;
  }

  async getLastOpenedWorkspace(): Promise<WorkspaceRef | null> {
    return this.repository.getLastOpenedWorkspace ? this.repository.getLastOpenedWorkspace() : null;
  }

  async listKnownBrowserWorkspaces(): Promise<Array<{ref: WorkspaceRef, displayName: string, time: number}>> {
    return this.repository.listKnownBrowserWorkspaces ? this.repository.listKnownBrowserWorkspaces() : [];
  }
}

export function createAppPlatform(win: Window = window): Platform {
  const opfsCatalogue = new OPFSCatalogue();
  const opfsRepo = new OPFSWorkspaceRepository(opfsCatalogue);

  const hasDirectoryPicker = typeof (win as any).showDirectoryPicker === 'function';
  const dirCatalogue = hasDirectoryPicker ? new DirectoryHandleCatalogue() : null;
  const dirRepo = dirCatalogue ? new LocalDirectoryWorkspaceRepository(dirCatalogue) : null;

  const compositeRepo = new CompositeWorkspaceRepository(opfsRepo, dirRepo);

  let activeSession: OPFSWorkspaceSession | LocalDirectoryWorkspaceSession | null = null;
  const repository = new TrackingWorkspaceRepository(
    compositeRepo,
    session => {
      activeSession = (session instanceof OPFSWorkspaceSession || session instanceof LocalDirectoryWorkspaceSession)
        ? session
        : null;
      ProjectService.setActiveSession(session);
    }
  );

  return {
    workspaceRepository: repository,
    exportService: new BrowserExportService(),
    appLifecycle: new OPFSAppLifecycle(),
    assetResolver: new BlobUrlAssetResolver(async (path) => {
      if (!activeSession || typeof activeSession.readBlob !== 'function') return null;
      try { return await activeSession.readBlob(path); }
      catch { return null; }
    }),
    paginationTransport: new InMemoryPaginationTransport()
  };
}

export function createWorkerRuntime(): {
  transport: PaginationTransport;
  assetResolver: AssetResolver;
} {
  return {
    transport: new InMemoryPaginationTransport(),
    assetResolver: new InMemoryAssetResolver(() => null)
  };
}
