import { state } from '/src/state.ts';
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
  nameInput.value = 'Persistence Smoke';
  await click('#btn-modal-new-opfs-confirm');

  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#section-list .tree-root-drop-zone') ? true : null);
  const projectId = state.current.projectRef?.id;
  if (!projectId) throw new Error('Missing OPFS project id.');

  await click('#btn-new-section');
  const sectionInput = await waitFor('section input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  sectionInput.value = 'SavedDraftState';
  sectionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor('section active', () => state.current.activeFile === 'sections/SavedDraftState.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  const savedText = 'Saved durable text';
  view.setValue(savedText, false);

  await waitFor('saved status after edit', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);

  localStorage.setItem(`cw-draft:${projectId}:sections/SavedDraftState.md`, 'stale raw draft should not override saved content');

  await click('#btn-close-project');
  await waitFor('project closed', () => state.current.projectRef === null ? true : null);

  await click('#btn-open');
  await click('.recent-item-btn');
  await waitFor('project reopened', () => state.current.projectRef?.id === projectId ? true : null);
  await waitFor('tree restored', () => state.current.sections.some(section => section.path === 'sections/SavedDraftState.md') ? true : null);

  state.setActiveFile('sections/SavedDraftState.md');
  await waitFor('section active after reopen', () => state.current.activeFile === 'sections/SavedDraftState.md' ? true : null);
  await waitFor('editor rendered after reopen', () => document.querySelector('.cm-content') ? true : null);

  const recoveryPromptShown = (document.getElementById('project-flow-modal')?.childElementCount ?? 0) > 0;
  const reopenedView = editorManager.getEditorView();
  const reopenedText = reopenedView.getValue();

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind,
    projectId,
    recoveryPromptShown,
    reopenedText,
    savedMarkerPresent: typeof localStorage.getItem(`cw-draft-saved:${projectId}:sections/SavedDraftState.md`) === 'string'
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
