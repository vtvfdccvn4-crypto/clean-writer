import type { WorkspaceRef } from '../platform/types';
import { CwdocFileWorkspace } from '../platform/CwdocFileWorkspace';
import { projectSession } from '../services/ProjectSessionStore';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { DOCUMENT_EXTENSION, DOCUMENT_MIME_TYPE, parseDocumentBundle, writeDocumentFiles } from '../backup/document-bundle';
import { BackupError, describeBackupFailure } from '../backup/document-errors';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../project-settings/project-settings';
import { showNotice } from './components/Notice';

type OpenFilePicker = (options: {
  multiple: false;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle[]>;

/** True where the browser can open a file from the computer and keep a handle to it (Chromium). */
export function canOpenInPlace(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

let flushOnHideRegistered = false;

/** Writes pending changes when the window is hidden, so switching away does not lose the last edits. */
function registerFlushOnHide(): void {
  if (flushOnHideRegistered) return;
  flushOnHideRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const session = projectSession.getSession();
    if (session instanceof CwdocFileWorkspace) {
      session.flush().catch(error => console.error('[Document] A change could not be written to the file.', error));
    }
  });
}

/**
 * Opens a `.cwdoc` from the computer and works in that file: changes are written back to it, and nothing is copied
 * into browser storage. Returns true when the document is open. A ZIP backup cannot be written back to, so it opens
 * as a copy, as it did before.
 */
export async function openDocumentInPlace(): Promise<boolean> {
  const picker = (window as unknown as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
  if (!picker) return false;
  let handle: FileSystemFileHandle;
  try {
    [handle] = await picker({
      multiple: false,
      types: [{ description: 'Clear Writer document', accept: { [DOCUMENT_MIME_TYPE]: [DOCUMENT_EXTENSION] } }]
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      showNotice(`Clear Writer needs permission to save changes to ${handle.name}. Open it again and allow changes.`, 'error');
      return false;
    }
    const file = await handle.getFile();
    const parsed = await parseDocumentBundle(new Uint8Array(await file.arrayBuffer()), { supportedSettingsSchemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION });

    const session = new CwdocFileWorkspace(`file-${handle.name}-${Date.now()}`, parsed.manifest.title);
    await session.initialize();
    await writeDocumentFiles(session, parsed.files);
    session.attachFile(handle, file.lastModified);
    session.onSaveError = error => {
      console.error('[Document] A change could not be written to the file.', error);
      const known = describeBackupFailure(error, 'make');
      showNotice(known ? known.message : `A change could not be written to ${handle.name}. ${describeWorkspaceError(error, 'project')}`, 'error');
    };

    // Write out the document that is open now before switching, so its last edits are not lost.
    const previous = projectSession.getSession();
    if (previous instanceof CwdocFileWorkspace) await previous.flush();

    const ref: WorkspaceRef = { id: session.id, kind: 'file', displayName: session.displayName };
    await projectSession.activate(ref, session);
    registerFlushOnHide();
    showNotice(`Opened ${handle.name}. Changes are saved to that file.`, 'info');
    return true;
  } catch (error) {
    console.error('[Document] The document could not be opened in place.', error);
    const known = describeBackupFailure(error, 'read') ?? (error instanceof BackupError ? error : null);
    showNotice(known ? known.message : `The document could not be opened. ${describeWorkspaceError(error, 'open')}`, 'error');
    return false;
  }
}
