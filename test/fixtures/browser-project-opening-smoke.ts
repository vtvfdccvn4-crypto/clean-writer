import { state } from '/src/state.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global { interface Window { __HARNESS_RESULT__?: Record<string, unknown>; __CLEAR_WRITER_READY__?: boolean; } }

async function resetStorage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) await root.removeEntry(name, { recursive: true });
}

async function run(): Promise<void> {
  await resetStorage();
  (window as any).showDirectoryPicker = undefined;
  await import('/src/main.ts');
  await waitFor('app ready', () => window.__CLEAR_WRITER_READY__ === true ? true : null);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const name = await waitFor('project name', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  name.value = 'Opening Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('project opened', () => state.current.projectRef ? true : null);
  await waitFor('workspace visible', () => !(document.querySelector<HTMLElement>('.workspace-shell')?.hidden ?? true) ? true : null);
  await new Promise(resolve => setTimeout(resolve, 250));

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectRemainedOpen: Boolean(state.current.projectRef),
    workspaceRemainedVisible: !(document.querySelector<HTMLElement>('.workspace-shell')?.hidden ?? true),
    welcomeRemainedHidden: document.querySelector<HTMLElement>('#welcome-screen-root')?.hidden === true
  };
}

run().catch(error => { window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) }; });
