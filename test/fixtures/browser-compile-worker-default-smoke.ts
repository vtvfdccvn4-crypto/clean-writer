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

// Count the compile jobs posted to the compile worker. Nothing is stubbed: the app decides where each compile
// runs, and this records it. The spy is installed before the app loads.
let compileJobs = 0;
const NativeWorker = window.Worker;
const nativePost = NativeWorker.prototype.postMessage;
NativeWorker.prototype.postMessage = function postMessage(this: Worker, message: unknown, ...rest: unknown[]) {
  if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'compile') compileJobs += 1;
  return (nativePost as (...args: unknown[]) => void).call(this, message, ...rest);
} as typeof NativeWorker.prototype.postMessage;

const sectionText = (characters: number) => {
  const paragraph = '## Part\n\nA paragraph of ordinary prose that fills a line of the page, with **emphasis** and a [link](https://example.com).\n\n';
  let text = '';
  while (text.length < characters) text += paragraph;
  return text.slice(0, characters);
};

type EditorView = { setValue(text: string, notify: boolean): void; getValue(): string };
const currentView = (): EditorView => (window as any).__CLEAR_WRITER_EDITOR_MANAGER__.getEditorView();

const compileCount = () => window.clearWriterPerf?.snapshot().buckets['previewCompile:single-document-edit']?.count ?? 0;

// A large document opens in the live preview, which records each live compile. A small one is paginated, which
// records none, so it gets a fixed settle time: the preview pause is 750 ms at most, and the compile is small.
// Waits for the edit's compile to finish, up to a limit, and reports whether the compile metric moved. The job
// counts decide the result, so a compile that never ran fails the fixture rather than passing silently.
async function editAndWait(view: { setValue(text: string, userEvent: boolean): void }, text: string): Promise<boolean> {
  const before = compileCount();
  view.setValue(text, false);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && compileCount() <= before) await new Promise(resolve => setTimeout(resolve, 100));
  await new Promise(resolve => setTimeout(resolve, 500));
  return compileCount() > before;
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
  nameInput.value = 'Worker Default Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('browser storage project', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  await projectSession.createSection('sections/Small.md', sectionText(1_000));
  await waitFor('small section active', () => state.current.activeFile === 'sections/Small.md' ? true : null);
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);
  await waitFor('small text in the editor', () => currentView().getValue().length >= 1_000 ? true : null, 60_000);
  await editAndWait(currentView(), sectionText(1_000) + '\nSmall edit.');
  const jobsAfterSmall = compileJobs;

  await projectSession.createSection('sections/Large.md', sectionText(550_000));
  await waitFor('large section active', () => state.current.activeFile === 'sections/Large.md' ? true : null);
  // The editor view is replaced when the document changes, so look it up again after the large text is in.
  await waitFor('large text in the editor', () => currentView().getValue().length >= 550_000 ? true : null, 60_000);
  const largeCompileObserved = await editAndWait(currentView(), sectionText(550_000) + '\nLarge edit.');
  const livePreviewShown = document.getElementById('paged-stage')?.classList.contains('is-live-preview') === true;
  const jobsAt550k = compileJobs;

  await editAndWait(currentView(), sectionText(750_000) + '\nAbove the range.');
  const jobsAt750k = compileJobs;

  window.__HARNESS_RESULT__ = {
    ok: true,
    userAgent: navigator.userAgent,
    jobsAfterSmall,
    jobsAt550k,
    jobsAt750k,
    largeCompileObserved,
    livePreviewShown,
    compileCountAtEnd: compileCount()
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
