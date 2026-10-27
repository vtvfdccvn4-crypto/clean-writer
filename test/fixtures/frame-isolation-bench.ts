/**
 * Measures whether a busy frame delays this page's timers. Variants:
 * - same-origin: the frame shares this page's origin (the current pagination frame).
 * - sandboxed: the same document in a sandbox without allow-same-origin.
 * - cross-site: the same document served from another host name.
 * The parent samples a 16 ms interval for an idle period, then again while the frame runs.
 */
declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const params = new URLSearchParams(window.location.search);
const VARIANT = params.get('variant') ?? 'same-origin';
const IDLE_MS = 2_000;
const BUSY_MS = 5_000;
const INTERVAL_MS = 16;

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  const withinBand = values.filter(value => value <= INTERVAL_MS * 1.2).length / Math.max(1, values.length);
  return { count: values.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0), withinTwentyPercent: round(withinBand) };
}
const round = (value: number) => Math.round(value * 10) / 10;

function sample(durationMs: number): Promise<number[]> {
  return new Promise(resolve => {
    const gaps: number[] = [];
    let last = performance.now();
    const started = last;
    const timer = window.setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      if (now - started >= durationMs) {
        window.clearInterval(timer);
        resolve(gaps);
      }
    }, INTERVAL_MS);
  });
}

/** The app's own pagination in its same-origin frame, with the parent timing its own ticks. */
async function runRealPagination(): Promise<void> {
  const { compilePreviewDocument, documentCompileSettings } = await import('../../src/compiler');
  const { DEFAULT_APP_STATE } = await import('../../src/config/defaults');
  const { IsolatedPaginationHost } = await import('../../src/pdf-preview/IsolatedPaginationHost');
  const { createPdfPreviewJob } = await import('../../src/pdf-preview/PdfPreviewJobFactory');
  const { captureCurrentPrintLayout } = await import('../../src/ui/CompiledPreviewCache');
  const { renderDocumentSection } = await import('../../src/preview/document-rendering');
  const resolver = { async preloadImages() { /* none */ }, resolveSync: (path: string) => path, releaseAll() { /* none */ } };
  const settings = documentCompileSettings(DEFAULT_APP_STATE);
  const sections = [{ path: 'sections/a.md', isDir: false, hideHeader: false, hideFooter: false, numberHeadings: true, includeInToc: true, pageBreak: false }];
  const sectionCount = Number(params.get('sections') ?? 300);
  const body = Array.from({ length: sectionCount }, (_, index) => [
    `## Section ${index + 1}`, '',
    'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12), ''
  ].join('\n')).join('\n');
  const compiled = await compilePreviewDocument(renderDocumentSection({ path: 'sections/a.md', markdown: body }, sections, 0), resolver, settings, { sourceLineOffset: 2 });

  const idle = summarize(await sample(IDLE_MS));
  const pagination = new IsolatedPaginationHost();
  const busyPromise = sample(BUSY_MS);
  const started = performance.now();
  const outcome = await pagination.requestPrintArtifact(createPdfPreviewJob(compiled.html, captureCurrentPrintLayout(), resolver));
  const paginateMs = round(performance.now() - started);
  const busy = summarize(await busyPromise);
  pagination.dispose();
  window.__HARNESS_RESULT__ = {
    ok: outcome.status === 'success',
    variant: 'pagination',
    paginateMs,
    idle,
    busy,
    p50Ratio: round(busy.p50 / Math.max(0.1, idle.p50)),
    withinTwentyPercentBusy: busy.withinTwentyPercent
  };
}

async function run(): Promise<void> {
  if (VARIANT === 'pagination') {
    await runRealPagination();
    return;
  }
  const idle = summarize(await sample(IDLE_MS));

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:800px;height:600px;border:0;';
  const busyPath = '/test/fixtures/frame-isolation-busy.html';
  if (VARIANT === 'cross-site') {
    // The page is served from 127.0.0.1, so localhost is a different site on the same server.
    frame.src = `http://localhost:${window.location.port}${busyPath}`;
  } else {
    frame.src = busyPath;
    if (VARIANT === 'sandboxed') frame.setAttribute('sandbox', 'allow-scripts');
  }
  document.body.append(frame);
  await new Promise(resolve => setTimeout(resolve, 300));

  const busy = summarize(await sample(BUSY_MS));
  frame.remove();

  window.__HARNESS_RESULT__ = {
    ok: true,
    variant: VARIANT,
    idle,
    busy,
    p50Ratio: round(busy.p50 / Math.max(0.1, idle.p50)),
    withinTwentyPercentBusy: busy.withinTwentyPercent
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
