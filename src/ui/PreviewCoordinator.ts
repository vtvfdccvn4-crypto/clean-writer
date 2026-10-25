import { compilePreviewDocument } from '../compiler';
import type { CompiledPreview, DocumentCompileSettings } from '../compiler';
import { preloadDocumentAssets } from '../services/ExportSnapshotService';
import { PreviewController } from '../preview';
import { CompileClient, isAbortError, type CompileOutcome } from '../workers/CompileClient';
import { createCompileWorkerClient } from '../workers/compile-client-factory';
import { buildCompileAssets } from '../workers/compile-assets';
import { isCompileWorkerEnabled } from '../config/feature-flags';
import type { CompileJob } from '../workers/compile-protocol';
import { previewMetrics } from '../perf/preview-metrics';
import type { AssetResolver } from '../platform/types';
import type { ImageSetup, ListSetup, PageSetup, TableSetup, TypographySetup } from '../types';
import type { CanonicalPageBreakGuide } from '../preview/live/LivePreviewRenderer';
import type { DocumentPreviewSourceSegment } from '../preview/document-rendering';
import type { PdfPreviewFrameTimings, PdfPreviewJob } from '../pdf-preview/contracts';
import type { PdfArtifact } from '../pdf-preview/PdfArtifact';
import type { PdfArtifactKey } from '../pdf-preview/PdfRenderSnapshot';
import type { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';
import type { CommittedPreviewTarget } from '../preview/navigation/CommittedPreviewIndex';
import type { PreviewTimingPhase } from '../perf/preview-timing';
import type { PreviewPageTiming } from '../perf/preview-timing';

/** Owns preview revisions, compilation, asset preparation, and render lanes. */
export class PreviewCoordinator {
  private readonly controller: PreviewController;
  private revision = 0;
  private readonly assetResolver: AssetResolver;
  private pendingLiveCompile: {
    markdown: string;
    resolve: (value: CompiledPreview | null) => void;
    reject: (reason?: unknown) => void;
    generation: number;
  } | null = null;
  private liveCompileFrame: number | null = null;
  private liveCompileGeneration = 0;
  private liveCompileRunning = false;
  private paginatedRefreshFrame: number | null = null;
  private readonly getCompileSettings: () => DocumentCompileSettings;
  /** Set only when the compile-worker flag is on; the live path stays on the page. */
  private readonly compileClient: CompileClient | null;

  constructor(
    stage: HTMLElement,
    assetResolver: AssetResolver,
    getCompileSettings: () => DocumentCompileSettings,
    onPreviewSourceClick?: (line: number) => void,
    onPreviewSourceTargetClick?: (target: CommittedPreviewTarget) => void,
    createIsolatedJob?: (sourceHtml: string, pageSetup: PageSetup) => PdfPreviewJob,
    paginationHost?: IsolatedPaginationHost
  ) {
    this.assetResolver = assetResolver;
    this.getCompileSettings = getCompileSettings;
    this.compileClient = isCompileWorkerEnabled()
      ? createCompileWorkerClient(job => this.compileOnPage(job))
      : null;
    this.controller = new PreviewController(stage, {
      onPreviewSourceClick,
      onPreviewSourceTargetClick,
      createIsolatedJob,
      paginationHost
    });
  }

  get currentRevision(): number {
    return this.revision;
  }

  beginRevision(): number {
    this.revision += 1;
    this.cancelPaginatedRefresh();
    this.controller.invalidatePendingRender();
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  /** Select the presentation appropriate for the active workspace view. */
  setMode(mode: 'live' | 'paginated'): void {
    this.controller.setMode(mode);
  }

  applyPageSetup(setup: PageSetup, renderCachedDocument = true): void {
    this.controller.applyPageSetup(setup, renderCachedDocument);
  }

  applyTypographySetup(setup: TypographySetup): void {
    this.controller.applyTypographySetup(setup);
  }

  applyListSetup(setup: ListSetup): void {
    this.controller.applyListSetup(setup);
  }

  applyTableSetup(setup: TableSetup): void {
    this.controller.applyTableSetup(setup);
  }

  applyImageSetup(setup: ImageSetup): void {
    this.controller.applyImageSetup(setup);
  }

  refreshPaginatedPreview(): void {
    this.controller.refreshPaginatedPreview();
  }

  /** Coalesce back-to-back settings changes into one paginated re-render per animation frame. */
  schedulePaginatedRefresh(): void {
    if (this.paginatedRefreshFrame !== null) return;
    this.paginatedRefreshFrame = window.requestAnimationFrame(() => {
      this.paginatedRefreshFrame = null;
      this.controller.refreshPaginatedPreview();
    });
  }

  clear(): void {
    this.beginRevision();
    this.controller.clear();
  }

  clearVisiblePreview(): void {
    this.controller.clearVisiblePreview();
  }

  /** Releases scheduled compilation and browser-owned preview resources. */
  dispose(): void {
    this.compileClient?.dispose();
    this.liveCompileGeneration += 1;
    if (this.liveCompileFrame !== null) window.cancelAnimationFrame(this.liveCompileFrame);
    this.liveCompileFrame = null;
    this.cancelPaginatedRefresh();
    this.pendingLiveCompile?.resolve(null);
    this.pendingLiveCompile = null;
    this.controller.dispose();
  }


  async compileDocument(markdown: string, metricKind: 'single-document-edit' | 'single-document-load'): Promise<CompiledPreview> {
    const settings = this.getCompileSettings();
    await preloadDocumentAssets(markdown, this.assetResolver, settings.customBlockStyles);
    const started = performance.now();
    const compiled = await this.compileOnPreferredThread(markdown, settings, { lane: 'single', sourceLineOffset: 2 });
    previewMetrics.recordPreviewCompile(metricKind, performance.now() - started);
    return compiled;
  }

  /**
   * Runs a compile on the worker when the flag is on, otherwise on this thread.
   * A superseded worker compile rejects with an AbortError, which callers treat as
   * a stale result.
   */
  private async compileOnPreferredThread(
    markdown: string,
    settings: DocumentCompileSettings,
    options: {
      readonly lane: string;
      readonly sourceLineOffset?: number;
      readonly sourceSegments?: readonly DocumentPreviewSourceSegment[];
      readonly onPhase?: (phase: Extract<PreviewTimingPhase, `compile-${string}`>, durationMs: number) => void;
    }
  ): Promise<CompiledPreview> {
    if (!this.compileClient) {
      return compilePreviewDocument(markdown, this.assetResolver, settings, {
        sourceLineOffset: options.sourceLineOffset,
        sourceSegments: options.sourceSegments,
        onPhase: options.onPhase
      });
    }
    const outcome = await this.compileClient.compile({
      lane: options.lane,
      markdown,
      settings,
      assets: buildCompileAssets(markdown, settings.customBlockStyles, this.assetResolver),
      sourceLineOffset: options.sourceLineOffset ?? 0,
      sourceSegments: options.sourceSegments
    });
    for (const [phase, durationMs] of Object.entries(outcome.phases)) {
      options.onPhase?.(phase as Extract<PreviewTimingPhase, `compile-${string}`>, durationMs ?? 0);
    }
    return outcome.compiled;
  }

  /** The page-side fallback for a worker job, with the page's own asset resolver. */
  private async compileOnPage(job: CompileJob): Promise<CompileOutcome> {
    const compiled = await compilePreviewDocument(job.markdown, this.assetResolver, job.settings, {
      sourceLineOffset: job.sourceLineOffset,
      sourceSegments: job.sourceSegments
    });
    return { compiled, cacheHit: false, phases: {} };
  }

  /**
   * Coalesce rapid editor changes before they enter the compiler. A completed
   * obsolete compile is harmless, but it never reaches the preview renderer.
   */
  compileLatestDocument(markdown: string): Promise<CompiledPreview | null> {
    const generation = ++this.liveCompileGeneration;
    if (this.pendingLiveCompile) this.pendingLiveCompile.resolve(null);

    return new Promise((resolve, reject) => {
      this.pendingLiveCompile = { markdown, resolve, reject, generation };
      this.scheduleLiveCompile();
    });
  }

  async compileFullDocument(
    markdown: string,
    sourceSegments: readonly DocumentPreviewSourceSegment[] = [],
    onPhase?: (phase: Extract<PreviewTimingPhase, `compile-${string}`>, durationMs: number) => void
  ): Promise<CompiledPreview> {
    const started = performance.now();
    const compiled = await this.compileOnPreferredThread(markdown, this.getCompileSettings(), { lane: 'full', sourceSegments, onPhase });
    previewMetrics.recordPreviewCompile('full-document', performance.now() - started);
    return compiled;
  }

  publish(compiled: CompiledPreview, revision: number): void {
    this.controller.scheduleRender(compiled.html, compiled.manifest, revision);
  }

  forceRender(html: string, manifest: readonly import('../compiler/rehype-plugins').PreviewSourceManifestEntry[] = [], revision: number | null = null) {
    return this.controller.forceRender(html, manifest, revision);
  }

  forceRenderIsolated(
    input: PdfPreviewJob,
    sourceHtml: string,
    manifest: readonly import('../compiler/rehype-plugins').PreviewSourceManifestEntry[] = [],
    revision: number | null = null,
    onPaginationPhase?: (phase: PreviewTimingPhase, durationMs: number) => void,
    onPageTimings?: (pageTimings: readonly PreviewPageTiming[]) => void,
    onPaginationStats?: (stats: Pick<PdfPreviewFrameTimings, 'paginationCssCharacterCount' | 'paginationStyleCount'>) => void
  ) {
    return this.controller.forceRenderIsolated(input, sourceHtml, manifest, revision, onPaginationPhase, onPageTimings, onPaginationStats);
  }

  getPdfArtifact(artifactKey: PdfArtifactKey): PdfArtifact | null {
    return this.controller.getPdfArtifact(artifactKey);
  }

  scrollToTop(): void {
    this.controller.scrollToTop();
  }

  setViewportResizeSuspended(suspended: boolean): void {
    this.controller.setViewportResizeSuspended(suspended);
  }

  navigateToSourceLine(line: number): void {
    this.controller.navigateToSourceLine(line, this.revision);
  }

  setCanonicalPageBreakGuides(guides: readonly CanonicalPageBreakGuide[]): void {
    this.controller.setCanonicalPageBreakGuides(guides);
  }

  getPaginatedPageBreakGuides(): CanonicalPageBreakGuide[] {
    return this.controller.getPaginatedPageBreakGuides();
  }

  private cancelPaginatedRefresh(): void {
    if (this.paginatedRefreshFrame === null) return;
    window.cancelAnimationFrame(this.paginatedRefreshFrame);
    this.paginatedRefreshFrame = null;
  }

  private scheduleLiveCompile(): void {
    if (this.liveCompileRunning || this.liveCompileFrame !== null) return;
    this.liveCompileFrame = window.requestAnimationFrame(() => {
      this.liveCompileFrame = null;
      void this.runLatestCompile();
    });
  }

  private async runLatestCompile(): Promise<void> {
    const request = this.pendingLiveCompile;
    if (!request) return;
    this.pendingLiveCompile = null;
    this.liveCompileRunning = true;
    try {
      const started = performance.now();
      const settings = this.getCompileSettings();
      await preloadDocumentAssets(request.markdown, this.assetResolver, settings.customBlockStyles);
      // The full compile is the only live output. Its result is correct for
      // every document, including fences and definitions that span blocks.
      const compiled = await this.compileOnPreferredThread(request.markdown, settings, { lane: 'live', sourceLineOffset: 2 });
      previewMetrics.recordPreviewCompile('single-document-edit', performance.now() - started);
      request.resolve(request.generation === this.liveCompileGeneration ? compiled : null);
    } catch (error) {
      // A worker compile superseded by a newer edit is not a failure.
      if (isAbortError(error)) {
        request.resolve(null);
      } else if (request.generation === this.liveCompileGeneration) {
        request.reject(error);
      } else {
        request.resolve(null);
      }
    } finally {
      this.liveCompileRunning = false;
      if (this.pendingLiveCompile) this.scheduleLiveCompile();
    }
  }

}
