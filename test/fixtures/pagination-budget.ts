import { paginateIsolated } from './helpers/isolated-pagination.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

async function run() {
  const html = buildFivePageWorkload();
  const started = performance.now();
  const outcome = await paginateIsolated(html);
  const elapsedMs = performance.now() - started;
  const pageCount = outcome.status === 'success' ? outcome.result.artifact.pageCount : 0;

  window.__HARNESS_RESULT__ = {
    ok: outcome.status === 'success',
    pageCount,
    elapsedMs,
    hasLastSection: outcome.status === 'success' && outcome.result.artifact.html.includes('Budget section 5'),
    paginationStatus: outcome.status,
    diagnostics: outcome.diagnostics
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
      `<p>This verifies the isolated pagination path without letting a single section spill onto an extra page.</p>`,
      `</div>`
    ].join('');
  }).join('\n');
}
