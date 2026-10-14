import { createPdfRenderJob, PdfRenderPipeline } from '../src/index';

const status = document.getElementById('status');
if (!status) throw new Error('Smoke-test status element is missing.');

try {
  const pipeline = new PdfRenderPipeline({
    frameUrl: new URL('./renderer.html', window.location.href),
    frameStartupTimeoutMs: 10_000
  });
  const job = await createPdfRenderJob({
    html: '<article><h1 data-pdf-anchor="start">Independent renderer</h1><p>' + 'Reusable content. '.repeat(180) + '</p></article>',
    css: '@page { size: A4; margin: 18mm; } article { font: 11pt/1.5 system-ui; } h1 { break-after: avoid; }',
    artifactCss: '@media print { body { margin: 0; } }'
  });
  const outcome = await pipeline.paginate(job);
  if (outcome.status !== 'success') throw new Error(outcome.status === 'cancelled' ? 'Unexpected cancellation.' : outcome.message);
  status.dataset.result = 'success';
  status.dataset.pageCount = String(outcome.artifact.pageCount);
  status.dataset.renderId = outcome.artifact.renderId;
  status.textContent = `PASS: ${outcome.artifact.pageCount} physical page(s), immutable artifact ${outcome.artifact.renderId.slice(0, 12)}.`;
} catch (error) {
  status.dataset.result = 'failed';
  status.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
}
