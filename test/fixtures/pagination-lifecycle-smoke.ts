import { IsolatedPaginationHost } from '../../src/pdf-preview/IsolatedPaginationHost';
import type { PdfPreviewJob } from '../../src/pdf-preview/contracts';
import { createIsolatedJob, countIsolatedFrames } from './helpers/isolated-pagination.ts';
import { pdfDigest } from '../../src/pdf-preview/digest';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const SMALL_PAGE = '@page { size: 100mm 150mm; margin: 10mm; } body { font: 11pt serif; }';
const LARGE_PAGE = '@page { size: 300mm 400mm; margin: 20mm; } body { font: 11pt serif; }';

// Each heading forces a physical page break, so the job spans many pages and
// keeps the frame busy long enough for a cancel to land mid-pagination.
const longDocument = (marker: string) => Array.from({ length: 160 }, (_, index) =>
  `<h1>${marker} section ${index}</h1><p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}</p>`
).join('');

function withCss(job: PdfPreviewJob, css: string): PdfPreviewJob {
  return { ...job, css, key: { ...job.key, stylesheetDigest: pdfDigest(css) } };
}

async function run(): Promise<void> {
  const host = new IsolatedPaginationHost();
  const shortHtml = '<h1>Lifecycle</h1><p>Short fixture body.</p>';

  // 1. Repeated identical runs must not accumulate Paged.js rules in the frame.
  const repeatedSizes: number[] = [];
  for (let run = 0; run < 4; run += 1) {
    const outcome = await host.requestPrintArtifact(createIsolatedJob(shortHtml, { css: SMALL_PAGE }));
    if (outcome.status !== 'success') throw new Error(`Repeated run ${run} did not succeed: ${outcome.status}`);
    repeatedSizes.push(outcome.result.artifact.css.length);
  }
  const repeatedRunsStable = repeatedSizes.every(size => size === repeatedSizes[0]);

  // 2. A different page size must not inherit the previous run's page rules.
  const smallOutcome = await host.requestPrintArtifact(createIsolatedJob(shortHtml, { css: SMALL_PAGE }));
  const largeOutcome = await host.requestPrintArtifact(createIsolatedJob(shortHtml, { css: LARGE_PAGE }));
  if (smallOutcome.status !== 'success' || largeOutcome.status !== 'success') {
    throw new Error('Page-size runs did not both succeed.');
  }
  const smallCssHasOwnSize = smallOutcome.result.artifact.css.includes('100mm');
  const largeCssInheritsSmallSize = largeOutcome.result.artifact.css.includes('100mm');

  // 3. A cancelled mid-pagination job must be discarded, and the next job must
  //    complete on a clean frame that contains none of the cancelled content.
  const cancelController = new AbortController();
  const cancelJob = createIsolatedJob(longDocument('CANCELLED_MARKER'), { css: SMALL_PAGE });
  let progressSeen = false;
  const cancelOutcome = host.requestPrintArtifact(cancelJob, event => {
    if (event.phase === 'paginate' && (event.pagesCompleted ?? 0) > 0) {
      progressSeen = true;
      cancelController.abort();
    }
  }, cancelController.signal);
  const cancelled = await cancelOutcome;
  const cancelWasMidRun = progressSeen && cancelled.status === 'cancelled';
  // The running job cannot be stopped from outside, so the only proof that it
  // stopped is that its frame was discarded before the cancel resolved.
  const cancelDiscardedFrame = countIsolatedFrames() === 0;

  const recovered = await host.requestPrintArtifact(createIsolatedJob('<h1>Recovered</h1><p>RECOVERED_MARKER</p>', { css: SMALL_PAGE }));
  const recoveredClean = recovered.status === 'success'
    && recovered.result.artifact.html.includes('RECOVERED_MARKER')
    && !recovered.result.artifact.html.includes('CANCELLED_MARKER');

  // 4. A rapid burst of requests is serialized: every request ends in a
  //    terminal state, and only one frame exists afterwards.
  const burst = await Promise.all(Array.from({ length: 3 }, (_, index) =>
    host.requestPrintArtifact(createIsolatedJob(`<h1>Burst ${index}</h1>`, { css: SMALL_PAGE }))
  ));
  const burstAllTerminal = burst.every(outcome => outcome.status === 'success');

  host.dispose();
  window.__HARNESS_RESULT__ = {
    ok: repeatedRunsStable && smallCssHasOwnSize && !largeCssInheritsSmallSize
      && cancelWasMidRun && cancelDiscardedFrame && recoveredClean && burstAllTerminal && countIsolatedFrames() === 0,
    repeatedRunsStable,
    repeatedCssSizes: repeatedSizes,
    smallCssHasOwnSize,
    largeCssInheritsSmallSize,
    cancelWasMidRun,
    cancelDiscardedFrame,
    cancelStatus: cancelled.status,
    recoveredClean,
    burstAllTerminal,
    orphanedFrames: countIsolatedFrames()
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
