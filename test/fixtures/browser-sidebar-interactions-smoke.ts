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

async function createItem(button: string, name: string, template?: string): Promise<void> {
  await click(button);
  const row = await waitFor(`inline input for ${name}`, () => document.querySelector<HTMLElement>('.tree-inline-create'));
  const templateSelect = row.querySelector<HTMLSelectElement>('.section-template-select');
  if (templateSelect && template) templateSelect.value = template;
  const input = row.querySelector<HTMLInputElement>('.inline-input');
  if (!input) throw new Error(`Missing inline input for ${name}.`);
  input.value = name;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

async function run(): Promise<void> {
  await resetBrowserStorage();
  (window as any).showDirectoryPicker = undefined;
  await import('/src/main.ts');
  await waitFor('app ready', () => window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('project name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Sidebar Interactions';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('OPFS project', () => state.current.projectRef?.kind === 'opfs' ? true : null);

  await createItem('#btn-new-folder', 'Archive');
  await waitFor('Archive folder', () => state.current.sections.some(section => section.path === 'sections/Archive' && section.isDir) ? true : null);
  await createItem('#btn-new-section', 'One', 'chapter');
  await waitFor('One section active', () => state.current.activeFile === 'sections/One.md' ? true : null);
  await createItem('#btn-new-section', 'Two');
  await waitFor('Two section active', () => state.current.activeFile === 'sections/Two.md' ? true : null);

  await click('.tree-row[data-path="sections/One.md"]');
  await waitFor('One section selected', () => state.current.activeFile === 'sections/One.md' ? true : null);
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const oneEditor = await waitFor('One editor', () => editorManager?.getEditorView?.()?.getValue?.().includes('# Chapter') ? editorManager.getEditorView() : null);
  oneEditor.setValue('Saved while switching sections');
  await waitFor('One marked unsaved', () => oneEditor.hasUnsavedChanges?.() ? true : null);
  await waitFor('One saved before switch', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);
  await click('.tree-row[data-path="sections/Two.md"]');
  await waitFor('Two selected after save', () => state.current.activeFile === 'sections/Two.md' ? true : null);
  await click('.tree-row[data-path="sections/One.md"]');
  const savedOnSwitch = await waitFor('One content persisted after switch', () => (
    state.current.activeFile === 'sections/One.md' && editorManager.getEditorView()?.getValue() === 'Saved while switching sections'
  ) ? true : null);

  await click('.tree-row[data-path="sections/One.md"] .btn-page-break-toggle');
  const pageBreakEnabled = await waitFor('page break enabled', () => state.current.sections.find(section => section.path === 'sections/One.md')?.pageBreak === true ? true : null);

  const sourceRow = document.querySelector<HTMLElement>('.tree-row[data-path="sections/One.md"]');
  const folderRow = document.querySelector<HTMLElement>('.tree-row[data-path="sections/Archive"]');
  if (!sourceRow || !folderRow) throw new Error('Could not find sidebar rows for drag-and-drop.');
  const transfer = new DataTransfer();
  sourceRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  folderRow.classList.add('drag-over-center');
  folderRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  const movedIntoFolder = await waitFor('section moved into folder', () => state.current.sections.some(section => section.path === 'sections/Archive/One.md') ? true : null);

  if (!document.querySelector<HTMLButtonElement>('.tree-row[data-path="sections/Archive"] .btn-toggle-folder')) {
    throw new Error('Could not find Archive folder toggle.');
  }
  await click('.tree-row[data-path="sections/Archive"] .btn-toggle-folder');
  const folderCollapsed = await waitFor('folder collapsed', () => (
    document.querySelector<HTMLButtonElement>('.tree-row[data-path="sections/Archive"] .btn-toggle-folder')?.getAttribute('aria-expanded') === 'false'
  ) ? true : null);
  await click('.tree-row[data-path="sections/Archive"] .btn-toggle-folder');
  const folderExpanded = await waitFor('folder expanded', () => (
    document.querySelector<HTMLButtonElement>('.tree-row[data-path="sections/Archive"] .btn-toggle-folder')?.getAttribute('aria-expanded') === 'true'
  ) ? true : null);

  window.__HARNESS_RESULT__ = { ok: true, savedOnSwitch, pageBreakEnabled, movedIntoFolder, folderCollapsed, folderExpanded };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
