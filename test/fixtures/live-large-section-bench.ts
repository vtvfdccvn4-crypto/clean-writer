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

/** The value at the given fraction of the sorted samples (nearest rank). */
const percentile = (samples: number[], fraction: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return round(sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0);
};

const summarize = (samples: number[]) => ({ p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: round(Math.max(...samples)) });

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
  const params = new URLSearchParams(window.location.search);
  const pages = Number(params.get('pages') ?? 200);
  // mode=worker-only runs just the proposed default path (worker compile and live render). It skips the
  // page-side compile and the parity check, so its memory peak is not inflated by a second compile.
  const workerOnly = params.get('mode') === 'worker-only';
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
  const pageCompile = workerOnly ? null : await onMainThread(() => compilePreviewDocument(markdownFor(body + '\n\n'), RESOLVER, SETTINGS, { sourceLineOffset: 2 }));

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
  const pageSameText = workerOnly ? null : await compilePreviewDocument(markdownFor(body), RESOLVER, SETTINGS, { sourceLineOffset: 2 });
  const heapAfterCompiles = jsHeapMb();
  const workerParity = pageSameText === null
    ? null
    : pageSameText.html === first.value.html && JSON.stringify(pageSameText.manifest) === JSON.stringify(first.value.manifest);

  // mode=edit-sequence: a run of edits, each compiled in the worker and rendered after a zero-delay timer
  // (standing in for the scheduler). The render budget is judged on the p95 of these render times.
  let editSequence: Record<string, unknown> | null = null;
  if (params.get('mode') === 'edit-sequence') {
    const count = Number(params.get('edits') ?? 50);
    const renderMs: number[] = [];
    const compileMs: number[] = [];
    let text = body;
    for (let index = 0; index < count; index += 1) {
      text += `\nEdit ${index + 1} at the end of the section.\n`;
      const compileStarted = performance.now();
      const compiled = await compileInWorker(text);
      compileMs.push(performance.now() - compileStarted);
      await new Promise(resolve => setTimeout(resolve, 0));
      const renderStarted = performance.now();
      await renderer.render(compiled.html, compiled.manifest, DEFAULT_PAGE_SETUP, () => true);
      renderMs.push(performance.now() - renderStarted);
    }
    editSequence = { edits: count, render: summarize(renderMs), compile: summarize(compileMs), renderMs: renderMs.map(round) };
  }

  window.__HARNESS_RESULT__ = {
    ok: true,
    editSequence,
    mode: workerOnly ? 'worker-only' : 'full',
    workerEqualsPage: workerParity,
    sourceCharacters,
    jsHeapMb: { atStart: heapAtStart, afterCompiles: heapAfterCompiles, afterEdit: jsHeapMb() },
    htmlCharacters: first.value.html.length,
    workerFirstCompile: { elapsedMs: first.elapsedMs, mainThreadLongTaskMs: first.longTaskMs, longestMainThreadTaskMs: first.longestTaskMs },
    workerWarmCompile: { elapsedMs: warm.elapsedMs, mainThreadLongTaskMs: warm.longTaskMs, longestMainThreadTaskMs: warm.longestTaskMs },
    pageCompile: pageCompile && { elapsedMs: pageCompile.elapsedMs, mainThreadLongTaskMs: pageCompile.longTaskMs, longestMainThreadTaskMs: pageCompile.longestTaskMs },
    renderFirst: { elapsedMs: firstRender.elapsedMs, longestMainThreadTaskMs: firstRender.longestTaskMs },
    renderAfterEdit: { elapsedMs: editRender.elapsedMs, longTaskMs: editRender.longTaskMs, longestMainThreadTaskMs: editRender.longestTaskMs }
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
