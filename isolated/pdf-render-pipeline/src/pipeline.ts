import { RENDER_PROGRESS_MESSAGE, type PaginationOutcome, type PdfRenderJob, type PipelineProgress } from './contracts';
import { IsolatedPaginationHost, type IsolatedPaginationHostOptions } from './host';
import { PdfPrintTarget, type PrintTimings } from './print-target';

export type PrintPipelineResult =
  | { readonly status: 'complete'; readonly pagination: Extract<PaginationOutcome, { status: 'success' }>; readonly print: PrintTimings }
  | Exclude<PaginationOutcome, { status: 'success' }>;

/** High-level facade. Keeping target creation outside preserves popup activation. */
export class PdfRenderPipeline {
  readonly #host: IsolatedPaginationHost;

  constructor(options: IsolatedPaginationHostOptions) {
    this.#host = new IsolatedPaginationHost(options);
  }

  paginate(
    job: PdfRenderJob,
    onProgress?: (progress: PipelineProgress) => void,
    signal?: AbortSignal
  ): Promise<PaginationOutcome> {
    return this.#host.requestArtifact(job, onProgress, signal);
  }

  async paginateAndPrint(
    job: PdfRenderJob,
    printTarget: PdfPrintTarget,
    onProgress?: (progress: PipelineProgress) => void,
    signal?: AbortSignal
  ): Promise<PrintPipelineResult> {
    const outcome = await this.paginate(job, onProgress, signal);
    if (outcome.status !== 'success') {
      printTarget.close();
      return outcome;
    }

    try {
      onProgress?.(printProgress(outcome, 'install-print-document'));
      const timings = await printTarget.print(outcome.artifact);
      onProgress?.(printProgress(outcome, 'print'));
      return Object.freeze({ status: 'complete', pagination: outcome, print: timings });
    } catch (error) {
      printTarget.close();
      throw error;
    }
  }
}

function printProgress(
  outcome: Extract<PaginationOutcome, { status: 'success' }>,
  phase: 'install-print-document' | 'print'
): PipelineProgress {
  return {
    type: RENDER_PROGRESS_MESSAGE,
    requestId: outcome.diagnostics.requestId,
    phase,
    pagesCompleted: outcome.artifact.pageCount,
    estimatedPages: outcome.diagnostics.budget.estimatedPages,
    elapsedMs: outcome.diagnostics.elapsedMs,
    timeoutMs: outcome.diagnostics.budget.timeoutMs
  };
}
