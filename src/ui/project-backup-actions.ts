import type { Platform, WorkspaceRef } from '../platform/types';
import { projectSession } from '../services/ProjectSessionStore';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { describeBytes } from '../backup/format';
import { BackupError, backupProjectBytes, checkBackupFileSize, checkStorageFor, createProjectBackup, describeBackupFailure, parseProjectBackup, restoreProjectBackup } from '../backup/project-backup';
import { showNotice } from './components/Notice';

/** Hands a file to the browser's download, which saves it to the user's downloads folder. */
export function saveBlobAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by the time this runs; a long delay keeps slow browsers from losing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Downloads the open project as a ZIP backup. The document being edited is saved first, so the backup holds the
 * text on screen. Works in every browser: it needs no local-folder access.
 */
export async function downloadProjectBackup(flushCurrentDocument: () => Promise<void>): Promise<void> {
  const session = projectSession.getSession();
  if (!session) {
    showNotice('Open a project to download a backup of it.', 'info');
    return;
  }
  try {
    await flushCurrentDocument();
    const backup = await createProjectBackup(session);
    saveBlobAs(new Blob([backup.bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), backup.fileName);
    showNotice(`Backup downloaded: ${backup.fileName} (${backup.manifest.files.length} files, ${describeBytes(backup.bytes.length)}). Keep it somewhere safe.`, 'info');
  } catch (error) {
    console.error('[ProjectBackup] The backup could not be made.', error);
    const known = describeBackupFailure(error, 'make');
    showNotice(known ? known.message : `The backup could not be made. ${describeWorkspaceError(error, 'project')}`, 'error');
  }
}

/** A project name that is not already in use: the backup's own name, or that name with "(imported)" added. */
async function freeProjectName(platform: Platform, wanted: string): Promise<string> {
  const known = platform.workspaceRepository.listKnownBrowserWorkspaces
    ? await platform.workspaceRepository.listKnownBrowserWorkspaces()
    : [];
  const taken = new Set(known.map(entry => entry.displayName.trim().toLowerCase()));
  const base = wanted.trim() || 'Imported project';
  if (!taken.has(base.toLowerCase())) return base;
  for (let attempt = 1; ; attempt += 1) {
    const candidate = `${base} (imported${attempt === 1 ? '' : ` ${attempt}`})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Creates a new browser-storage project from a backup file. The backup is checked in full before anything is
 * created, and a project that fails part-way is removed, so a bad file never leaves a broken project behind.
 * Returns the new project, or null after telling the user why not.
 */
export async function importProjectBackup(platform: Platform, file: File): Promise<WorkspaceRef | null> {
  let created: WorkspaceRef | null = null;
  try {
    checkBackupFileSize(file.size);
    let buffer: ArrayBuffer;
    try { buffer = await file.arrayBuffer(); } catch (error) { throw describeBackupFailure(error, 'read') ?? new BackupError('This file could not be read. It may have been moved or deleted; choose it again.'); }
    const parsed = await parseProjectBackup(new Uint8Array(buffer));
    await checkStorageFor(backupProjectBytes(parsed));
    const name = await freeProjectName(platform, parsed.manifest.projectName);
    created = await platform.workspaceRepository.selectDirectory({ kind: 'opfs', name });
    if (!created) throw new Error('The new project could not be created.');
    const session = await platform.workspaceRepository.open(created);
    await restoreProjectBackup(session, parsed);
    const left = parsed.ignored.length > 0 ? ` ${parsed.ignored.length} other file${parsed.ignored.length === 1 ? '' : 's'} in the ZIP ${parsed.ignored.length === 1 ? 'is' : 'are'} not part of a project and ${parsed.ignored.length === 1 ? 'was' : 'were'} left out.` : '';
    showNotice(`Imported "${name}" from the backup (${parsed.files.length} files).${left}`, 'info');
    return created;
  } catch (error) {
    console.error('[ProjectBackup] The backup could not be imported.', error);
    if (created) await platform.workspaceRepository.discardWorkspace?.(created).catch(() => undefined);
    const known = describeBackupFailure(error, 'read');
    showNotice(known ? known.message : `The backup could not be imported, and no project was created. ${describeWorkspaceError(error, 'project')}`, 'error');
    return null;
  }
}
