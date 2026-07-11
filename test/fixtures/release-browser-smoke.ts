import { state } from '/src/state.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

(window as any).showDirectoryPicker = undefined;

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

async function waitFor<T>(label: string, read: () => T | null | undefined | false, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for release smoke condition: ${label}`);
}

async function click(selector: string): Promise<void> {
  const element = await waitFor(`selector ${selector}`, () => document.querySelector<HTMLElement>(selector));
  element.click();
}

async function run() {
  await resetBrowserStorage();
  await import('/src/main.ts');

  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Release Smoke';
  await click('#btn-modal-new-opfs-confirm');

  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project tree render', () => document.querySelector('#section-list')?.childElementCount ? true : null);

  const exportPdfButton = await waitFor('pdf export button', () => document.getElementById('btn-export-pdf'));
  const exportDocxButton = await waitFor('docx export button', () => document.getElementById('btn-export-docx'));

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind,
    workspaceChip: document.getElementById('workspace-mode-chip')?.textContent?.trim() || '',
    exportButtonsDisabled: exportPdfButton.hasAttribute('disabled') && exportDocxButton.hasAttribute('disabled'),
    exportPdfLabel: exportPdfButton.getAttribute('aria-label') || '',
    exportDocxLabel: exportDocxButton.getAttribute('aria-label') || '',
    exportPdfTitle: exportPdfButton.getAttribute('title') || '',
    exportDocxTitle: exportDocxButton.getAttribute('title') || '',
    manifestPresent: (await fetch('/manifest.webmanifest')).ok
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
