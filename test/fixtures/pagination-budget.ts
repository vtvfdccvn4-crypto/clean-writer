import { RenderEngine } from '../../src/preview/RenderEngine';
import type { PageSetup } from '../../src/types';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

const pageSetup: PageSetup = {
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 18,
  marginRight: 18
};

async function run() {
  const stage = document.getElementById('stage')!;
  const engine = new RenderEngine(stage, {
    renderTimeoutMs: 120_000,
    unthrottledPagination: true
  });

  await engine.runRender('<p>Pagination budget warmup.</p>', pageSetup, null, null);
  await nextFrame();
  await document.fonts.ready;

  const html = buildFivePageWorkload();
  const started = performance.now();
  await engine.runRender(html, pageSetup, null, null);
  const elapsedMs = performance.now() - started;
  const pageCount = stage.querySelectorAll('.pagedjs_page').length;

  window.__HARNESS_RESULT__ = {
    ok: true,
    pageCount,
    elapsedMs,
    hasLastSection: stage.textContent?.includes('Budget section 5') ?? false
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});

function buildFivePageWorkload() {
  return Array.from({ length: 5 }, (_, index) => {
    const sectionBreak = index === 0 ? '' : '<div class="section-break" aria-hidden="true">&nbsp;</div>\n';
    return [
      `<div class="document-section" data-section-index="${index}">`,
      sectionBreak,
      `<h1>Budget section ${index + 1}</h1>`,
      `<p>Controlled pagination workload ${index + 1} keeps the page height consistent and the section small.</p>`,
      `<p>This verifies the hidden-worker pagination path without letting a single section spill onto an extra page.</p>`,
      `</div>`
    ].join('');
  }).join('\n');
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}
