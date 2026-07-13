import { previewMetrics } from '../perf/preview-metrics';
import type { PdfExportDocument } from '../platform/types';

export interface ExportOrchestrationDependencies {
  compileSnapshot(): Promise<string>;
  paginateInBackground(html: string): Promise<{ status: 'rendered' | 'degraded' | 'stale'; error?: Error; html: string }>;
  getPageSetup(): PdfExportDocument['pageSetup'];
}

/** Coordinates a fresh durable export snapshot and background pagination. */
export class ExportOrchestrationController {
  private readonly dependencies: ExportOrchestrationDependencies;

  constructor(dependencies: ExportOrchestrationDependencies) {
    this.dependencies = dependencies;
  }

  async compilePaginatedSnapshot(): Promise<PdfExportDocument> {
    const exportStarted = performance.now();

    try {
      const snapshotStarted = performance.now();
      let html = await this.dependencies.compileSnapshot();
      previewMetrics.recordPdfExportPhase('snapshot', performance.now() - snapshotStarted);

      let rendered = false;
      let paginatedHtml = '';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          const retrySnapshotStarted = performance.now();
          html = await this.dependencies.compileSnapshot();
          previewMetrics.recordPdfExportPhase('snapshot', performance.now() - retrySnapshotStarted);
        }
        const paginationStarted = performance.now();
        const renderResult = await this.dependencies.paginateInBackground(html);
        previewMetrics.recordPdfExportPhase('pagination', performance.now() - paginationStarted);
        if (renderResult.status === 'rendered') {
          rendered = true;
          paginatedHtml = renderResult.html;
          break;
        }
        if (renderResult.status === 'degraded' || attempt === 1) {
          const detail = renderResult.error ? `: ${renderResult.error.message}` : '.';
          throw new Error(`PDF export pagination ${renderResult.status}${detail}`);
        }
      }
      if (!rendered) throw new Error('PDF export pagination did not commit a render.');
      const pageCount = (paginatedHtml.match(/\bpagedjs_page\b/g) ?? []).length;
      if (pageCount === 0) throw new Error('PDF export pagination produced no printable pages.');
      return {
        html: paginatedHtml,
        pageSetup: this.dependencies.getPageSetup(),
        isPaginated: true
      };
    } finally {
      previewMetrics.recordPdfExportPhase('orchestration-total', performance.now() - exportStarted);
    }
  }
}
