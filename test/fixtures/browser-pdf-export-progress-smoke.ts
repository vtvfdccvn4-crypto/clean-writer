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

  const announcer = () => document.getElementById('pdf-job-announcer')?.textContent ?? '';
  const stripVisible = () => document.getElementById('pdf-job-status') !== null && !(document.getElementById('pdf-job-status') as HTMLElement).hidden;

  // Headless browsers block pop-ups. A same-origin frame stands in for the print
  // window, so the real export pipeline runs and reports its progress.
  const printFrame = document.createElement('iframe');
  printFrame.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px;';
  document.body.appendChild(printFrame);
  window.open = () => printFrame.contentWindow;

  await click('#btn-pdf-preview');
  await waitFor('export strip visible', () => stripVisible() ? true : null, 10_000);
  await waitFor('start announcement', () => announcer() === 'PDF preview started.' ? true : null, 10_000);
  const startedLabel = document.getElementById('pdf-job-label')?.textContent ?? '';

  // Cancel while the job still runs; a fast job may finish first, which is also a valid outcome.
  if (stripVisible()) {
    const cancel = document.getElementById('btn-pdf-job-cancel') as HTMLButtonElement | null;
    if (cancel && !cancel.disabled) cancel.click();
  }
  await waitFor('final announcement', () => {
    const text = announcer();
    return text === 'PDF preview cancelled.' || text.startsWith('PDF preview ready') || text.startsWith('PDF preview failed') ? true : null;
  }, 60_000);
  const hiddenAfter = !stripVisible();
  const buttonRestored = (document.getElementById('btn-pdf-preview') as HTMLButtonElement | null)?.disabled === false;

  window.__HARNESS_RESULT__ = {
    ok: startedLabel.length > 0 && hiddenAfter && buttonRestored && !announcer().startsWith('PDF preview failed'),
    startedLabel,
    hiddenAfterCancel: hiddenAfter,
    buttonRestored,
    finalAnnouncement: announcer()
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
