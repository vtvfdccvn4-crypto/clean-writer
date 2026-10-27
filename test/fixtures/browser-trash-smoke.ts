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

// Through the real UI: delete a section, find it in the trash, restore it, delete it for good, and empty the trash.
const hasSection = (path: string) => state.current.sections.some(section => section.path === path);
const explorerItem = (name: string) => Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item'))
  .find(item => item.getAttribute('aria-label') === `Section ${name}`) ?? null;
const dialogRow = (name: string) => Array.from(document.querySelectorAll<HTMLElement>('.trash-item'))
  .find(row => row.querySelector('.trash-item-name')?.textContent === name) ?? null;
const dialogStatus = () => document.getElementById('trash-dialog-status')?.textContent ?? '';

async function deleteFromExplorer(name: string): Promise<void> {
  const item = await waitFor(`explorer item ${name}`, () => explorerItem(name));
  item.querySelector<HTMLElement>('.task-explorer-item-action--danger')?.click();
  await click('#btn-confirm-ok');
}

async function run() {
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Trash Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('browser storage project', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  await projectSession.createSection('sections/Keep.md', '# Keep');
  await projectSession.createSection('sections/Gone.md', '# Gone');
  await waitFor('both sections listed', () => explorerItem('Keep.md') && explorerItem('Gone.md') ? true : null);

  // Delete from the explorer: the section leaves the list and the project.
  await deleteFromExplorer('Gone.md');
  await waitFor('Gone.md deleted', () => !hasSection('sections/Gone.md') && !explorerItem('Gone.md') ? true : null);

  // The trash lists it with where it came from.
  await click('#btn-task-trash');
  const row = await waitFor('Gone.md in the trash', () => dialogRow('Gone.md'));
  const listedWithOrigin = row.querySelector('.trash-item-detail')?.textContent?.includes('sections/Gone.md') === true;

  // Restore puts it back, announced in the status line.
  row.querySelector<HTMLElement>('[data-action="restore"]')?.click();
  await waitFor('restore announced', () => dialogStatus().startsWith('Restored Gone.md') ? true : null);
  const restoreAnnounced = dialogStatus();
  await waitFor('Gone.md back in the project', () => hasSection('sections/Gone.md') && explorerItem('Gone.md') ? true : null);
  const trashEmptyAfterRestore = document.querySelector('.trash-item') === null;
  await click('#trash-close');
  await waitFor('dialog closed', () => document.getElementById('trash-dialog-title') === null ? true : null);
  // Open the restored section: it has its content again.
  (await waitFor('restored explorer item', () => explorerItem('Gone.md'))).click();
  await waitFor('restored section open', () => state.current.activeFile === 'sections/Gone.md' ? true : null);
  const restoredContent = await waitFor('restored text in the editor', () => {
    const text = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__?.getEditorView()?.getValue?.();
    return typeof text === 'string' && text.length > 0 ? text : null;
  });

  // Wait for the activation to settle, so the next delete does not land in the middle of opening the section.
  await (window as any).__CLEAR_WRITER_EDITOR_MANAGER__.whenDocumentReady('sections/Gone.md');

  // Delete it again and delete it for good from the trash, after a confirmation.
  await deleteFromExplorer('Gone.md');
  await waitFor('Gone.md deleted again', () => !hasSection('sections/Gone.md') ? true : null);
  await click('#btn-task-trash');
  const secondRow = await waitFor('Gone.md in the trash again', () => dialogRow('Gone.md'));
  secondRow.querySelector<HTMLElement>('[data-action="purge"]')?.click();
  await click('#btn-confirm-ok');
  await waitFor('purge announced', () => dialogStatus().startsWith('Deleted Gone.md for good') ? true : null);
  const goneAfterPurge = hasSection('sections/Gone.md') || (await projectSession.listTrash()).length > 0;
  await click('#trash-close');
  await waitFor('dialog closed again', () => document.getElementById('trash-dialog-title') === null ? true : null);

  // Empty the trash: two deleted sections go at once.
  await deleteFromExplorer('Keep.md');
  await waitFor('Keep.md deleted', () => !hasSection('sections/Keep.md') ? true : null);
  await projectSession.createSection('sections/Extra.md', '# Extra');
  await waitFor('Extra.md listed', () => explorerItem('Extra.md') ? true : null);
  await deleteFromExplorer('Extra.md');
  await waitFor('Extra.md deleted', () => !hasSection('sections/Extra.md') ? true : null);
  await click('#btn-task-trash');
  await waitFor('two items in the trash', () => document.querySelectorAll('.trash-item').length === 2 ? true : null);
  await click('#trash-empty');
  await click('#btn-confirm-ok');
  await waitFor('trash emptied', () => dialogStatus() === 'The trash is empty.' && document.querySelector('.trash-item') === null ? true : null);
  const trashItemsAfterEmpty = (await projectSession.listTrash()).length;

  window.__HARNESS_RESULT__ = {
    ok: listedWithOrigin && restoredContent === '# Gone' && trashEmptyAfterRestore && !goneAfterPurge && trashItemsAfterEmpty === 0,
    listedWithOrigin,
    restoreAnnounced,
    restoredContent,
    trashEmptyAfterRestore,
    goneAfterPurge,
    trashItemsAfterEmpty
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
