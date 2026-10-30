import type { Platform, WorkspaceRef } from '../platform/types';
import { projectSession } from '../services/ProjectSessionStore';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { describeBytes } from '../backup/format';
import { BackupError, checkBackupFileSize, checkStorageFor, describeBackupFailure, restoreProjectBackup } from '../backup/project-backup';
import { DOCUMENT_EXTENSION, DOCUMENT_MIME_TYPE, createDocumentFromSource, parseDocumentBundle, writeDocumentFiles } from '../backup/document-bundle';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../project-settings/project-settings';
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

interface SaveFileHandle {
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

/**
 * Saves the `.cwdoc` where the browser lets the person choose the place and name (Chromium desktop). Everywhere
 * else it is a download. Returns false only when the person cancels the save dialog.
 */
async function saveDocumentBytes(bytes: Uint8Array, fileName: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) {
    saveBlobAs(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: DOCUMENT_MIME_TYPE }), fileName);
    return true;
  }
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: 'Clear Writer document', accept: { [DOCUMENT_MIME_TYPE]: [DOCUMENT_EXTENSION] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

/**
 * Saves the open document as a `.cwdoc`. The document being edited is saved first, so the file holds the text on
 * screen. Works in every browser: it needs no local-folder access.
 */
export async function saveProjectDocument(flushCurrentDocument: () => Promise<void>): Promise<void> {
  const session = projectSession.getSession();
  if (!session) {
    showNotice('Open a document to save it.', 'info');
    return;
  }
  try {
    await flushCurrentDocument();
    const saved = await createDocumentFromSource(session);
    if (await saveDocumentBytes(saved.bytes, saved.fileName)) {
      showNotice(`Saved ${saved.fileName} (${describeBytes(saved.bytes.length)}). Keep it somewhere safe.`, 'info');
    }
  } catch (error) {
    console.error('[Document] The document could not be saved.', error);
    const known = describeBackupFailure(error, 'make');
    showNotice(known ? known.message : `The document could not be saved. ${describeWorkspaceError(error, 'project')}`, 'error');
  }
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
 * Opens a `.cwdoc`, or a ZIP backup from before it, as a new document in browser storage. The file is checked in
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
    const title = parsed.kind === 'document' ? parsed.manifest.title : parsed.manifest.projectName;
    await checkStorageFor(parsed.files.reduce((sum, entry) => sum + entry.data.length, 0));
    const name = await freeProjectName(platform, title);
    created = await platform.workspaceRepository.selectDirectory({ kind: 'opfs', name });
    if (!created) throw new Error('The new document could not be created.');
    const session = await platform.workspaceRepository.open(created);
    if (parsed.kind === 'document') {
      await writeDocumentFiles(session, parsed.files);
      showNotice(`Opened "${name}" (${parsed.files.length} files).`, 'info');
    } else {
      await restoreProjectBackup(session, { manifest: parsed.manifest, files: parsed.files, ignored: [] });
      showNotice(`Opened "${name}" from an older backup (${parsed.files.length} files). Save it as a .cwdoc to keep it in the new format.`, 'info');
    }
    return created;
  } catch (error) {
    console.error('[Document] The document could not be opened.', error);
    if (created) await platform.workspaceRepository.discardWorkspace?.(created).catch(() => undefined);
    const known = describeBackupFailure(error, 'read');
    showNotice(known ? known.message : `The document could not be opened, and no document was created. ${describeWorkspaceError(error, 'project')}`, 'error');
    return null;
  }
}
