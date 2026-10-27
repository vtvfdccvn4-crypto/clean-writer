import '../../src/ui/styles/preview.css';
import { compilePreviewDocument, documentCompileSettings } from '../../src/compiler';
import { DEFAULT_APP_STATE, DEFAULT_PAGE_SETUP } from '../../src/config/defaults';
import { LivePreviewRenderer } from '../../src/preview/live/LivePreviewRenderer';
import { applyLiveDocumentStyle } from '../../src/preview/PreviewStyleManager';
import { renderDocumentSection } from '../../src/preview/document-rendering';
import { createCompileWorkerClient } from '../../src/workers/compile-client-factory';
import { createSnapshotAssetResolver } from '../../src/workers/compile-core';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

/** Main-thread time: the sum of long tasks in a window, the longest, and the frame gap. */
async function onMainThread<T>(work: () => Promise<T>): Promise<{ value: T; elapsedMs: number; longTaskMs: number; longestTaskMs: number }> {
  let longTaskMs = 0;
  let longestTaskMs = 0;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      longTaskMs += entry.duration;
      longestTaskMs = Math.max(longestTaskMs, entry.duration);
    }
  });
  observer.observe({ type: 'longtask', buffered: false });
  const started = performance.now();
  const value = await work();
  const elapsedMs = performance.now() - started;
  await new Promise(resolve => setTimeout(resolve, 60));
  observer.disconnect();
  return { value, elapsedMs: round(elapsedMs), longTaskMs: round(longTaskMs), longestTaskMs: round(longestTaskMs) };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** The page's JS heap in MB. Chromium only; the worker's heap is not included (see the RSS sampler). */
const jsHeapMb = (): number | null => {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? round(memory.usedJSHeapSize / 1048576) : null;
};

const page = (index: number) => [
  `## Section ${index}`, '',
  'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12), '',
  '- first item with `code`', '- second item {{tagged}}', '',
  'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
  ...(index % 10 === 0 ? ['', '![pic](images/b.png)', '', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |'] : []), ''
].join('\n');

const SECTIONS = [{ path: 'sections/large.md', isDir: false, hideHeader: false, hideFooter: false, numberHeadings: true, includeInToc: true, pageBreak: false }];
const SETTINGS = documentCompileSettings(DEFAULT_APP_STATE);
const RESOLVER = { async preloadImages() {}, resolveSync: (path: string) => path, releaseAll() {} };

async function run(): Promise<void> {
  // About 450,000 characters: the size where live preview is slow on the page today.
  const pages = Number(new URLSearchParams(window.location.search).get('pages') ?? 200);
  const body = Array.from({ length: pages }, (_, index) => page(index + 1)).join('\n');
  const sourceCharacters = body.length;
  const heapAtStart = jsHeapMb();
  const markdownFor = (text: string) => renderDocumentSection({ path: 'sections/large.md', markdown: text }, SECTIONS, 0);

  const worker = createCompileWorkerClient(async job => ({
    compiled: await compilePreviewDocument(job.markdown, createSnapshotAssetResolver(job.assets), job.settings, { sourceLineOffset: job.sourceLineOffset }),
    cacheHit: false,
    phases: {}
  }));
  const compileInWorker = async (text: string) => {
    const outcome = await worker.compile({ lane: 'live', markdown: markdownFor(text), settings: SETTINGS, assets: {}, sourceLineOffset: 2 });
    return outcome.compiled;
  };

  // The first compile also starts the worker, so it is measured separately.
  const first = await onMainThread(() => compileInWorker(body));
  const warm = await onMainThread(() => compileInWorker(body + '\n'));
  const pageCompile = await onMainThread(() => compilePreviewDocument(markdownFor(body + '\n\n'), RESOLVER, SETTINGS, { sourceLineOffset: 2 }));

  const scroll = document.createElement('div');
  scroll.className = 'preview-scroll-container is-live-preview-scroll';
  scroll.style.cssText = 'height:800px;overflow:auto';
  const stage = document.createElement('div');
  stage.className = 'paged-stage is-live-preview';
  scroll.append(stage);
  document.getElementById('root')!.append(scroll);
  applyLiveDocumentStyle(DEFAULT_PAGE_SETUP);
  const renderer = new LivePreviewRenderer(stage);

  // First render, then one edit at the end of the section (the typing case), each measured on the page.
  const firstRender = await onMainThread(async () => renderer.render(first.value.html, first.value.manifest, DEFAULT_PAGE_SETUP, () => true));
  const editedText = body + '\n\nAn edit at the end.\n';
  const editCompile = await compileInWorker(editedText);
  const editRender = await onMainThread(async () => renderer.render(editCompile.html, editCompile.manifest, DEFAULT_PAGE_SETUP, () => true));

  // Parity: the worker's output for this section equals the page's, byte for byte.
  const pageSameText = await compilePreviewDocument(markdownFor(body), RESOLVER, SETTINGS, { sourceLineOffset: 2 });
  const heapAfterCompiles = jsHeapMb();
  const workerParity = pageSameText.html === first.value.html && JSON.stringify(pageSameText.manifest) === JSON.stringify(first.value.manifest);

  window.__HARNESS_RESULT__ = {
    ok: true,
    workerEqualsPage: workerParity,
    sourceCharacters,
    jsHeapMb: { atStart: heapAtStart, afterCompiles: heapAfterCompiles, afterEdit: jsHeapMb() },
    htmlCharacters: first.value.html.length,
    workerFirstCompile: { elapsedMs: first.elapsedMs, mainThreadLongTaskMs: first.longTaskMs, longestMainThreadTaskMs: first.longestTaskMs },
    workerWarmCompile: { elapsedMs: warm.elapsedMs, mainThreadLongTaskMs: warm.longTaskMs, longestMainThreadTaskMs: warm.longestTaskMs },
    pageCompile: { elapsedMs: pageCompile.elapsedMs, mainThreadLongTaskMs: pageCompile.longTaskMs, longestMainThreadTaskMs: pageCompile.longestTaskMs },
    renderFirst: { elapsedMs: firstRender.elapsedMs, longestMainThreadTaskMs: firstRender.longestTaskMs },
    renderAfterEdit: { elapsedMs: editRender.elapsedMs, longTaskMs: editRender.longTaskMs, longestMainThreadTaskMs: editRender.longestTaskMs }
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
