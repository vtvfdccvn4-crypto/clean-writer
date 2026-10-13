import { Previewer } from 'pagedjs';
import type { PreviewPageTiming } from '../perf/preview-timing';

type PdfPreviewer = {
  preview(source: HTMLElement, styles: string[], target: HTMLElement): Promise<unknown>;
  chunker?: { q?: {
    tick?: (callback: FrameRequestCallback) => unknown;
    enqueue?: (task: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  } };
};

export type FramePaginationResult = {
  pageCount: number;
  paginationCss: string;
  durationMs: number;
  sourceInstallMs: number;
  pagedJsInitializationMs: number;
  paginationCssExtractionMs: number;
  paginationCssCharacterCount: number;
  paginationStyleCount: number;
  pagedJsQueueCycleMs: number;
  pagedJsQueueTaskCount: number;
  pageTimings: readonly PreviewPageTiming[];
};

/** Runs Paged.js inside the isolated renderer frame for every preview use case. */
export async function paginatePreviewFrame(
  stage: HTMLElement,
  html: string,
  css: string,
  reportProgress?: (pagesCompleted: number) => void,
  prepareSource?: (source: HTMLElement) => void
): Promise<FramePaginationResult> {
  const startedAt = performance.now();
  const sourceInstallStartedAt = performance.now();
  stage.replaceChildren();
  const styleUrl = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
  const source = document.createElement('article');
  source.innerHTML = html;
  prepareSource?.(source);
  const sourceInstallMs = Math.round(performance.now() - sourceInstallStartedAt);
  const pagedJsInitializationStartedAt = performance.now();
  const previewer = new Previewer() as unknown as PdfPreviewer;
  const pagedJsInitializationMs = Math.round(performance.now() - pagedJsInitializationStartedAt);
  const pageTimings: PreviewPageTiming[] = [];
  let pagedJsQueueCycleMs = 0;
  let pagedJsQueueTaskCount = 0;
  // A hidden iframe may have requestAnimationFrame throttled. Paged.js must
  // advance through tasks so long jobs continue producing physical pages.
  // MessageChannel avoids the nested-timer clamping that can add several
  // milliseconds to every page when setTimeout(0) is used in Chromium.
  if (previewer.chunker?.q) {
    const queue = previewer.chunker.q;
    const originalEnqueue = queue.enqueue?.bind(queue);
    if (originalEnqueue) {
      // Queue promises resolve after both the task yield and renderAsync(),
      // making this a reliable per-page Paged.js cycle measure.
      queue.enqueue = (task, ...args) => {
        const queuedAt = performance.now();
        pagedJsQueueTaskCount += 1;
        return originalEnqueue(task, ...args).finally(() => {
          pagedJsQueueCycleMs += performance.now() - queuedAt;
        });
      };
    }
    let lastPageCount = 0;
    queue.tick = callback => schedulePaginationTask(timestamp => {
      callback(timestamp);
      if (!collectPageTimings) return;
      const pages = stage.querySelectorAll<HTMLElement>('.pagedjs_page');
      if (pages.length <= lastPageCount) return;
      const elapsedMs = Math.round(performance.now() - startedAt);
      for (let pageIndex = lastPageCount; pageIndex < pages.length; pageIndex += 1) {
        const page = pages[pageIndex]!;
        const sourceElement = page.querySelector<HTMLElement>('[data-ref], [data-split-from]');
        pageTimings.push({
          pageNumber: pageIndex + 1,
          elapsedMs,
          deltaMs: Math.max(0, elapsedMs - (pageTimings.at(-1)?.elapsedMs ?? 0)),
          domNodeCount: page.querySelectorAll('*').length,
          imageCount: page.querySelectorAll('img').length,
          tableCount: page.querySelectorAll('table').length,
          headingCount: page.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
          sourceAnchor: sourceElement?.getAttribute('data-ref') ?? sourceElement?.getAttribute('data-split-from') ?? undefined
        });
      }
      lastPageCount = pages.length;
    });
  }
  const progressTimer = reportProgress
    ? window.setInterval(() => reportProgress(stage.querySelectorAll('.pagedjs_page').length), 500)
    : undefined;
  try {
    await previewer.preview(source, [styleUrl], stage);
  } finally {
    if (progressTimer !== undefined) window.clearInterval(progressTimer);
    URL.revokeObjectURL(styleUrl);
  }
  const pageCount = stage.querySelectorAll('.pagedjs_page').length;
  if (pageCount === 0) throw new Error('PDF pagination produced no physical pages.');
  const paginationCssStartedAt = performance.now();
  const paginationStyles = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]'));
  // The parent installs this CSS alongside the serialized page DOM. Retain
  // the immutable job stylesheet as well as Paged.js' generated rules: the
  // latter contains page geometry, but it does not preserve every source
  // rule (such as preview-only guidelines and document styles).
  const paginationCss = [
    css,
    ...paginationStyles.map(style => style.textContent || '')
  ].join('\n');
  const paginationCssExtractionMs = Math.round(performance.now() - paginationCssStartedAt);
  const durationMs = Math.round(performance.now() - startedAt);
  const roundedQueueCycleMs = Math.round(pagedJsQueueCycleMs);
  return {
    pageCount,
    paginationCss,
    durationMs,
    sourceInstallMs,
    pagedJsInitializationMs,
    paginationCssExtractionMs,
    paginationCssCharacterCount: paginationCss.length,
    paginationStyleCount: paginationStyles.length,
    pagedJsQueueCycleMs: roundedQueueCycleMs,
    pagedJsQueueTaskCount,
    pageTimings: collectPageTimings ? pageTimings : []
  };
}

const collectPageTimings = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('timings') === 'true';

function schedulePaginationTask(callback: FrameRequestCallback): void {
  if (typeof MessageChannel === 'undefined') {
    window.setTimeout(() => callback(performance.now()), 0);
    return;
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    channel.port2.close();
    callback(performance.now());
  };
  channel.port2.postMessage(undefined);
}
