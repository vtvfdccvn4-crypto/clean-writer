import { compileMarkdown, compilePreviewDocument } from '../compiler';
import type { CompiledPreview } from '../compiler';
import { scanCustomBlockStyleIcons, scanMarkdownForImages } from '../services/ExportSnapshotService';
import { PreviewController } from '../preview';
import { previewMetrics } from '../perf/preview-metrics';
import type { AssetResolver } from '../platform/types';
import type { ImageSetup, ListSetup, PageSetup, TableSetup, TypographySetup } from '../types';
import { IncrementalPreviewCompiler } from '../preview/live/IncrementalPreviewCompiler';
import type { CanonicalPageBreakGuide } from '../preview/live/LivePreviewRenderer';

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
  private readonly preparedPreviewAssets = new Set<string>();
  private readonly incrementalCompiler = new IncrementalPreviewCompiler();

  constructor(stage: HTMLElement, assetResolver: AssetResolver) {
    this.assetResolver = assetResolver;
    this.controller = new PreviewController(stage, assetResolver);
  }

  get currentRevision(): number {
    return this.revision;
  }

  beginRevision(): number {
    this.revision += 1;
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

  clear(): void {
    this.beginRevision();
    this.preparedPreviewAssets.clear();
    this.incrementalCompiler.reset();
    this.controller.clear();
  }

  clearVisiblePreview(): void {
    this.controller.clearVisiblePreview();
  }


  async compileDocument(markdown: string, metricKind: 'single-document-edit' | 'single-document-load'): Promise<CompiledPreview> {
    await this.preparePreviewAssets(markdown);
    const started = performance.now();
    const compiled = await compilePreviewDocument(markdown, this.assetResolver, { sourceLineOffset: 2 });
    previewMetrics.recordPreviewCompile(metricKind, performance.now() - started);
    return compiled;
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

  async compileFullDocument(markdown: string): Promise<string> {
    const started = performance.now();
    const compiled = await compileMarkdown(markdown, this.assetResolver);
    previewMetrics.recordPreviewCompile('full-document', performance.now() - started);
    return compiled;
  }

  publish(compiled: CompiledPreview, revision: number): void {
    this.controller.scheduleRender(compiled.html, compiled.manifest, revision);
  }

  forceRender(html: string, manifest: readonly import('../compiler/rehype-plugins').PreviewSourceManifestEntry[] = [], revision: number | null = null) {
    return this.controller.forceRender(html, manifest, revision);
  }

  scrollToTop(): void {
    this.controller.scrollToTop();
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
      await this.preparePreviewAssets(request.markdown);
      let compiled: CompiledPreview | null = null;
      try {
        compiled = await this.incrementalCompiler.compile(request.markdown, this.assetResolver);
      } catch (error) {
        console.warn('[PreviewCoordinator] Incremental compile fell back to a full document.', error);
      }
      if (!compiled) {
        this.incrementalCompiler.reset();
        compiled = await compilePreviewDocument(request.markdown, this.assetResolver, { sourceLineOffset: 2 });
      }
      previewMetrics.recordPreviewCompile('single-document-edit', performance.now() - started);
      request.resolve(request.generation === this.liveCompileGeneration ? compiled : null);
    } catch (error) {
      if (request.generation === this.liveCompileGeneration) {
        request.reject(error);
      } else {
        request.resolve(null);
      }
    } finally {
      this.liveCompileRunning = false;
      if (this.pendingLiveCompile) this.scheduleLiveCompile();
    }
  }

  private async preparePreviewAssets(markdown: string): Promise<void> {
    const requestedAssets = [...scanMarkdownForImages(markdown), ...scanCustomBlockStyleIcons()];
    const assetsToPrepare = requestedAssets.filter(asset => !this.preparedPreviewAssets.has(asset));
    if (assetsToPrepare.length === 0) return;
    await this.assetResolver.preloadImages(assetsToPrepare);
    assetsToPrepare.forEach(asset => this.preparedPreviewAssets.add(asset));
  }
}
