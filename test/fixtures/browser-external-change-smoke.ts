import { state } from '/src/state.ts';
import { projectSession } from '/src/services/ProjectSessionStore.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

async function resetBrowserStorage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete OPFS catalogue database.'));
    request.onblocked = () => resolve();
  });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

/** Overwrites a section's file the way another program would, outside the app's session. */
async function writeOutside(projectId: string, path: string, text: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects');
  const project = await projects.getDirectoryHandle(projectId);
  const sections = await project.getDirectoryHandle('sections');
  const file = await sections.getFileHandle(path);
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

async function readOutside(projectId: string, path: string): Promise<string> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle('projects');
  const project = await projects.getDirectoryHandle(projectId);
  const sections = await project.getDirectoryHandle('sections');
  return (await (await sections.getFileHandle(path)).getFile()).text();
}

async function run() {
  await resetBrowserStorage();
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'External Change Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);
  const projectId = state.current.projectRef?.id;
  if (!projectId) throw new Error('Missing OPFS project id.');

  await projectSession.createSection('sections/Conflict.md', '# Conflict');
  await waitFor('section active', () => state.current.activeFile === 'sections/Conflict.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);

  // Another program changes the file while the editor has it open.
  const external = '# Changed in another program';
  await writeOutside(projectId, 'Conflict.md', external);

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  view.setValue('# Our edit that must not overwrite the file', false);

  await waitFor('conflict reported', () => (
    document.body.textContent?.includes('changed outside Clear Writer') ? true : null
  ), 30_000);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const onDisk = await readOutside(projectId, 'Conflict.md');

  window.__HARNESS_RESULT__ = {
    ok: onDisk === external,
    fileKeptExternalChange: onDisk === external,
    onDisk
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
