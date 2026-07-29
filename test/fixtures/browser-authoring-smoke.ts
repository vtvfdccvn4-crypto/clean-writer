import { state } from '/src/state.ts';
import { projectSession } from '/src/services/ProjectSessionStore.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
    clearWriterPerf?: { reset(): void; snapshot(): { buckets: Record<string, { count: number; lastMs: number }> } };
    __CLEAR_WRITER_EDITOR_MANAGER__?: { openDocument(path: string): Promise<void> };
  }
}

async function resetStorage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

function renderCount(): number {
  return window.clearWriterPerf?.snapshot().buckets['previewRender:isolated-full-document']?.count ?? 0;
}

async function run(): Promise<void> {
  await resetStorage();
  await import('/src/main.ts');
  await waitFor('app ready', () => window.__CLEAR_WRITER_READY__ || window.__CLEAR_WRITER_BOOT_ERROR__);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const name = await waitFor('project name', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  name.value = 'Authoring Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('project opened', () => state.current.projectRef);
  await waitFor('project explorer visible', () => {
    const view = document.getElementById('task-explorer-view');
    return view && !view.classList.contains('hidden') ? true : null;
  });

  if (!await projectSession.createSection('AuthoringSection', '# Authoring section\n\nPhase 1 authoring smoke content.')) {
    throw new Error('Failed to create the authoring smoke section.');
  }
  await waitFor('section created', () => state.current.activeFile === 'sections/AuthoringSection.md');
  await waitFor('current explorer item', () => document.querySelector('.task-explorer-item--file'));

  window.clearWriterPerf?.reset();
  state.setFullDocMode();
  await waitFor('full document preview', () => {
    const pages = document.querySelectorAll('.pagedjs_page').length;
    return pages > 0 && renderCount() > 0 ? true : null;
  }, 60_000);
  const initialRenderCount = renderCount();
  const initialPageCount = document.querySelectorAll('.pagedjs_page').length;

  state.setPageSetup({
    ...state.current.pageSetup,
    marginTop: state.current.pageSetup.marginTop + 1
  });
  await waitFor('isolated page-setup rerender', () => renderCount() > initialRenderCount, 60_000);
  const pageSetupRenderCount = renderCount();

  const sourceTarget = document.querySelector<HTMLElement>('[data-ref], [data-split-from]');
  const sourceNavigationAvailable = Boolean(sourceTarget);
  sourceTarget?.click();
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

  await click('#btn-task-close-project');
  await waitFor('project closed', () => state.current.projectRef === null);
  await waitFor('preview cleanup after close', () => document.querySelectorAll('iframe[src*="pdf-preview"]').length === 0);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: 'opfs',
    initialPageCount,
    initialRenderCount,
    pageSetupRenderCount,
    pageSetupUsedIsolatedPipeline: pageSetupRenderCount > initialRenderCount,
    sourceNavigationAvailable,
    previewCleanAfterClose: document.querySelectorAll('iframe[src*="pdf-preview"]').length === 0
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
