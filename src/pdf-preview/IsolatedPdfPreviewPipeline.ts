import { IsolatedPaginationHost } from './IsolatedPaginationHost';
import { PdfPreviewPrintTarget } from './PdfPreviewPrintTarget';
import { recordPdfPreviewDiagnostic } from './PdfPreviewDiagnosticsLog';
import type { PdfPreviewJob, PdfPreviewPaginationDiagnostics, PdfPreviewProgress } from './contracts';

export type PdfPreviewPipelineResult =
  | { status: 'cancelled'; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'complete'; diagnostics: PdfPreviewPaginationDiagnostics };

/** Dedicated isolated PDF preview workflow. */
export class IsolatedPdfPreviewPipeline {
  private readonly paginationHost = new IsolatedPaginationHost();

  async run(
    input: PdfPreviewJob,
    printTarget: PdfPreviewPrintTarget,
    onProgress?: (progress: PdfPreviewProgress) => void,
    signal?: AbortSignal
  ): Promise<PdfPreviewPipelineResult> {
    try {
      const outcome = await this.paginationHost.requestPrintArtifact(input, onProgress, signal);
      if (outcome.status === 'cancelled') {
        printTarget.close();
        return { status: 'cancelled', diagnostics: outcome.diagnostics };
      }
      if (outcome.status === 'timed-out' || outcome.status === 'failed') throw new Error(outcome.message);
      const result = outcome.result;
      if (result.pageCount === 0) throw new Error('PDF pagination produced no physical pages.');
      onProgress?.({ type: 'clear-writer-pdf-preview-progress', requestId: result.requestId, phase: 'install-print-document', pagesCompleted: result.pageCount, estimatedPages: outcome.diagnostics.budget.estimatedPages, elapsedMs: outcome.diagnostics.elapsedMs, timeoutMs: outcome.diagnostics.budget.timeoutMs });
      const printTimings = await printTarget.printArtifact(result.html, result.paginationCss);
      const diagnostics: PdfPreviewPaginationDiagnostics = {
        ...outcome.diagnostics,
        elapsedMs: outcome.diagnostics.elapsedMs + printTimings.installDocumentMs + printTimings.resourceReadinessMs + printTimings.printInvocationMs,
        timings: [
          ...outcome.diagnostics.timings,
          { phase: 'install-print-document', durationMs: printTimings.installDocumentMs + printTimings.resourceReadinessMs },
          { phase: 'print', durationMs: printTimings.printInvocationMs }
        ]
      };
      onProgress?.({ type: 'clear-writer-pdf-preview-progress', requestId: result.requestId, phase: 'print', pagesCompleted: result.pageCount, estimatedPages: diagnostics.budget.estimatedPages, elapsedMs: diagnostics.elapsedMs, timeoutMs: diagnostics.budget.timeoutMs });
      recordPdfPreviewDiagnostic({ status: 'success', result, diagnostics });
      return { status: 'complete', diagnostics };
    } catch (error) {
      printTarget.close();
      throw error;
    }
  }
}
