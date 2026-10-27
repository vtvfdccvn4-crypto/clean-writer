import { state } from '/src/state.ts';
import { projectSession } from '/src/services/ProjectSessionStore.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';
import { createBrowserDraftStore } from '/src/editor/DraftStore.ts';

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
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);
  const projectId = state.current.projectRef?.id;
  if (!projectId) throw new Error('Missing OPFS project id.');

  await projectSession.createSection('sections/SavedDraftState.md', '# Saved Draft State');
  await waitFor('section active', () => state.current.activeFile === 'sections/SavedDraftState.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  const savedText = 'Saved durable text';
  view.setValue(savedText, false);

  await waitFor('saved status after edit', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);

  // The save above discards the section's recovery draft. Read it before the
  // reopen, so the check does not depend on what happens during reopen.
  const draftAfterSave = await createBrowserDraftStore().read({ projectId, path: 'sections/SavedDraftState.md' });
  localStorage.setItem(`cw-draft:${projectId}:sections/SavedDraftState.md`, 'stale raw draft should not override saved content');

  await click('#btn-task-close-project');
  await waitFor('project closed', () => state.current.projectRef === null ? true : null);

  await click('#btn-task-open-project');
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
    savedDraftAbsent: draftAfterSave === null
  };
}

/** What the app was showing when a step failed, so a timeout names its cause. */
function describeState(): Record<string, unknown> {
  return {
    lifecycle: projectSession.getStatus(),
    projectRef: state.current.projectRef?.id ?? null,
    activeFile: state.current.activeFile,
    isFullDocMode: state.current.isFullDocMode,
    sectionCount: state.current.sections.length,
    welcomeVisible: document.getElementById('welcome-screen-root')?.hidden === false,
    workspaceVisible: document.querySelector<HTMLElement>('.workspace-shell')?.hidden === false,
    editorContainerChildren: document.getElementById('editor-container')?.childElementCount ?? null,
    editorContainerHtml: document.getElementById('editor-container')?.innerHTML.slice(0, 200) ?? null,
    editorViewPresent: Boolean((window as any).__CLEAR_WRITER_EDITOR_MANAGER__?.getEditorView()),
    editorStatus: document.getElementById('editor-status')?.textContent ?? null,
    notice: document.querySelector('.notice, [role="alert"]')?.textContent?.slice(0, 160) ?? null,
    draftKeys: Object.keys(localStorage).filter(key => key.startsWith('cw-draft')).map(key => `${key.split(':')[0]}=${localStorage.getItem(key)?.slice(0, 60)}`),
    openDialog: document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 160) ?? null
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error),
    state: describeState()
  };
});
