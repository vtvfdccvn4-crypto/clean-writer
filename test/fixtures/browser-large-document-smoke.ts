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

// Above the 400,000-character threshold in PreviewPolicy.ts.
const LARGE_SECTION = Array.from({ length: 1_400 }, (_, index) => [
  `## Part ${index + 1}`,
  '',
  'A paragraph of ordinary prose that fills a line of the page, with **emphasis** and a [link](https://example.com). '.repeat(4),
  ''
].join('\n')).join('\n');

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

const freshnessText = () => document.getElementById('preview-freshness-text')?.textContent ?? '';
const freshnessVisible = () => {
  const strip = document.getElementById('preview-freshness');
  return strip !== null && !strip.hidden;
};
const printedPages = () => document.querySelectorAll('.pagedjs_page').length;
const liveStatusText = () => document.getElementById('preview-live-status-text')?.textContent ?? '';
const liveStatusVisible = () => {
  const strip = document.getElementById('preview-live-status');
  return strip !== null && !strip.hidden;
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  nameInput.value = 'Large Document Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  await projectSession.createSection('sections/Large.md', LARGE_SECTION);
  await waitFor('section active', () => state.current.activeFile === 'sections/Large.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);

  // Opening a large document shows the live preview and does not paginate it.
  await waitFor('live preview for a large document', () => (
    document.getElementById('paged-stage')?.classList.contains('is-live-preview') === true
  ) ? true : null, 60_000);
  await waitFor('freshness: print preview not built', () => (
    freshnessVisible() && freshnessText().includes('not built') ? true : null
  ), 60_000);
  const pagesBeforeBuild = printedPages();
  if (pagesBeforeBuild !== 0) throw new Error(`A large document was paginated on open: ${pagesBeforeBuild} pages.`);

  // One edit in live mode: the live preview recompiles the section on the page's main thread.
  const liveBucket = () => window.clearWriterPerf?.snapshot().buckets['previewCompile:single-document-edit'];
  const liveCountBefore = liveBucket()?.count ?? 0;
  const liveEditView = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__.getEditorView();
  liveEditView.setValue(LARGE_SECTION + '\n\nLIVE_EDIT_' + Date.now(), false);
  await waitFor('live compile of the edit', () => (liveBucket()?.count ?? 0) > liveCountBefore ? true : null, 60_000);
  const liveEditCompileMs = Math.round(liveBucket()?.lastMs ?? 0);

  // Typing faster than the pause: the live preview is behind, so its status says so. Once typing
  // stops and the newest text renders, the status clears. The print notice is unaffected.
  let sawPausedWhileTyping = false;
  for (let index = 0; index < 20; index += 1) {
    liveEditView.setValue(LARGE_SECTION + '\n\nTYPING_' + index, false);
    await wait(100);
    if (liveStatusVisible() && liveStatusText().includes('paused while typing')) sawPausedWhileTyping = true;
  }
  await waitFor('live status cleared after typing', () => !liveStatusVisible() ? true : null, 60_000);
  const printNoticeKeptDuringLiveEdits = freshnessVisible() && freshnessText().includes('not built');

  // The user builds the print preview on request.
  const buildStarted = performance.now();
  await click('#preview-freshness-action');
  await waitFor('printed pages after build', () => printedPages() > 0 ? true : null, 120_000);
  await waitFor('freshness cleared after build', () => !freshnessVisible() ? true : null, 60_000);
  const buildMs = Math.round(performance.now() - buildStarted);
  const pagesAfterBuild = printedPages();

  // An edit does not paginate again. It marks the print preview out of date.
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  const marker = 'LARGE_DOCUMENT_MARKER_' + Date.now();
  view.setValue(LARGE_SECTION + '\n\n' + marker, false);
  await waitFor('freshness: print preview out of date', () => (
    freshnessVisible() && freshnessText().includes('out of date') ? true : null
  ), 30_000);
  if (printedPages() !== pagesAfterBuild) throw new Error('An edit to a large document re-paginated it.');

  // Updating re-renders the print preview with the edited text.
  await click('#preview-freshness-action');
  await waitFor('freshness cleared after update', () => !freshnessVisible() ? true : null, 120_000);
  const updatedText = document.getElementById('paged-stage')?.textContent ?? '';

  // The merged preview of a large project is live too, and its print preview is built on request.
  await click('#btn-full-doc');
  await waitFor('freshness: full document print preview not built', () => (
    freshnessVisible() && freshnessText().includes('not built') ? true : null
  ), 60_000);
  const fullPagesBeforeBuild = printedPages();
  if (fullPagesBeforeBuild !== 0) throw new Error(`A large merged preview was paginated on open: ${fullPagesBeforeBuild} pages.`);
  await click('#preview-freshness-action');
  await waitFor('full document printed pages after build', () => printedPages() > 0 ? true : null, 120_000);
  await waitFor('freshness cleared after full document build', () => !freshnessVisible() ? true : null, 60_000);
  const fullPagesAfterBuild = printedPages();

  window.__HARNESS_RESULT__ = {
    ok: updatedText.includes(marker) && pagesAfterBuild > 0 && fullPagesAfterBuild > 0
      && sawPausedWhileTyping && printNoticeKeptDuringLiveEdits,
    pagesBeforeBuild,
    pagesAfterBuild,
    liveEditCompileMs,
    fullPagesBeforeBuild,
    fullPagesAfterBuild,
    buildMs,
    updateShowsEdit: updatedText.includes(marker),
    sawPausedWhileTyping,
    printNoticeKeptDuringLiveEdits
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
