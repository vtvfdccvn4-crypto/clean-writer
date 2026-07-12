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

function rectSnapshot(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function nonOverlapping(a: ReturnType<typeof rectSnapshot>, b: ReturnType<typeof rectSnapshot>) {
  if (!a || !b) return false;
  return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
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
  nameInput.value = 'Responsive Smoke';
  await click('#btn-modal-new-opfs-confirm');

  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project tree render', () => document.querySelector('#section-list')?.childElementCount ? true : null);

  const workspaceStyle = getComputedStyle(document.querySelector('.workspace')!);
  const panelActions = Array.from(document.querySelectorAll<HTMLElement>('.panel-actions'));
  const projectActions = document.querySelector<HTMLElement>('.project-explorer-actions');
  const modalWidth = await (async () => {
    await click('#btn-open');
    const dialog = await waitFor('open modal dialog', () => document.querySelector<HTMLElement>('.modal-dialog'));
    const width = Math.round(dialog.getBoundingClientRect().width);
    document.getElementById('btn-modal-cancel')?.click();
    return width;
  })();

  const explorer = rectSnapshot('.project-explorer');
  const editor = rectSnapshot('.editor-pane');
  const preview = rectSnapshot('.preview-pane');

  window.__HARNESS_RESULT__ = {
    ok: true,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    gridColumns: workspaceStyle.gridTemplateColumns,
    gridRows: workspaceStyle.gridTemplateRows,
    explorer,
    editor,
    preview,
    editorBelowExplorer: Boolean(explorer && editor && editor.top >= explorer.bottom - 1),
    previewBelowEditor: Boolean(editor && preview && preview.top >= editor.bottom - 1),
    previewRightOfExplorer: Boolean(explorer && preview && preview.left >= explorer.right - 1),
    editorRightOfExplorer: Boolean(explorer && editor && editor.left >= explorer.right - 1),
    editorPreviewDoNotOverlap: nonOverlapping(editor, preview),
    anyWrappedPanelActions: panelActions.some(el => el.getBoundingClientRect().height > 40),
    projectActionsWrapped: Boolean(projectActions && projectActions.getBoundingClientRect().height > 40),
    modalWidth
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
