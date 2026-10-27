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

// The pages of a document become visible a moment before its render finishes. A reader can scroll in that
// moment, and the view must stay where the reader put it, instead of jumping back to the top.
const DOCUMENT = Array.from({ length: 40 }, (_, index) => [
  `## Heading ${index + 1}`,
  '',
  'A paragraph of ordinary prose that fills a line of the page, with **emphasis** and a [link](https://example.com). '.repeat(8),
  ''
].join('\n')).join('\n');

const scroller = () => document.getElementById('paged-stage')?.parentElement as HTMLElement | null;
const pageCount = () => document.querySelectorAll('.pagedjs_page').length;

async function run() {
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Scroll Preserved Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('browser storage project', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  // Scroll in the same turn as the first pages appearing, which is before the render finishes.
  let scrolledTo: number | null = null;
  let pagesWhenScrolled = 0;
  const observer = new MutationObserver(() => {
    const area = scroller();
    if (scrolledTo !== null || !area || pageCount() < 3) return;
    area.scrollTo({ top: 300, behavior: 'auto' });
    scrolledTo = area.scrollTop;
    pagesWhenScrolled = pageCount();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  await projectSession.createSection('sections/Scroll.md', DOCUMENT);
  await waitFor('section active', () => state.current.activeFile === 'sections/Scroll.md' ? true : null);
  await waitFor('reader scrolled', () => scrolledTo !== null ? true : null, 120_000);
  observer.disconnect();

  // Wait until the preview has been still for three seconds, so the render has certainly finished.
  const area = scroller()!;
  const position = () => `${pageCount()}:${area.scrollTop}`;
  let last = position();
  let quietSince = Date.now();
  const deadline = Date.now() + 60_000;
  while (Date.now() - quietSince < 3_000) {
    if (Date.now() > deadline) throw new Error('The preview did not finish rendering.');
    await new Promise(resolve => setTimeout(resolve, 100));
    const now = position();
    if (now !== last) {
      last = now;
      quietSince = Date.now();
    }
  }

  window.__HARNESS_RESULT__ = {
    ok: (scrolledTo ?? 0) > 0 && Math.abs(area.scrollTop - (scrolledTo ?? 0)) <= 2,
    pagesWhenScrolled,
    scrolledTo,
    scrollAtEnd: area.scrollTop
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
