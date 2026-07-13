import { previewMetrics } from '../perf/preview-metrics';
import type { PdfExportDocument } from '../platform/types';

export interface ExportOrchestrationDependencies {
  compileSnapshot(): Promise<string>;
  forceRender(html: string): Promise<{ status: 'rendered' | 'degraded' | 'stale'; error?: Error }>;
  pagedStage: HTMLElement;
  getCacheKey(): string;
  getPageSetup(): PdfExportDocument['pageSetup'];
}

/** Coordinates durable export snapshots, forced pagination, retries, and caching. */
export class ExportOrchestrationController {
  private readonly dependencies: ExportOrchestrationDependencies;
  private cache: { key: string; document: PdfExportDocument } | null = null;

  constructor(dependencies: ExportOrchestrationDependencies) {
    this.dependencies = dependencies;
  }

  invalidate(): void {
    this.cache = null;
  }

  async compilePaginatedSnapshot(): Promise<PdfExportDocument> {
    const exportStarted = performance.now();
    const cacheKey = this.dependencies.getCacheKey();
    if (this.cache?.key === cacheKey) {
      previewMetrics.recordPdfExportCache(true);
      previewMetrics.recordPdfExportPhase('orchestration-total', performance.now() - exportStarted);
      return this.cache.document;
    }
    previewMetrics.recordPdfExportCache(false);

    try {
      let rendered = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const snapshotStarted = performance.now();
        const html = await this.dependencies.compileSnapshot();
        previewMetrics.recordPdfExportPhase('snapshot', performance.now() - snapshotStarted);
        const paginationStarted = performance.now();
        const renderResult = await this.dependencies.forceRender(html);
        previewMetrics.recordPdfExportPhase('pagination', performance.now() - paginationStarted);
        if (renderResult.status === 'rendered') {
          rendered = true;
          break;
        }
        if (renderResult.status === 'degraded' || attempt === 1) {
          const detail = renderResult.error ? `: ${renderResult.error.message}` : '.';
          throw new Error(`PDF export pagination ${renderResult.status}${detail}`);
        }
      }
      if (!rendered) throw new Error('PDF export pagination did not commit a render.');
      const pageCount = this.dependencies.pagedStage.querySelectorAll('.pagedjs_page').length;
      if (pageCount === 0) throw new Error('PDF export pagination produced no printable pages.');
      const document: PdfExportDocument = {
        html: this.dependencies.pagedStage.innerHTML,
        pageSetup: this.dependencies.getPageSetup(),
        isPaginated: true
      };
      this.cache = this.dependencies.getCacheKey() === cacheKey ? { key: cacheKey, document } : null;
      return document;
    } finally {
      previewMetrics.recordPdfExportPhase('orchestration-total', performance.now() - exportStarted);
    }
  }
}
