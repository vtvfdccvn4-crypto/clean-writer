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

async function run() {
  await resetBrowserStorage();
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#btn-save');
  await click('#btn-new-section');
  await click('#btn-new-folder');
  await click('#btn-add-image');

  await waitFor('rendered notices', () => document.querySelectorAll('#notice-container .notice').length === 2 ? true : null);

  const notices = Array.from(document.querySelectorAll<HTMLElement>('#notice-container .notice')).map(notice => ({
    text: notice.textContent?.trim() || '',
    type: notice.dataset.noticeType || '',
    role: notice.getAttribute('role') || ''
  }));

  window.__HARNESS_RESULT__ = {
    ok: true,
    noticeCount: notices.length,
    uniqueNoticeTexts: Array.from(new Set(notices.map(notice => notice.text))),
    notices,
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
