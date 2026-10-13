import type { EditorManager } from '../ui/editor-manager';
import { PdfPreviewPrintTarget } from '../pdf-preview/PdfPreviewPrintTarget';
import { showNotice } from '../ui/components/Notice';

let pipelineLoader: Promise<typeof import('../pdf-preview/IsolatedPdfPreviewPipeline')> | undefined;

function loadPdfPreviewPipeline() {
  pipelineLoader ??= import('../pdf-preview/IsolatedPdfPreviewPipeline');
  return pipelineLoader;
}

export function setupPdfPreview(editorManager: EditorManager): void {
  const button = document.getElementById('btn-pdf-preview');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', async () => {
    const abortController = new AbortController();
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abortController.abort();
    };
    button.disabled = true;
    button.dataset.previewStatus = 'preparing';
    // Open the target synchronously during the click event so popup blockers
    // do not reject it while the PDF feature chunk is loading.
    const printTarget = PdfPreviewPrintTarget.open();
    if (!printTarget) {
      button.disabled = false;
      button.dataset.previewStatus = 'failed';
      showNotice('PDF preview was blocked. Allow popups for this site and try again.', 'error');
      return;
    }
    // Register cancellation before feature loading and snapshot compilation;
    // large documents can spend noticeable time in those preparatory phases.
    window.addEventListener('keydown', cancelOnEscape);
    try {
      const input = await abortable(editorManager.compilePdfPreviewInput(abortController.signal), abortController.signal);
      const preparedArtifact = editorManager.getPreparedPdfArtifact(input);
      if (preparedArtifact) {
        button.dataset.previewStatus = 'install-print-document';
        await printTarget.printArtifact(preparedArtifact);
        button.dataset.previewStatus = 'complete';
        return;
      }
      const { IsolatedPdfPreviewPipeline } = await loadPdfPreviewPipeline();
      const pipeline = new IsolatedPdfPreviewPipeline();
      const pipelineResult = await pipeline.run(input, printTarget, progress => {
        button.dataset.previewStatus = progress.phase;
        if (progress.pagesCompleted !== undefined) {
          const estimate = progress.estimatedPages ? ` of approximately ${progress.estimatedPages}` : '';
          const elapsed = progress.elapsedMs === undefined ? '' : ` (${Math.ceil(progress.elapsedMs / 1000)}s)`;
          button.title = `PDF preview: page ${progress.pagesCompleted}${estimate}${elapsed}`;
        }
      }, abortController.signal);
      button.dataset.previewStatus = pipelineResult.status;
    } catch (error) {
      printTarget.close();
      if (abortController.signal.aborted) {
        button.dataset.previewStatus = 'cancelled';
      } else {
        button.dataset.previewStatus = 'failed';
        console.error('PDF preview failed', error);
        showNotice(`PDF preview failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      window.removeEventListener('keydown', cancelOnEscape);
      button.disabled = false;
      window.setTimeout(() => {
        button.dataset.previewStatus = 'idle';
        button.title = 'PDF preview';
      }, 3000);
    }
  });
}

/** Returns promptly when the user cancels preparatory work that lacks native abort support. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('PDF preview was cancelled.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => finish(new DOMException('PDF preview was cancelled.', 'AbortError'));
    const finish = (error?: Error, value?: T) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value!);
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => finish(undefined, value), error => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
