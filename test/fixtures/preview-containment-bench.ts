import '../../src/ui/styles/preview.css';
import { compilePreviewDocument, documentCompileSettings } from '../../src/compiler';
import { DEFAULT_APP_STATE } from '../../src/config/defaults';
import { DEFAULT_PAGE_SETUP } from '../../src/config/defaults';
import { LivePreviewRenderer } from '../../src/preview/live/LivePreviewRenderer';
import { applyLiveDocumentStyle } from '../../src/preview/PreviewStyleManager';
import { PreviewController } from '../../src/preview/PreviewController';
import { IsolatedPaginationHost } from '../../src/pdf-preview/IsolatedPaginationHost';
import { createPdfPreviewJob } from '../../src/pdf-preview/PdfPreviewJobFactory';
import { captureCurrentPrintLayout } from '../../src/ui/CompiledPreviewCache';
import { renderDocumentSection } from '../../src/preview/document-rendering';

const SECTIONS = [{ path: 'sections/a.md', isDir: false, hideHeader: false, hideFooter: false, numberHeadings: true, includeInToc: true, pageBreak: false }];

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

// Same corpus as the typing benchmark: 1,000 pages of prose, a list, and a table every tenth page.
const PAGES = Number(new URLSearchParams(window.location.search).get('pages') ?? 1000);
const CONTAIN_MODE = new URLSearchParams(window.location.search).get('contain') ?? 'off';
const CONTAINED = CONTAIN_MODE === 'on' || CONTAIN_MODE === 'exact';
const page = (index: number) => [
  `## Section ${index}`,
  '',
  'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12),
  '',
  '- first item with `code`',
  '- second item',
  '',
  'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
  ...(index % 10 === 0 ? ['', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |'] : []),
  ''
].join('\n');

const RESOLVER = { async preloadImages() { /* none */ }, resolveSync: (path: string) => path, releaseAll() { /* none */ } };
const SETTINGS = documentCompileSettings(DEFAULT_APP_STATE);

// The candidate containment rules, applied only to this benchmark.
const SURFACE = new URLSearchParams(window.location.search).get('surface') ?? 'live';
const containmentStyle = document.createElement('style');
containmentStyle.textContent = SURFACE === 'pages'
  ? `.pagedjs_page { content-visibility: auto; contain-intrinsic-size: 794px 1123px; }`
  : `.paged-stage.is-live-preview .live-preview-block { content-visibility: auto; contain-intrinsic-size: auto 600px; }`;
if (CONTAINED) document.head.append(containmentStyle);

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(time => resolve(time)));
const round = (value: number) => Math.round(value * 10) / 10;
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};

async function runPages(): Promise<void> {
  const body = Array.from({ length: PAGES }, (_, index) => page(index + 1)).join('\n');
  const markdown = renderDocumentSection({ path: 'sections/a.md', markdown: body }, SECTIONS, 0);
  const compiled = await compilePreviewDocument(markdown, RESOLVER, SETTINGS, { sourceLineOffset: 2 });
  const root = document.getElementById('root')!;
  const scroller = document.createElement('div');
  scroller.className = 'preview-scroll-container';
  scroller.style.height = '800px';
  scroller.style.overflow = 'auto';
  const stage = document.createElement('div');
  stage.className = 'paged-stage';
  scroller.append(stage);
  root.append(scroller);

  const controller = new PreviewController(stage, { mode: 'paginated', paginationHost: new IsolatedPaginationHost() });
  const revision = 1;
  const paginateStarted = performance.now();
  const result = await controller.forceRenderIsolated(
    createPdfPreviewJob(compiled.html, captureCurrentPrintLayout(), RESOLVER),
    compiled.html,
    compiled.manifest,
    revision
  );
  const paginateMs = performance.now() - paginateStarted;
  if (result.status !== 'rendered') throw new Error(`Pagination did not render: ${result.status}`);

  const pages = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const layoutStarted = performance.now();
  const contentHeight = stage.getBoundingClientRect().height;
  const layoutMs = performance.now() - layoutStarted;

  const frameGaps: number[] = [];
  let last = await nextFrame();
  const steps = 300;
  const step = Math.max(1, Math.floor((scroller.scrollHeight - scroller.clientHeight) / steps));
  for (let index = 0; index < steps; index += 1) {
    scroller.scrollTop += step;
    const now = await nextFrame();
    frameGaps.push(now - last);
    last = now;
  }
  window.__HARNESS_RESULT__ = {
    ok: true,
    surface: 'pages',
    contain: CONTAIN_MODE,
    pages: pages.length,
    paginateMs: round(paginateMs),
    layoutMs: round(layoutMs),
    contentHeightPx: Math.round(contentHeight),
    frameP50Ms: round(percentile(frameGaps, 0.5)),
    frameP95Ms: round(percentile(frameGaps, 0.95)),
    frameMaxMs: round(Math.max(...frameGaps)),
    slowFrames: frameGaps.filter(gap => gap > 50).length
  };
}

async function run(): Promise<void> {
  if (SURFACE === 'pages') {
    await runPages();
    return;
  }
  const markdown = Array.from({ length: PAGES }, (_, index) => page(index + 1)).join('\n');
  const compiled = await compilePreviewDocument(markdown, RESOLVER, SETTINGS, { sourceLineOffset: 2 });

  const root = document.getElementById('root')!;
  const scroller = document.createElement('div');
  scroller.className = 'preview-scroll-container is-live-preview-scroll';
  scroller.style.height = '800px';
  scroller.style.overflow = 'auto';
  const stage = document.createElement('div');
  stage.className = 'paged-stage is-live-preview';
  scroller.append(stage);
  root.append(scroller);
  applyLiveDocumentStyle(DEFAULT_PAGE_SETUP);

  let renderer = new LivePreviewRenderer(stage);
  let exactHeights: number[] | null = null;
  if (CONTAIN_MODE === 'exact') {
    // Upper bound: measure every block's real height once, then render again with those heights as placeholders.
    containmentStyle.remove();
    renderer.render(compiled.html, compiled.manifest, DEFAULT_PAGE_SETUP, () => true);
    exactHeights = Array.from(stage.querySelectorAll<HTMLElement>('.live-preview-block')).map(node => node.getBoundingClientRect().height);
    stage.replaceChildren();
    renderer = new LivePreviewRenderer(stage);
    document.head.append(containmentStyle);
  }
  const renderStarted = performance.now();
  renderer.render(compiled.html, compiled.manifest, DEFAULT_PAGE_SETUP, () => true);
  if (exactHeights) {
    Array.from(stage.querySelectorAll<HTMLElement>('.live-preview-block')).forEach((node, index) => {
      node.style.containIntrinsicSize = `auto ${exactHeights![index] ?? 0}px`;
    });
  }
  const renderMs = performance.now() - renderStarted;
  const debugSample = exactHeights
    ? { heightSum: Math.round(exactHeights.reduce((sum, value) => sum + value, 0)), first: exactHeights[0], appliedFirst: stage.querySelector<HTMLElement>('.live-preview-block')?.style.containIntrinsicSize ?? null, appliedCount: stage.querySelectorAll<HTMLElement>('.live-preview-block[style*="contain-intrinsic-size"]').length }
    : null;
  const layoutStarted = performance.now();
  const contentHeight = stage.getBoundingClientRect().height;
  const layoutMs = performance.now() - layoutStarted;

  // Scroll through the whole document, one step per frame, and record the frame times.
  const frameGaps: number[] = [];
  let last = await nextFrame();
  const steps = 300;
  const step = Math.max(1, Math.floor((scroller.scrollHeight - scroller.clientHeight) / steps));
  for (let index = 0; index < steps; index += 1) {
    scroller.scrollTop += step;
    const now = await nextFrame();
    frameGaps.push(now - last);
    last = now;
  }

  window.__HARNESS_RESULT__ = {
    ok: true,
    contain: CONTAIN_MODE,
    pages: PAGES,
    sourceCharacters: markdown.length,
    blocks: stage.querySelectorAll('.live-preview-block').length,
    renderMs: round(renderMs),
    layoutMs: round(layoutMs),
    contentHeightPx: Math.round(contentHeight),
    frameP50Ms: round(percentile(frameGaps, 0.5)),
    frameP95Ms: round(percentile(frameGaps, 0.95)),
    frameMaxMs: round(Math.max(...frameGaps)),
    slowFrames: frameGaps.filter(gap => gap > 50).length,
    debugSample
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
