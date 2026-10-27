import { IsolatedPaginationHost } from '../../src/pdf-preview/IsolatedPaginationHost';
import type { PdfPreviewJob } from '../../src/pdf-preview/contracts';
import { PDF_RENDER_COMPILER_VERSION } from '../../src/pdf-preview/PdfRenderSnapshot';
import { pdfDigest } from '../../src/pdf-preview/digest';

type ProfileScenario = {
  name: string;
  html: string;
  expectedMinimumPages?: number;
  sentinel?: string;
  layoutVariant?: 'baseline' | 'all-margin-boxes' | 'no-margin-boxes' | 'minimal-page-css' | 'no-forced-break-css';
};
type ProfileRequest = { samples: number; scenarios: ProfileScenario[] };

declare global {
  interface Window {
    __RUN_PAGINATION_PROFILE__?: (request: ProfileRequest) => Promise<unknown>;
    __REUSE_SETUP__?: (scenario: ProfileScenario) => void;
    __REUSE_RUN__?: () => Promise<Record<string, unknown>>;
    __REUSE_TEARDOWN__?: () => void;
  }
}

const logoSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Crect width="16" height="16" fill="%23263a5b"/%3E%3C/svg%3E';

window.__RUN_PAGINATION_PROFILE__ = async ({ scenarios, samples }) => {
  const results = [];
  for (const scenario of scenarios) {
    const durations: number[] = [];
    const sampleDiagnostics: PaginationDiagnostic[] = [];
    let lastResult: ScaleResult | null = null;
    for (let sample = 0; sample < samples; sample += 1) {
      lastResult = await runScenario(scenario);
      durations.push(lastResult.diagnostics.elapsedMs);
      sampleDiagnostics.push(lastResult.diagnostics);
    }
    if (!lastResult) throw new Error('Pagination scale scenario did not run.');
    results.push({
      name: scenario.name,
      pageCount: lastResult.pageCount,
      paginationMs: summarize(durations),
      medianMsPerPage: round(median(durations) / Math.max(1, lastResult.pageCount)),
      expectedMinimumPages: scenario.expectedMinimumPages ?? null,
      minimumPageCountMet: scenario.expectedMinimumPages === undefined || lastResult.pageCount >= scenario.expectedMinimumPages,
      lastPageText: lastResult.lastPageText,
      lastPageContainsSentinel: lastResult.lastPageContainsSentinel,
      headerImageRendered: lastResult.headerImageRendered,
      blankPageCount: lastResult.blankPageCount,
      orphanedFrames: lastResult.orphanedFrames,
      passed: lastResult.passed,
      diagnostics: lastResult.diagnostics,
      samples: sampleDiagnostics
    });
  }
  const cancellationScenario = scenarios.find(scenario => scenario.layoutVariant === 'baseline') ?? scenarios.at(-1);
  const cancellation = cancellationScenario ? await runCancellation(cancellationScenario) : null;
  return { scenarios: results, cancellation };
};

async function runScenario(scenario: ProfileScenario): Promise<ScaleResult> {
  const host = new IsolatedPaginationHost();
  const initialHeapUsedBytes = readHeapUsedBytes();
  const progress: number[] = [];
  const outcome = await host.requestPrintArtifact(createJob(scenario), event => {
    if (event.pagesCompleted !== undefined) progress.push(event.pagesCompleted);
  });
  host.dispose();
  if (outcome.status !== 'success') {
    return {
      pageCount: 0, lastPageText: '', lastPageContainsSentinel: false,
      headerImageRendered: false, orphanedFrames: rewriteFrameCount(), passed: false,
      diagnostics: createDiagnostic(outcome.status, outcome.diagnostics, initialHeapUsedBytes, progress, 'message' in outcome ? outcome.message : undefined)
    };
  }
  const artifact = new DOMParser().parseFromString(outcome.result.artifact.html, 'text/html');
  const pages = Array.from(artifact.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const lastPage = pages.at(-1);
  const pageCount = outcome.result.artifact.pageCount;
  const lastPageContainsSentinel = scenario.sentinel === undefined || lastPage?.textContent?.includes(scenario.sentinel) === true;
  const headerImageRendered = pages.every(page => page.querySelector('.pagedjs_margin-top-left img[src]') !== null);
  const expectsHeaderImage = scenario.layoutVariant === undefined
    || scenario.layoutVariant === 'baseline'
    || scenario.layoutVariant === 'all-margin-boxes'
    || scenario.layoutVariant === 'minimal-page-css'
    || scenario.layoutVariant === 'no-forced-break-css';
  const blankPageCount = pages.filter(page => (page.querySelector('.pagedjs_page_content')?.textContent ?? '').trim().length === 0).length;
  const diagnostics = createDiagnostic('success', outcome.diagnostics, initialHeapUsedBytes, progress);
  return {
    pageCount,
    lastPageText: lastPage?.textContent?.slice(-240) ?? '',
    lastPageContainsSentinel,
    headerImageRendered,
    blankPageCount,
    orphanedFrames: rewriteFrameCount(),
    passed: pageCount >= (scenario.expectedMinimumPages ?? 0) && lastPageContainsSentinel
      && headerImageRendered === expectsHeaderImage && blankPageCount === 0 && rewriteFrameCount() === 0,
    diagnostics
  };
}

/** Verifies cancellation disposes an actively paginating large-document frame. */
async function runCancellation(scenario: ProfileScenario) {
  const host = new IsolatedPaginationHost();
  const controller = new AbortController();
  let cancelledDuringPagination = false;
  const repeats = Math.max(3, Math.ceil(600 / (scenario.expectedMinimumPages ?? 40)));
  const cancellationHtml = Array.from({ length: repeats }, () => scenario.html).join('');
  const outcome = await host.requestPrintArtifact(createJob({ ...scenario, html: cancellationHtml }), event => {
    if (event.phase === 'paginate' && (event.pagesCompleted ?? 0) > 0 && !controller.signal.aborted) {
      cancelledDuringPagination = true;
      controller.abort();
    }
  }, controller.signal);
  host.dispose();
  return {
    status: outcome.status,
    cancelledDuringPagination,
    orphanedFrames: rewriteFrameCount(),
    passed: outcome.status === 'cancelled' && cancelledDuringPagination && rewriteFrameCount() === 0,
    diagnostics: outcome.diagnostics
  };
}

function createJob(scenario: ProfileScenario): PdfPreviewJob {
  return {
    // The profiler deliberately turns every generated section heading into a
    // physical-page boundary. This keeps the 50/100/200/300 scenarios stable
    // even if normal document-section markup changes in the editor compiler.
    html: scenario.html.replace(/<h1\b/gi, '<div class="scale-force-break"></div><h1'),
    css: layoutCss(scenario.layoutVariant),
    key: {
      compilerVersion: PDF_RENDER_COMPILER_VERSION,
      documentDigest: pdfDigest(scenario.html),
      stylesheetDigest: pdfDigest(layoutCss(scenario.layoutVariant)),
      marginsDigest: pdfDigest('{}'),
      assetsDigest: pdfDigest('[]')
    },
    artifactPrintCss: '@media print { @page { size: A4; margin: 0; } }',
    listMarkerStyles: { bulletIcon: 'decimal', parenthesized: { bulletIcon: 'decimal' } },
    margins: scenario.layoutVariant === 'no-margin-boxes'
      ? { header: row(''), footer: row(''), metadata: metadata() }
      : scenario.layoutVariant === 'all-margin-boxes'
        ? populatedMargins()
        : { header: sparseHeader(), footer: sparseFooter(), metadata: metadata() },
    marginImageSources: { 'scale-logo': logoSource },
    assets: []
  };
}

function layoutCss(variant: ProfileScenario['layoutVariant']): string {
  if (variant === 'minimal-page-css') return '@page { size: A4; } body { font: 11pt serif; }';
  if (variant === 'no-forced-break-css') return '@page { size: A4; margin: 20mm; @top-left { content: "header"; } @bottom-right { content: counter(page); } } body { font: 11pt serif; }';
  if (variant === 'all-margin-boxes') {
    return `@page { size: A4; margin: 20mm;
      @top-left { content: "header"; } @top-center { content: "header"; } @top-right { content: "header"; }
      @bottom-left { content: "footer"; } @bottom-center { content: "footer"; } @bottom-right { content: "footer"; }
    } [data-page-break="true"], .print-page-break, .scale-force-break { break-before: page; } body { font: 11pt serif; }`;
  }
  return `@page { size: A4; margin: 20mm; @top-left { content: "header"; } @bottom-right { content: counter(page); } }
      [data-page-break="true"], .print-page-break, .scale-force-break { break-before: page; } body { font: 11pt serif; }`;
}

function row(content: string) {
  const cell = { content, fontFamily: 'serif', fontSize: 9, isBold: false, isItalic: false, horizontalAlign: 'left' as const, verticalAlign: 'middle' as const };
  return { centerWidth: '33%', left: cell, center: { ...cell, content: '' }, right: { ...cell, content: '' } };
}

function sparseHeader() {
  return row('![Scale logo](scale-logo)');
}

function sparseFooter() {
  const footer = row('');
  footer.right = { ...footer.right, content: 'Page {page}' };
  return footer;
}

function populatedMargins() {
  const header = row('![Scale logo](scale-logo)');
  header.center = { ...header.center, content: '${documentTitle}' };
  header.right = { ...header.right, content: '{chapter:Chapter }' };
  const footer = row('Page {page}');
  footer.center = { ...footer.center, content: '${documentNumber}' };
  footer.right = { ...footer.right, content: '${documentRevision}' };
  return { header, footer, metadata: { ...metadata(), documentTitle: 'Scale profile', documentNumber: 'CW-300', documentRevision: 'A' } };
}

function metadata() {
  return { author: '', documentTitle: '', documentName: '', documentNumber: '', documentRevision: '', documentType: '', productName: '', productModule: '', productVersion: '' };
}

type ScaleResult = {
  pageCount: number;
  lastPageText: string;
  lastPageContainsSentinel: boolean;
  headerImageRendered: boolean;
  blankPageCount: number;
  orphanedFrames: number;
  passed: boolean;
  diagnostics: PaginationDiagnostic;
};

type PaginationDiagnostic = {
  phase: 'isolated-pdf-preview';
  status: string;
  pagesCompleted: number;
  progressPeak: number;
  elapsedMs: number;
  heapUsedBytes: number | null;
  heapGrowthBytes: number | null;
  timeoutPhase: string | null;
  timings: unknown[];
  error?: string;
};

function createDiagnostic(
  status: string,
  diagnostics: { elapsedMs: number; pageCount?: number; timings: unknown[] },
  initialHeapUsedBytes: number | null,
  progress: number[],
  error?: string
): PaginationDiagnostic {
  const heapUsedBytes = readHeapUsedBytes();
  return {
    phase: 'isolated-pdf-preview', status, pagesCompleted: diagnostics.pageCount ?? 0,
    progressPeak: Math.max(0, ...progress), elapsedMs: diagnostics.elapsedMs,
    heapUsedBytes, heapGrowthBytes: heapUsedBytes === null || initialHeapUsedBytes === null ? null : heapUsedBytes - initialHeapUsedBytes,
    timeoutPhase: status === 'timed-out' ? 'isolated-pagination' : null,
    timings: diagnostics.timings,
    ...(error ? { error } : {})
  };
}

// Reused-host mode. The app keeps one host, and its frame, across jobs, so these runs
// share one host. The driver calls one run at a time, so it can force garbage collection between runs.
let reuseState: { host: IsolatedPaginationHost; scenario: ProfileScenario; run: number } | null = null;

window.__REUSE_SETUP__ = scenario => {
  reuseState?.host.dispose();
  reuseState = { host: new IsolatedPaginationHost(), scenario, run: 0 };
};

window.__REUSE_TEARDOWN__ = () => {
  reuseState?.host.dispose();
  reuseState = null;
};

window.__REUSE_RUN__ = async () => {
  if (!reuseState) throw new Error('Reused-host setup did not run.');
  const state = reuseState;
  state.run += 1;
  const frameBefore = document.querySelector<HTMLIFrameElement>('iframe[src*="pdf-preview"]');
  const stylesBefore = frameBefore?.contentDocument?.querySelectorAll('style').length ?? null;
  const started = performance.now();
  const outcome = await state.host.requestPrintArtifact(createJob(state.scenario));
  const elapsedMs = Math.round(performance.now() - started);
  const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[src*="pdf-preview"]'));
  const frame = frames[0] ?? null;
  const frameDocument = frame?.contentDocument ?? null;
  return {
    run: state.run,
    status: outcome.status,
    elapsedMs,
    pageCount: outcome.status === 'success' ? outcome.result.artifact.pageCount : 0,
    frameCount: frames.length,
    frameReused: frameBefore !== null && frame === frameBefore,
    stylesBefore,
    styleElementCount: frameDocument?.querySelectorAll('style').length ?? null,
    pagedPageCount: frameDocument?.querySelectorAll('.pagedjs_page').length ?? null,
    frameHtmlCharacters: frameDocument?.documentElement?.outerHTML.length ?? null,
    heapUsedBytesBeforeGc: readHeapUsedBytes()
  };
};

function rewriteFrameCount() {
  return document.querySelectorAll('iframe[src*="pdf-preview"]').length;
}

function readHeapUsedBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}

function summarize(values: number[]) {
  return { median: round(median(values)), p95: round(percentile(values, 0.95)), min: round(Math.min(...values)), max: round(Math.max(...values)) };
}

function median(values: number[]) { return percentile(values, 0.5); }
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}
function round(value: number) { return Math.round(value * 100) / 100; }
