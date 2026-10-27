import { state } from '/src/state.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

// Nothing is stubbed here. The browser's own File System Access API decides what the new-project
// dialog offers, so this fixture checks what a real browser shows. Safari has no such API, so it
// must get browser storage only, and the local-folder option must be absent.
async function run() {
  const hasDirectoryPicker = 'showDirectoryPicker' in window;
  // Local-folder projects are gated by ?local-folders=true (config/mvp-scope.ts), so the expectation follows the query.
  const localFolderEnabled = new URLSearchParams(location.search).get('local-folders') === 'true';
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await waitFor('new project dialog', () => document.querySelector('#btn-modal-new-opfs') ? true : null);
  const localFolderShown = document.querySelector('#btn-modal-new-dir') !== null;
  const browserStorageShown = document.querySelector('#btn-modal-new-opfs') !== null;
  await click('#btn-modal-cancel');
  await waitFor('new project dialog closed', () => document.querySelector('#btn-modal-new-opfs') === null ? true : null);

  // Browser storage works in every browser, so a project can always be created.
  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Capability Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('browser storage project', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);

  window.__HARNESS_RESULT__ = {
    ok: localFolderShown === (localFolderEnabled && hasDirectoryPicker) && browserStorageShown && state.current.projectRef?.kind === 'opfs',
    localFolderEnabled,
    hasDirectoryPicker,
    localFolderShown,
    browserStorageShown,
    projectKind: state.current.projectRef?.kind ?? null,
    userAgent: navigator.userAgent
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
