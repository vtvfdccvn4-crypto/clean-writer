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

// Enough headings and prose to span several printed pages.
const NAVIGATION_DOCUMENT = Array.from({ length: 40 }, (_, index) => [
  `## Heading ${index + 1}`,
  '',
  'A paragraph of ordinary prose that fills a line of the page, with **emphasis** and a [link](https://example.com). '.repeat(8),
  ''
].join('\n')).join('\n');

const status = () => document.getElementById('preview-navigation-status')?.textContent ?? '';
const scroller = () => document.getElementById('paged-stage')?.parentElement as HTMLElement | null;

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
  nameInput.value = 'Preview Navigation Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project explorer ready', () => document.querySelector('#task-explorer-view:not(.hidden)') ? true : null);

  await projectSession.createSection('sections/Navigation.md', NAVIGATION_DOCUMENT);
  await waitFor('section active', () => state.current.activeFile === 'sections/Navigation.md' ? true : null);
  await waitFor('printed pages', () => document.querySelectorAll('.pagedjs_page').length > 2 ? true : null, 120_000);
  await waitFor('page jump visible', () => {
    const form = document.getElementById('preview-page-jump') as HTMLFormElement | null;
    return form && !form.hidden ? true : null;
  }, 30_000);
  // The document's render ends by restoring its saved view position, which can move the scroll
  // after the pages appear. The status reads "Saved" only once that is done.
  await waitFor('document render finished', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null, 30_000);
  const pageCount = document.querySelectorAll('.pagedjs_page').length;

  // Page jump: a valid page moves the view and is announced.
  const jumpInput = document.getElementById('preview-page-jump-input') as HTMLInputElement;
  jumpInput.value = '3';
  (document.getElementById('preview-page-jump') as HTMLFormElement).requestSubmit();
  await waitFor('announced page 3', () => status().startsWith('Page 3 of') ? true : null, 10_000);
  await waitFor('indicator shows page 3', () => document.getElementById('preview-page-indicator')?.textContent?.startsWith('Page 3 ') ? true : null, 10_000);

  // An out-of-range page is refused, announced, and does not move the view.
  const beforeInvalid = scroller()?.scrollTop ?? 0;
  jumpInput.value = String(pageCount + 5);
  (document.getElementById('preview-page-jump') as HTMLFormElement).requestSubmit();
  await waitFor('announced invalid page', () => status().includes(`from 1 to ${pageCount}`) ? true : null, 10_000);
  const invalidMovedView = (scroller()?.scrollTop ?? 0) !== beforeInvalid;

  // Headings: next moves down and is announced; previous moves back up.
  // The preview scrolls smoothly, so each position is read once it has stopped changing.
  const settledScrollTop = async (from: number) => {
    try {
      await waitFor('scroll moved', () => (scroller()?.scrollTop ?? 0) !== from ? true : null, 10_000);
    } catch (error) {
      const area = scroller();
      const origin = area?.getBoundingClientRect().top ?? 0;
      const headingTops = Array.from(document.querySelectorAll<HTMLElement>('#paged-stage h1, #paged-stage h2, #paged-stage h3, #paged-stage h4, #paged-stage h5, #paged-stage h6')).slice(0, 6).map(h => Math.round(h.getBoundingClientRect().top - origin));
      const frames = await new Promise<number>(resolve => {
        let count = 0;
        const started = performance.now();
        const tick = () => { count += 1; if (performance.now() - started < 500) requestAnimationFrame(tick); else resolve(count); };
        requestAnimationFrame(tick);
      });
      const stages = Array.from(document.querySelectorAll<HTMLElement>('#paged-stage'));
      const firstHeading = document.querySelector<HTMLElement>('#paged-stage h2, #paged-stage h1');
      const diagnosis = `stages=${stages.length} areaConnected=${area?.isConnected} headingInArea=${firstHeading ? area?.contains(firstHeading) : 'none'} pages=${document.querySelectorAll('.pagedjs_page').length}`;
      throw new Error(`${(error as Error).message} ${diagnosis} framesIn500ms=${frames} from=${from} scrollTop=${area?.scrollTop} scrollHeight=${area?.scrollHeight} clientHeight=${area?.clientHeight} hidden=${document.hidden} visibility=${document.visibilityState} status=${JSON.stringify(status())} headingTops=${JSON.stringify(headingTops)}`);
    }
    let last = -1;
    let current = scroller()?.scrollTop ?? 0;
    while (current !== last) {
      last = current;
      await new Promise(resolve => setTimeout(resolve, 150));
      current = scroller()?.scrollTop ?? 0;
    }
    return current;
  };
  // Two forward moves, then one back. Each step waits for its own announcement, so an old one cannot satisfy it.
  const history: string[] = [];
  const moveAndAnnounce = async (buttonSelector: string) => {
    const before = status();
    history.push(`click ${buttonSelector} from ${JSON.stringify(before)} at scrollTop=${scroller()?.scrollTop}`);
    await click(buttonSelector);
    try {
      await waitFor('new heading announcement', () => (
        status() !== before && status().startsWith('Heading: ') ? true : null
      ), 10_000);
    } catch (error) {
      // Report what the navigator announced and where it was, so an intermittent miss can be told apart.
      const headings = document.querySelectorAll('#paged-stage h1, #paged-stage h2, #paged-stage h3, #paged-stage h4, #paged-stage h5, #paged-stage h6').length;
      throw new Error(`${(error as Error).message}: before=${JSON.stringify(before)} announced=${JSON.stringify(status())} scrollTop=${scroller()?.scrollTop} headings=${headings} history=${JSON.stringify(history)}`);
    }
    history.push(`announced ${JSON.stringify(status())} at scrollTop=${scroller()?.scrollTop}`);
    return status();
  };
  const top0 = scroller()?.scrollTop ?? 0;
  await moveAndAnnounce('#btn-preview-next-heading');
  const afterFirst = await settledScrollTop(top0);
  await moveAndAnnounce('#btn-preview-next-heading');
  const afterSecond = await settledScrollTop(afterFirst);
  await moveAndAnnounce('#btn-preview-prev-heading');
  const afterBack = await settledScrollTop(afterSecond);
  const afterNext = afterSecond;
  const afterPrevious = afterBack;

  window.__HARNESS_RESULT__ = {
    ok: !invalidMovedView && afterFirst > top0 && afterNext > afterFirst && afterPrevious < afterNext,
    pageCount,
    invalidMovedView,
    nextMovedDown: afterNext > top0,
    previousMovedUp: afterPrevious < afterNext
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
