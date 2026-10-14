import type { PdfRenderJob, RenderOutcome, RenderProgress } from './contracts';
import { PaginationHost, type PaginationHostOptions } from './host';
import { createPdfRenderJob, estimatePaginationBudget, PdfArtifactCache } from './model';
import { compileTextBundle, type CompileTextBundleInput } from './text-bundle';
import { PdfPrintTarget } from './view';

export interface PdfPreviewPipelineOptions extends PaginationHostOptions {
  readonly cacheEntries?: number;
}

export class PdfPreviewPipeline {
  readonly #host: PaginationHost;
  readonly #cache: PdfArtifactCache;

  constructor(options: PdfPreviewPipelineOptions) {
    this.#host = new PaginationHost(options);
    this.#cache = new PdfArtifactCache(options.cacheEntries ?? 3);
  }

  async createTextJob(input: CompileTextBundleInput): Promise<PdfRenderJob> {
    const compiled = compileTextBundle(input);
    return createPdfRenderJob({
      html: compiled.html,
      css: compiled.css,
      artifactCss: compiled.artifactCss,
      extensionIdentity: compiled.identity
    });
  }

  async render(
    job: PdfRenderJob,
    onProgress?: (progress: RenderProgress) => void,
    signal?: AbortSignal
  ): Promise<RenderOutcome> {
    const cached = this.#cache.get(job.renderId);
    if (cached) {
      return Object.freeze({
        status: 'success',
        artifact: cached,
        diagnostics: Object.freeze({
          requestId: `cache-${job.renderId.slice(0, 12)}`,
          budget: estimatePaginationBudget(job),
          elapsedMs: 0,
          pageCount: cached.pageCount,
          cacheHit: true
        })
      });
    }
    const outcome = await this.#host.render(job, onProgress, signal);
    if (outcome.status === 'success') this.#cache.set(outcome.artifact);
    return outcome;
  }

  async renderAndPrint(
    job: PdfRenderJob,
    target: PdfPrintTarget,
    onProgress?: (progress: RenderProgress) => void,
    signal?: AbortSignal
  ): Promise<RenderOutcome> {
    const outcome = await this.render(job, onProgress, signal);
    if (outcome.status !== 'success') {
      target.close();
      return outcome;
    }
    await target.print(outcome.artifact);
    return outcome;
  }

  clearCache(): void {
    this.#cache.clear();
  }
}
