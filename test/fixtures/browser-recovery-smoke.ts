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

async function writeTextFile(dir: FileSystemDirectoryHandle, name: string, contents: string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
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
  await root.getDirectoryHandle('sections', { create: true });
  await root.getDirectoryHandle('images', { create: true });
  await writeTextFile(root, 'settings.json', '{"broken": ');

  (window as any).showDirectoryPicker = async () => root;

  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#btn-open');
  await click('#btn-modal-open-dir');

  const confirmTitle = await waitFor('settings recovery confirm title', () => {
    const value = document.getElementById('confirm-modal-title')?.textContent?.trim();
    return value || null;
  });
  const confirmMessage = document.querySelector('.modal-body p')?.textContent?.trim() || '';

  await click('#btn-confirm-ok');

  await waitFor('directory project ref', () => state.current.projectRef?.kind === 'directory' ? state.current.projectRef : null);
  const recoveryNotice = await waitFor('recovery success notice', () => {
    const notice = Array.from(document.querySelectorAll<HTMLElement>('#notice-container .notice'))
      .find(node => node.textContent?.includes('Project settings were recovered successfully.'));
    return notice?.textContent?.trim() || null;
  });

  const backupFiles: string[] = [];
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    if (/^settings-\d+\.bak$/.test(name)) backupFiles.push(name);
  }

  const repairedSettingsText = await (await (await root.getFileHandle('settings.json')).getFile()).text();
  const repairedSettings = JSON.parse(repairedSettingsText);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind,
    confirmTitle,
    confirmMessage,
    recoveryNotice,
    backupFiles,
    repairedSettingsLooksValid: Boolean(repairedSettings && typeof repairedSettings === 'object' && Array.isArray(repairedSettings.order))
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
