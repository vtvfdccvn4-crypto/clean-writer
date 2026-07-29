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

const alerts: string[] = [];
window.alert = (message?: unknown) => {
  alerts.push(String(message ?? ''));
};

(window as any).showDirectoryPicker = async () => {
  return navigator.storage.getDirectory();
};

async function run() {
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#btn-task-new-project');
  await click('#btn-modal-new-dir');
  await waitFor('directory project ref', () => state.current.projectRef?.kind === 'directory' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  await projectSession.createSection('sections/draft.md', '# Draft');

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
