import { state } from '/src/state.ts';

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

(window as any).showDirectoryPicker = async () => {
  return navigator.storage.getDirectory();
};

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
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#btn-new');
  await click('#btn-modal-new-dir');
  await waitFor('directory project ref', () => state.current.projectRef?.kind === 'directory' ? state.current.projectRef : null);
  await waitFor('project tree render', () => document.querySelector('#section-list')?.childElementCount ? true : null);

  await click('#btn-new-section');
  const input = await waitFor('inline create input', () => document.querySelector<HTMLInputElement>('.tree-inline-create .inline-input'));
  input.value = 'draft';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await waitFor('section created', () => state.current.sections.some(section => section.path === 'sections/draft.md') ? true : null);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind,
    activeFile: state.current.activeFile,
    sectionPaths: state.current.sections.map(section => section.path),
    alerts
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    alerts
  };
});
