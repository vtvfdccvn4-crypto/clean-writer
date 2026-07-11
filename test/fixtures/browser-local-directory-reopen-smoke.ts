import { state } from '/src/state.ts';

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
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-directory-handles');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete directory handle database.'));
    request.onblocked = () => resolve();
  });

  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

async function waitFor<T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for browser smoke condition: ${label}`);
}

async function click(selector: string): Promise<void> {
  const element = await waitFor(`selector ${selector}`, () => document.querySelector<HTMLElement>(selector));
  element.click();
}

async function run() {
  await resetBrowserStorage();
  const root = await navigator.storage.getDirectory();
  let pickerCalls = 0;
  (window as any).showDirectoryPicker = async () => {
    pickerCalls += 1;
    return root;
  };

  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#btn-new');
  await click('#btn-modal-new-dir');
  await waitFor('directory project ref', () => state.current.projectRef?.kind === 'directory' ? state.current.projectRef : null);
  const initialProjectId = state.current.projectRef?.id;
  if (!initialProjectId) throw new Error('Missing initial directory project id.');

  await click('#btn-new-section');
  const sectionRow = await waitFor('section row', () => document.querySelector<HTMLElement>('.tree-inline-create'));
  const templateSelect = sectionRow.querySelector<HTMLSelectElement>('.section-template-select');
  if (templateSelect) templateSelect.value = 'chapter';
  const sectionInput = sectionRow.querySelector<HTMLInputElement>('.inline-input')!;
  sectionInput.value = 'FolderSaved';
  sectionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor('section created', () => state.current.sections.some(section => section.path === 'sections/FolderSaved.md') ? true : null);

  await click('#btn-close-project');
  await waitFor('project closed', () => state.current.projectRef === null ? true : null);

  await click('#btn-open');
  await click('.recent-item-btn');
  await waitFor('directory reopened from recent', () => state.current.projectRef?.id === initialProjectId ? true : null);
  await waitFor('section restored', () => state.current.sections.some(section => section.path === 'sections/FolderSaved.md') ? true : null);
  state.setActiveFile('sections/FolderSaved.md');
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const templateContent = await waitFor('templated section content', () => editorManager.getEditorView()?.getValue().includes('# Chapter') ? editorManager.getEditorView().getValue() : null);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind,
    projectId: state.current.projectRef?.id,
    initialProjectId,
    sectionPaths: state.current.sections.map(section => section.path),
    pickerCalls,
    templateContent
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
