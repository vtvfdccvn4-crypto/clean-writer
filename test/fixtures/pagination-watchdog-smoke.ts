import { IsolatedPaginationHost } from '../../src/pdf-preview/IsolatedPaginationHost';
import { createIsolatedJob, countIsolatedFrames } from './helpers/isolated-pagination.ts';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const SMALL_PAGE = '@page { size: 100mm 150mm; margin: 10mm; } body { font: 11pt serif; }';

// Each heading forces a physical break, so the job keeps producing pages for a
// long time and the watchdog sees steady progress.
const longDocument = Array.from({ length: 800 }, (_, index) =>
  `<h1>Watchdog section ${index}</h1><p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}</p>`
).join('');

async function run(): Promise<void> {
  // 1. Stall: a limit shorter than the first progress report must fail the job,
  //    report it as a stall, and discard the frame.
  const stalledHost = new IsolatedPaginationHost({ stallMs: 1 });
  const stalled = await stalledHost.requestPrintArtifact(createIsolatedJob(longDocument, { css: SMALL_PAGE }));
  const stallMessage = stalled.status === 'timed-out' ? stalled.message : '';
  const stallReported = stalled.status === 'timed-out' && stallMessage.includes('stalled');
  const stallDiscardedFrame = countIsolatedFrames() === 0;
  stalledHost.dispose();

  // 2. Ceiling: a job that keeps making progress still stops at the ceiling.
  const ceilingHost = new IsolatedPaginationHost({ ceilingMs: 500 });
  const ceiling = await ceilingHost.requestPrintArtifact(createIsolatedJob(longDocument, { css: SMALL_PAGE }));
  const ceilingMessage = ceiling.status === 'timed-out' ? ceiling.message : '';
  const ceilingReported = ceiling.status === 'timed-out' && ceilingMessage.includes('ceiling');
  ceilingHost.dispose();

  // 3. Progress: a job longer than the stall limit must succeed when pages keep
  //    arriving. The stall limit is set below the measured job duration.
  const progressHost = new IsolatedPaginationHost({ stallMs: 1_500 });
  await progressHost.requestPrintArtifact(createIsolatedJob('<h1>Warm</h1>', { css: SMALL_PAGE }));
  const startedAt = performance.now();
  const progressing = await progressHost.requestPrintArtifact(createIsolatedJob(longDocument, { css: SMALL_PAGE }));
  const progressElapsedMs = Math.round(performance.now() - startedAt);
  const progressSucceeded = progressing.status === 'success';
  const outlivedStallLimit = progressElapsedMs > 1_500;
  progressHost.dispose();

  window.__HARNESS_RESULT__ = {
    ok: stallReported && stallDiscardedFrame && ceilingReported && progressSucceeded && outlivedStallLimit,
    stallStatus: stalled.status,
    stallMessage,
    stallDiscardedFrame,
    ceilingStatus: ceiling.status,
    ceilingMessage,
    progressStatus: progressing.status,
    progressElapsedMs,
    progressPageCount: progressing.status === 'success' ? progressing.result.artifact.pageCount : 0,
    outlivedStallLimit,
    orphanedFrames: countIsolatedFrames()
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
