import { createPdfRenderJob, PdfPrintTarget, PdfRenderPipeline } from '../src/index';

const pipeline = new PdfRenderPipeline({ frameUrl: new URL('./renderer.html', import.meta.url) });

export async function printExample(): Promise<void> {
  // Open synchronously inside the click event so popup blockers allow it.
  const target = PdfPrintTarget.open({ title: 'Example document' });
  if (!target) throw new Error('The browser blocked the PDF preview window.');

  const job = await createPdfRenderJob({
    html: '<article><h1 data-pdf-anchor="start">Example</h1><p>Printable content.</p></article>',
    css: '@page { size: A4; margin: 20mm; } body { font: 11pt system-ui; }',
    artifactCss: '@media print { body { margin: 0; } }'
  });
  const result = await pipeline.paginateAndPrint(job, target);
  if (result.status !== 'complete' && result.status !== 'cancelled') throw new Error(result.message);
}
