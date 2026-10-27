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

  await projectSession.createSection('sections/Freshness.md', '# Freshness');
  await waitFor('section active', () => state.current.activeFile === 'sections/Freshness.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);
  await waitFor('initial preview', () => document.querySelectorAll('.pagedjs_page').length > 0 ? true : null, 60_000);

  // Live preview follows the editor directly; the paginated preview waits for a
  // full layout and is not the path this check measures.
  await click('#btn-toggle-print-preview');
  await waitFor('live preview', () => document.getElementById('paged-stage')?.classList.contains('is-live-preview') === true ? true : null);

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  const marker = 'FRESHNESS_MARKER_' + Date.now();
  const previewContains = () => document.getElementById('paged-stage')?.textContent?.includes(marker) === true;

  const typedAt = performance.now();
  view.setValue('# Freshness\n\n' + marker, false);
  await waitFor('preview shows the typed text', () => previewContains() ? true : null, 5_000);
  const previewLatencyMs = Math.round(performance.now() - typedAt);

  await waitFor('saved status after typing', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null, 10_000);

  window.__HARNESS_RESULT__ = {
    ok: previewLatencyMs < 700,
    previewLatencyMs,
    savedStatusReached: true
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
