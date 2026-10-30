import type { Platform, WorkspaceRef } from '../platform/types';
import { projectSession } from '../services/ProjectSessionStore';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { describeBytes } from '../backup/format';
import { BackupError, checkBackupFileSize, checkStorageFor, describeBackupFailure } from '../backup/document-errors';
import { DOCUMENT_EXTENSION, DOCUMENT_MIME_TYPE, createDocumentFromSource, parseDocumentBundle, writeDocumentFiles } from '../backup/document-bundle';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../project-settings/project-settings';
import { CwdocFileWorkspace, writeHandle } from '../platform/CwdocFileWorkspace';
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

/** Where a save goes: a file the person picked (Chromium), or a download everywhere else. Null means they cancelled. */
type SaveTarget = { readonly handle: FileSystemFileHandle } | { readonly handle: null };

async function chooseSaveTarget(fileName: string): Promise<SaveTarget | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (!picker) return { handle: null };
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: 'Clear Writer document', accept: { [DOCUMENT_MIME_TYPE]: [DOCUMENT_EXTENSION] } }]
    });
    return { handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/**
 * Saves the document bytes where the person chooses. Returns false only when they cancel the save dialog. A
 * download (no picker) cannot be followed by a hand-over, so the chosen file is returned for callers that need it.
 */
async function saveDocumentBytes(bytes: Uint8Array, fileName: string): Promise<FileSystemFileHandle | 'download' | null> {
  const target = await chooseSaveTarget(fileName);
  if (!target) return null;
  if (!target.handle) {
    saveBlobAs(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: DOCUMENT_MIME_TYPE }), fileName);
    return 'download';
  }
  await writeHandle(target.handle, bytes);
  return target.handle;
}

/**
 * Saves the open document as a `.cwdoc`. For a document opened from the computer, Save writes to that file.
 * Otherwise it saves a copy where the person chooses. The document being edited is saved first, so the file holds
 * the text on screen.
 */
export async function saveProjectDocument(flushCurrentDocument: () => Promise<void>): Promise<void> {
  const session = projectSession.getSession();
  if (!session) {
    showNotice('Open a document to save it.', 'info');
    return;
  }
  try {
    await flushCurrentDocument();
    if (session instanceof CwdocFileWorkspace && session.fileName) {
      await session.flush();
      showNotice(`Saved ${session.fileName}.`, 'info');
      return;
    }
    await saveCopy(session);
  } catch (error) {
    console.error('[Document] The document could not be saved.', error);
    const known = describeBackupFailure(error, 'make');
    showNotice(known ? known.message : `The document could not be saved. ${describeWorkspaceError(error, 'project')}`, 'error');
  }
}

/**
 * Saves a copy of the open document where the person chooses, then keeps working in that copy when the document is
 * open from the computer. The file that was open keeps the contents it had at this save.
 */
export async function saveProjectDocumentAs(flushCurrentDocument: () => Promise<void>): Promise<void> {
  const session = projectSession.getSession();
  if (!session) {
    showNotice('Open a document to save a copy of it.', 'info');
    return;
  }
  try {
    await flushCurrentDocument();
    await saveCopy(session);
  } catch (error) {
    console.error('[Document] The document could not be saved as a copy.', error);
    const known = describeBackupFailure(error, 'make');
    showNotice(known ? known.message : `The document could not be saved as a copy. ${describeWorkspaceError(error, 'project')}`, 'error');
  }
}

async function saveCopy(session: NonNullable<ReturnType<typeof projectSession.getSession>>): Promise<void> {
  if (session instanceof CwdocFileWorkspace) await session.flush();
  const saved = await createDocumentFromSource(session);
  const result = await saveDocumentBytes(saved.bytes, saved.fileName);
  if (result === null) return;
  if (result === 'download') {
    showNotice(`Saved ${saved.fileName} (${describeBytes(saved.bytes.length)}). Keep it somewhere safe.`, 'info');
    return;
  }
  if (session instanceof CwdocFileWorkspace) {
    session.attachFile(result, (await result.getFile()).lastModified);
  }
  showNotice(`Saved ${result.name}. Changes now go to that file.`, 'info');
}

/** A project name that is not already in use: the document's own name, or that name with "(imported)" added. */
async function freeProjectName(platform: Platform, wanted: string): Promise<string> {
  const known = platform.workspaceRepository.listKnownBrowserWorkspaces
    ? await platform.workspaceRepository.listKnownBrowserWorkspaces()
    : [];
  const taken = new Set(known.map(entry => entry.displayName.trim().toLowerCase()));
  const base = wanted.trim() || 'Imported document';
  if (!taken.has(base.toLowerCase())) return base;
  for (let attempt = 1; ; attempt += 1) {
    const candidate = `${base} (imported${attempt === 1 ? '' : ` ${attempt}`})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Opens a `.cwdoc` as a new document in browser storage. The file is checked in
 * full before anything is created, and a document that fails part-way is removed, so a bad file never leaves a
 * broken document behind. Returns the new document, or null after telling the user why not.
 */
export async function openProjectDocument(platform: Platform, file: File): Promise<WorkspaceRef | null> {
  let created: WorkspaceRef | null = null;
  try {
    checkBackupFileSize(file.size);
    let buffer: ArrayBuffer;
    try { buffer = await file.arrayBuffer(); } catch (error) { throw describeBackupFailure(error, 'read') ?? new BackupError('This file could not be read. It may have been moved or deleted; choose it again.'); }
    const parsed = await parseDocumentBundle(new Uint8Array(buffer), { supportedSettingsSchemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION });
    await checkStorageFor(parsed.files.reduce((sum, entry) => sum + entry.data.length, 0));
    const name = await freeProjectName(platform, parsed.manifest.title);
    created = await platform.workspaceRepository.selectDirectory({ kind: 'opfs', name });
    if (!created) throw new Error('The new document could not be created.');
    const session = await platform.workspaceRepository.open(created);
    await writeDocumentFiles(session, parsed.files);
    showNotice(`Opened "${name}" (${parsed.files.length} files).`, 'info');
    return created;
  } catch (error) {
    console.error('[Document] The document could not be opened.', error);
    if (created) await platform.workspaceRepository.discardWorkspace?.(created).catch(() => undefined);
    const known = describeBackupFailure(error, 'read');
    showNotice(known ? known.message : `The document could not be opened, and no document was created. ${describeWorkspaceError(error, 'project')}`, 'error');
    return null;
  }
}
