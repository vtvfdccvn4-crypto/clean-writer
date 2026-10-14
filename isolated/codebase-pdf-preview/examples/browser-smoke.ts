import { PdfPreviewPipeline } from '../src/pipeline';
import { mountPdfArtifact } from '../src/view';

const status = document.getElementById('status');
const preview = document.getElementById('preview');
if (!status || !preview) throw new Error('Smoke-test elements are missing.');

try {
  const pipeline = new PdfPreviewPipeline({
    frameUrl: new URL('./renderer.html', window.location.href),
    startupTimeoutMs: 10_000
  });
  const job = await pipeline.createTextJob({
    title: 'Isolated source preview',
    subtitle: 'Private-channel pagination smoke test',
    files: [
      {
        path: 'src/example.ts',
        language: 'TypeScript',
        text: ['export function example(value: string): string {', '  return value.trim();', '}', ''].join('\n')
      },
      {
        path: 'README.md',
        language: 'Markdown',
        text: '# Example\n\n' + 'Safe source text. '.repeat(320)
      }
    ]
  });
  const outcome = await pipeline.render(job);
  if (outcome.status !== 'success') throw new Error(outcome.status === 'cancelled' ? 'Unexpected cancellation.' : outcome.message);
  mountPdfArtifact(preview, outcome.artifact);
  status.dataset.result = 'success';
  status.dataset.pageCount = String(outcome.artifact.pageCount);
  status.dataset.renderId = outcome.artifact.renderId;
  status.textContent = `PASS: ${outcome.artifact.pageCount} pages`;
} catch (error) {
  status.dataset.result = 'failed';
  status.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
}
