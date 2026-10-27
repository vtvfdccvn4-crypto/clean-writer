import { compilePreviewDocument, documentCompileSettings } from '../../src/compiler';
import { DEFAULT_APP_STATE } from '../../src/config/defaults';
import { createSnapshotAssetResolver } from '../../src/workers/compile-core';
import { CompileClient, isAbortError, type CompileRequest } from '../../src/workers/CompileClient';
import { createCompileWorkerClient } from '../../src/workers/compile-client-factory';
import type { WorkerLike, CompileOutcome } from '../../src/workers/CompileClient';

/** The 50-section corpus for the transfer and warm-up measurements: 50 chapters of 20 pages each. */
function fiftySectionDocument(): string {
  const page = (index: number) => [
    `## Section ${index}`,
    '',
    'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12),
    '',
    '- first item with `code`',
    '- second item {{tagged}}',
    '',
    'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
    ...(index % 10 === 0 ? ['', '![pic](images/b.png)', '', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |'] : []),
    ''
  ].join('\n');
  return Array.from({ length: 50 }, (_, chapter) => [
    `# Chapter ${chapter + 1}`,
    '',
    ...Array.from({ length: 20 }, (_, index) => page(chapter * 20 + index + 1))
  ].join('\n')).join('\n');
}

const round = (value: number) => Math.round(value * 10) / 10;

/** A fresh client with its own worker, so each measurement starts from a cold worker. */
function freshClient(): CompileClient {
  return new CompileClient({
    createWorker: () => new Worker(new URL('../../src/workers/compile.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    compileLocal: async job => ({ compiled: await compilePreviewDocument(job.markdown, createSnapshotAssetResolver(job.assets), job.settings, {}), cacheHit: false, phases: {} })
  });
}

/** One compile, timed on the page, with the worker's own times split out of the round trip. */
async function timedCompile(client: CompileClient, markdown: string, lane: string) {
  const started = performance.now();
  const outcome: CompileOutcome = await client.compile(request(markdown, lane));
  const elapsedMs = round(performance.now() - started);
  const timing = outcome.timing;
  if (!timing) throw new Error('The worker did not report its timing.');
  return {
    elapsedMs,
    cacheHit: outcome.cacheHit,
    requestTransferMs: round(timing.workerReceivedAt - timing.sentAt),
    workerCompileMs: round(timing.workerCompiledAt - timing.workerReceivedAt),
    resultTransferMs: round(timing.receivedAt - timing.workerPostedAt),
    htmlCharacters: outcome.compiled.html.length
  };
}

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const ASSETS = { 'images/a.png': 'blob:harness/a', 'images/b.png': 'blob:harness/b' };
const SETTINGS = documentCompileSettings({
  ...DEFAULT_APP_STATE,
  customStyles: [{ id: 'red', name: 'Red', openingPair: '{{', closingPair: '}}', color: '#ff0000', isBold: true, isItalic: false, fontFamily: '', fontSize: 0 }],
  customBlockStyles: [{ id: 'quote', name: 'Quote', prefix: '>>', icon: '', color: '#00ff00', isBold: false, isItalic: true, fontFamily: '', fontSize: 0, lineHeight: 1.4, marginTop: 4, marginBottom: 4 }]
} as never);

// Every feature the compiler supports, in one document: custom styles, block styles,
// raw HTML (sanitised), GFM tables, images, reference links, and footnotes.
const MIXED = `# Mixed

A {{styled}} paragraph with a [reference][r] and a note[^n].

>> A block-styled quote line.

![first](images/a.png)

| left | right |
|:-----|------:|
| 1    | 2     |

<div class="note">raw <b>html</b><script>alert(1)</script></div>

[r]: https://example.com/ref
[^n]: Footnote body.
`;

/** About 1,000 pages: headings, paragraphs, lists, an image and a table every tenth page. */
function largeDocument(): string {
  const page = (index: number) => [
    `## Section ${index}`,
    '',
    'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12),
    '',
    '- first item with `code`',
    '- second item {{tagged}}',
    '',
    'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
    ...(index % 10 === 0 ? ['', '![pic](images/b.png)', '', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |'] : []),
    ''
  ].join('\n');
  return Array.from({ length: 1000 }, (_, index) => page(index + 1)).join('\n');
}

const request = (markdown: string, lane: string): CompileRequest => ({
  lane,
  markdown,
  settings: SETTINGS,
  assets: ASSETS,
  sourceLineOffset: 0
});

/** The page-side reference: the same compile, on this thread, with the same resolver. */
// The page reference uses its own resolver, not the worker's, so a fault in the
// worker-side resolution cannot make both sides agree.
const pageResolver = {
  async preloadImages() { /* nothing to load in the harness */ },
  resolveSync: (path: string) => (ASSETS as Record<string, string>)[path] ?? path,
  releaseAll() { /* nothing to release */ }
};
const onPage = (markdown: string) => compilePreviewDocument(markdown, pageResolver, SETTINGS, {});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

/** Longest frame gap and summed long-task time over a window, measured on the page thread. */
async function measureMainThread(work: () => Promise<unknown>): Promise<{ elapsedMs: number; longTaskMs: number; longestTaskMs: number; maxFrameGapMs: number }> {
  let longTaskMs = 0;
  let longestTaskMs = 0;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      longTaskMs += entry.duration;
      longestTaskMs = Math.max(longestTaskMs, entry.duration);
    }
  });
  observer.observe({ type: 'longtask', buffered: false });
  let maxFrameGapMs = 0;
  let running = true;
  const frames = (async () => {
    let previous = await nextFrame();
    while (running) {
      const current = await nextFrame();
      maxFrameGapMs = Math.max(maxFrameGapMs, current - previous);
      previous = current;
    }
  })();
  const started = performance.now();
  await work();
  const elapsedMs = performance.now() - started;
  await wait(50);
  running = false;
  await frames;
  observer.disconnect();
  return { elapsedMs: Math.round(elapsedMs), longTaskMs: Math.round(longTaskMs), longestTaskMs: Math.round(longestTaskMs), maxFrameGapMs: Math.round(maxFrameGapMs) };
}

async function run(): Promise<void> {
  const client = new CompileClient({
    createWorker: () => createCompileWorkerClient(async () => { throw new Error('unused'); }) && new Worker(new URL('../../src/workers/compile.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    compileLocal: async job => ({ compiled: await compilePreviewDocument(job.markdown, createSnapshotAssetResolver(job.assets), job.settings, {}), cacheHit: false, phases: {} })
  });

  // 1. Parity: the worker's output equals the page's, for every feature and at scale.
  const mixedPage = await onPage(MIXED);
  const mixedWorker = await client.compile(request(MIXED, 'parity-small'));
  const largeMarkdown = largeDocument();
  const largePage = await onPage(largeMarkdown);
  const largeWorker = await client.compile(request(largeMarkdown, 'parity-large'));
  const parity = {
    mixedHtml: mixedWorker.compiled.html === mixedPage.html,
    mixedManifest: JSON.stringify(mixedWorker.compiled.manifest) === JSON.stringify(mixedPage.manifest),
    largeHtml: largeWorker.compiled.html === largePage.html,
    largeManifest: JSON.stringify(largeWorker.compiled.manifest) === JSON.stringify(largePage.manifest),
    largeHtmlLength: largeWorker.compiled.html.length,
    mixedHasStyledSpan: mixedWorker.compiled.html.includes('data-custom-style-id="red"'),
    mixedHasImageSource: mixedWorker.compiled.html.includes('blob:harness/a'),
    mixedScriptRemoved: !mixedWorker.compiled.html.includes('alert(1)')
  };

  // 2. The worker serves an identical repeat from its cache.
  const repeat = await client.compile(request(MIXED, 'parity-small'));

  // 3. A newer compile supersedes a long one; only the newer result is delivered.
  const slow = client.compile(request(largeMarkdown, 'supersede'));
  const fast = client.compile(request('# Newest\n\nReplacement.', 'supersede'));
  const supersededRejected = await slow.then(() => false, error => isAbortError(error));
  const newestHtml = (await fast).compiled.html;

  // 4. A compile error inside the worker is reported with its message.
  const errorMessage = await client.compile({ ...request('', 'error'), markdown: 7 as unknown as string })
    .then(() => 'no error', error => (error as Error).message);

  // 5. Settings that cannot be cloned fail the job with a clear message, and the worker keeps working.
  const cloneMessage = await client.compile({ ...request('# clone', 'clone'), settings: { ...SETTINGS, onChange() { /* functions cannot be cloned */ } } as never })
    .then(() => 'no error', error => (error as Error).message);
  const afterClone = (await client.compile(request('# after clone', 'clone'))).compiled.html.includes('after clone');

  // 6. Main-thread responsiveness: the same large compile on the page, then in the worker.
  const onPageTiming = await measureMainThread(() => onPage(largeMarkdown));
  // A trailing newline makes this a real compile, not a cache hit on the parity run above.
  const workerTiming = await measureMainThread(() => client.compile(request(largeMarkdown + '\n', 'timing')));

  // 7. A worker that crashes at start-up hands its job to the page, and the page's result matches.
  const crashing = new CompileClient({
    createWorker: () => new Worker('data:text/javascript,throw%20new%20Error(%22harness%20crash%22)') as unknown as WorkerLike,
    compileLocal: async job => ({ compiled: await compilePreviewDocument(job.markdown, createSnapshotAssetResolver(job.assets), job.settings, {}), cacheHit: false, phases: {} })
  });
  const crashed = await crashing.compile(request(MIXED, 'crash'));
  const crashRecovered = crashed.compiled.html === mixedPage.html;
  crashing.dispose();

  client.dispose();

  // 8. Transfer, cold and warm compile times, and the cache, for the 50-section document.
  const fifty = fiftySectionDocument();
  const fiftyChars = fifty.length;
  const coldRuns: Array<Awaited<ReturnType<typeof timedCompile>>> = [];
  const warmRuns: Array<Awaited<ReturnType<typeof timedCompile>>> = [];
  const repeatRuns: Array<Awaited<ReturnType<typeof timedCompile>>> = [];
  const prewarmedRuns = [];
  for (let run = 0; run < 3; run += 1) {
    const cold = freshClient();
    coldRuns.push(await timedCompile(cold, fifty, `cold-${run}`));
    const warmText = await timedCompile(cold, fifty + `\n\nWarm run ${run}.\n`, `warm-${run}`);
    const repeat = await timedCompile(cold, fifty + `\n\nWarm run ${run}.\n`, `repeat-${run}`);
    warmRuns.push(warmText);
    repeatRuns.push(repeat);
    cold.dispose();
    // The same first compile, after a worker has compiled a small document.
    const prewarmed = freshClient();
    await timedCompile(prewarmed, MIXED, `prewarm-${run}`);
    prewarmedRuns.push(await timedCompile(prewarmed, fifty, `after-prewarm-${run}`));
    prewarmed.dispose();
  }
  // Parity for the 50-section document: the worker's output equals the page's.
  const fiftyOnPage = await onPage(fifty);
  const fiftyWorker = await freshClient().compile(request(fifty, 'fifty-parity'));
  const fiftyParity = fiftyWorker.compiled.html === fiftyOnPage.html
    && JSON.stringify(fiftyWorker.compiled.manifest) === JSON.stringify(fiftyOnPage.manifest);
  const timing = {
    documentCharacters: fiftyChars,
    fiftyParity,
    cold: coldRuns,
    coldAfterPrewarm: prewarmedRuns,
    warmNewText: warmRuns,
    repeatCacheHit: repeatRuns
  };

  window.__HARNESS_RESULT__ = {
    ok: parity.mixedHtml && parity.mixedManifest && parity.largeHtml && parity.largeManifest
      && parity.mixedHasStyledSpan && parity.mixedHasImageSource && parity.mixedScriptRemoved
      && repeat.cacheHit === true && supersededRejected && newestHtml.includes('Replacement')
      && errorMessage.includes('must carry Markdown text') && cloneMessage.includes('could not be sent to the compile worker')
      && afterClone && crashRecovered && client.usesFallback === false,
    parity,
    repeatCacheHit: repeat.cacheHit,
    supersededRejected,
    newestDelivered: newestHtml.includes('Replacement'),
    errorMessage,
    cloneMessage,
    afterClone,
    crashRecovered,
    workerUsed: client.usesFallback === false,
    pageCompile: onPageTiming,
    workerCompile: workerTiming,
    workerCompileCacheHit: largeWorker.cacheHit,
    timing
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
