import { state } from '/src/state.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

const alerts: string[] = [];
window.alert = (message?: unknown) => {
  alerts.push(String(message ?? ''));
};
// Force OPFS fallback by hiding the native picker API
(window as any).showDirectoryPicker = undefined;

async function run() {
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  const emptyStateButtons = Array.from(document.querySelectorAll<HTMLElement>('.empty-canvas-actions button')).map(button => button.textContent?.trim() || '');
  await click('#empty-canvas-new-project');
  
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Smoke Project';
  await click('#btn-modal-new-opfs-confirm');

  
  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project tree render', () => document.querySelector('#section-list')?.childElementCount ? true : null);

  await click('#btn-new-section');
  const input = await waitFor('inline create input', () => document.querySelector<HTMLInputElement>('.tree-inline-create .inline-input'));
  input.value = 'draft';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await waitFor('section created', () => state.current.sections.some(section => section.path === 'sections/draft.md') ? true : null);
  await waitFor('active file selection', () => state.current.activeFile === 'sections/draft.md' ? true : null);
  await waitFor('codemirror editor', () => document.querySelector('.cm-editor'));
  await waitFor('preview page render', () => document.querySelectorAll('.pagedjs_page').length > 0 ? true : null);

  const previewPane = document.querySelector('.preview-pane');
  window.__HARNESS_RESULT__ = {
    ok: true,
    ready: window.__CLEAR_WRITER_READY__ === true,
    projectKind: state.current.projectRef?.kind ?? null,
    activeFile: state.current.activeFile,
    sectionPaths: state.current.sections.map(section => section.path),
    emptyStateButtons,
    previewVisible: Boolean(previewPane && !previewPane.classList.contains('is-project-closed')),
    editorReady: Boolean(document.querySelector('.cm-editor')),
    pageCount: document.querySelectorAll('.pagedjs_page').length,
    alerts
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error),
    alerts
  };
});
