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

function explorerItem(label: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item'))
    .find(item => item.querySelector('.task-explorer-item-label')?.textContent === label) ?? null;
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

  await projectSession.createFolder('sections/Archive');
  await waitFor('Archive folder', () => state.current.sections.some(section => section.path === 'sections/Archive' && section.isDir) ? true : null);
  await projectSession.createSection('sections/One.md', '# Chapter One\n\n');
  await waitFor('One section active', () => state.current.activeFile === 'sections/One.md' ? true : null);
  await projectSession.createSection('sections/Two.md', '# Two\n\n');
  await waitFor('Two section active', () => state.current.activeFile === 'sections/Two.md' ? true : null);

  (await waitFor('One explorer item', () => explorerItem('One.md'))).click();
  await waitFor('One section selected', () => state.current.activeFile === 'sections/One.md' ? true : null);
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const oneEditor = await waitFor('One editor', () => editorManager?.getEditorView?.()?.getValue?.().includes('# Chapter') ? editorManager.getEditorView() : null);
  oneEditor.setValue('Saved while switching sections');
  await waitFor('One marked unsaved', () => oneEditor.hasUnsavedChanges?.() ? true : null);
  await waitFor('One saved before switch', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);
  const twoItem = await waitFor('Two explorer item', () => explorerItem('Two.md'));
  twoItem.click();
  await waitFor('Two selected after save', () => state.current.activeFile === 'sections/Two.md' ? true : null);
  (await waitFor('One explorer item after switch', () => explorerItem('One.md'))).click();
  const savedOnSwitch = await waitFor('One content persisted after switch', () => (
    state.current.activeFile === 'sections/One.md' && editorManager.getEditorView()?.getValue() === 'Saved while switching sections'
  ) ? true : null);

  const pageBreakButton = await waitFor('One page break action', () => explorerItem('One.md')?.querySelector<HTMLButtonElement>('[aria-label="Add page break"]'));
  pageBreakButton.click();
  const pageBreakEnabled = await waitFor('page break enabled', () => state.current.sections.find(section => section.path === 'sections/One.md')?.pageBreak === true ? true : null);

  const sourceRow = explorerItem('One.md');
  const folderRow = explorerItem('Archive');
  if (!sourceRow || !folderRow) throw new Error('Could not find sidebar rows for drag-and-drop.');
  const transfer = new DataTransfer();
  sourceRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  const folderRect = folderRow.getBoundingClientRect();
  folderRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: folderRect.top + folderRect.height / 2, dataTransfer: transfer }));
  folderRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: folderRect.top + folderRect.height / 2, dataTransfer: transfer }));
  const movedIntoFolder = await waitFor('section moved into folder', () => state.current.sections.some(section => section.path === 'sections/Archive/One.md') ? true : null);

  let archiveItem = await waitFor('Archive explorer item', () => explorerItem('Archive'));
  archiveItem.click();
  const folderCollapsed = await waitFor('folder collapsed', () => (
    explorerItem('Archive')?.parentElement?.querySelector('.task-explorer-children') === null
  ) ? true : null);
  archiveItem = await waitFor('Archive explorer item after collapse', () => explorerItem('Archive'));
  archiveItem.click();
  const folderExpanded = await waitFor('folder expanded', () => (
    explorerItem('Archive')?.parentElement?.querySelector('.task-explorer-children') !== null
  ) ? true : null);

  window.__HARNESS_RESULT__ = { ok: true, savedOnSwitch, pageBreakEnabled, movedIntoFolder, folderCollapsed, folderExpanded };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
