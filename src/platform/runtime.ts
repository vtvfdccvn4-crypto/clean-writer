import type { Platform, WorkspaceRepository, WorkspaceSession, WorkspaceRef } from './types';
import { OPFSCatalogue } from './OPFSCatalogue';
import { OPFSAppLifecycle, OPFSWorkspaceRepository } from './OPFSWorkspace';
import { DirectoryHandleCatalogue } from './DirectoryHandleCatalogue';
import { LocalDirectoryWorkspaceRepository } from './LocalDirectoryWorkspace';
import { BlobUrlAssetResolver } from './BlobUrlAssetResolver';
import { projectSession } from '../services/ProjectSessionStore';

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
  private readonly opfsCatalogue: OPFSCatalogue;
  private readonly directoryCatalogue: DirectoryHandleCatalogue | null;

  constructor(
    opfsRepo: OPFSWorkspaceRepository,
    directoryRepo: LocalDirectoryWorkspaceRepository | null,
    opfsCatalogue: OPFSCatalogue,
    directoryCatalogue: DirectoryHandleCatalogue | null
  ) {
    this.opfsRepo = opfsRepo;
    this.directoryRepo = directoryRepo;
    this.opfsCatalogue = opfsCatalogue;
    this.directoryCatalogue = directoryCatalogue;
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
    const opfsEntries = await this.opfsCatalogue.list();
    const dirEntries = this.directoryCatalogue ? await this.directoryCatalogue.listUsable() : [];

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

export function createAppPlatform(win: Window = window): Platform {
  const opfsCatalogue = new OPFSCatalogue();
  const opfsRepo = new OPFSWorkspaceRepository(opfsCatalogue);

  const hasDirectoryPicker = typeof win.showDirectoryPicker === 'function';
  const dirCatalogue = hasDirectoryPicker ? new DirectoryHandleCatalogue() : null;
  const dirRepo = dirCatalogue ? new LocalDirectoryWorkspaceRepository(dirCatalogue) : null;

  const compositeRepo = new CompositeWorkspaceRepository(opfsRepo, dirRepo, opfsCatalogue, dirCatalogue);

  return {
    workspaceRepository: compositeRepo,
    appLifecycle: new OPFSAppLifecycle(),
    assetResolver: new BlobUrlAssetResolver(async (path) => {
      const session = projectSession.getSession();
      if (!session || typeof session.readBlob !== 'function') return null;
      try { return await session.readBlob(path); }
      catch { return null; }
    })
  };
}
