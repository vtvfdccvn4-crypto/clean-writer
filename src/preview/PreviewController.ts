import type { PageSetup, TypographySetup, ListSetup, TableSetup, ImageSetup } from '../state';
import { DEFAULT_PAGE_SETUP } from '../config/defaults';
import type { RenderEngine, RenderEngineOptions, RenderResult } from './RenderEngine';
import { PreviewViewport } from './PreviewViewport';
import { previewMetrics } from '../perf/preview-metrics';

import type { AssetResolver } from '../platform/types';
import type { PreviewSourceManifestEntry } from '../compiler/rehype-plugins';
import { PreviewNavigationCoordinator } from './navigation/PreviewNavigationCoordinator';
import { LivePreviewRenderer } from './live/LivePreviewRenderer';
import type { CanonicalPageBreakGuide } from './live/LivePreviewRenderer';
import { LivePreviewIndex } from './live/LivePreviewIndex';
import { applyImagePreviewStyle, applyListPreviewStyle, applyLiveDocumentStyle, applyTablePreviewStyle, applyTypographyPreviewStyle } from './PreviewStyleManager';

export interface PreviewControllerOptions extends RenderEngineOptions {
  mode?: 'live' | 'paginated';
}

export class PreviewController {
  private container: HTMLElement;
  private scheduledRenderFrame: number | null = null;
  private assetResolver: AssetResolver;
  
  private paginatedEngine: RenderEngine | null = null;
  private paginatedEngineLoad: Promise<RenderEngine> | null = null;
  private readonly renderEngineOptions: RenderEngineOptions;
  private liveRenderer: LivePreviewRenderer | null;
  private mode: 'live' | 'paginated';
  private viewport: PreviewViewport;
  private navigation: PreviewNavigationCoordinator;

  private currentPageSetup: PageSetup = {
    ...DEFAULT_PAGE_SETUP
  };
  private currentTypographySetup: TypographySetup | null = null;
  private currentListSetup: ListSetup | null = null;
  private currentTableSetup: TableSetup | null = null;
  private lastCompiledHtml: string = '';
  private lastSourceManifest: readonly PreviewSourceManifestEntry[] = [];
  private lastSourceRevision: number | null = null;
  private liveRenderGeneration = 0;

  constructor(container: HTMLElement, assetResolver: AssetResolver, options: PreviewControllerOptions = {}) {
    this.container = container;
    this.assetResolver = assetResolver;
    this.mode = options.mode ?? 'live';
    this.renderEngineOptions = options;
    this.liveRenderer = this.mode === 'live' ? new LivePreviewRenderer(container) : null;
    this.container.classList.toggle('is-live-preview', this.mode === 'live');
    this.container.parentElement?.classList.toggle('is-live-preview-scroll', this.mode === 'live');
    if (this.mode === 'live') applyLiveDocumentStyle(this.currentPageSetup);
    this.viewport = new PreviewViewport(container, this.currentPageSetup);
    this.navigation = new PreviewNavigationCoordinator(target => {
      this.viewport.scrollElementToTop(target.element);
    });
    this.viewport.setupResponsiveZoom();
    this.viewport.updateZoomScale();
  }

  /**
   * Switches between the continuous editor companion and the physical-page
   * document view.  These modes intentionally do not share a renderer: the
   * former preserves block identity while typing, whereas the latter must let
   * Paged.js own the final print geometry.
   */
  public setMode(mode: 'live' | 'paginated'): void {
    if (this.mode === mode) return;

    this.invalidatePendingRender();
    this.mode = mode;
    this.liveRenderer = mode === 'live' ? new LivePreviewRenderer(this.container) : null;
    this.container.classList.toggle('is-live-preview', mode === 'live');
    this.container.parentElement?.classList.toggle('is-live-preview-scroll', mode === 'live');
    if (mode === 'live') applyLiveDocumentStyle(this.currentPageSetup);
    this.viewport.updateZoomScale();
  }

  public applyPageSetup(setup: PageSetup, renderCachedDocument = true) {
    if (JSON.stringify(this.currentPageSetup) === JSON.stringify(setup)) return;
    const previousSetup = this.currentPageSetup;
    this.currentPageSetup = setup;
    this.viewport.setPageSetup(setup);
    if (this.mode === 'live') applyLiveDocumentStyle(setup);
    const requiresLiveContentRefresh = this.mode === 'paginated'
      || previousSetup.toc?.maxLevel !== setup.toc?.maxLevel
      || JSON.stringify(previousSetup.specialHeadings ?? []) !== JSON.stringify(setup.specialHeadings ?? []);
    if (renderCachedDocument && requiresLiveContentRefresh && this.lastCompiledHtml) {
      this.forceRender(this.lastCompiledHtml, this.lastSourceManifest, this.lastSourceRevision);
    }
  }

  public applyTypographySetup(setup: TypographySetup) {
    this.currentTypographySetup = setup;
    applyTypographyPreviewStyle(setup);
  }

  public applyListSetup(setup: ListSetup) {
    this.currentListSetup = setup;
    applyListPreviewStyle(setup);
  }

  public applyTableSetup(setup: TableSetup) {
    this.currentTableSetup = setup;
    applyTablePreviewStyle(setup);
  }

  public applyImageSetup(_setup: ImageSetup) {
    applyImagePreviewStyle();
  }

  /** Apply physical-page guides calculated by the isolated paginator. */
  public setCanonicalPageBreakGuides(guides: readonly CanonicalPageBreakGuide[]): void {
    this.liveRenderer?.setPageBreakGuides(guides);
  }

  /** Reads boundaries from the most recent visible paginated render. */
  public getPaginatedPageBreakGuides(): CanonicalPageBreakGuide[] {
    return (this.paginatedEngine?.getCommittedPreviewIndex()?.getPageBreakTargets() ?? []).map(target => ({
      pageNumber: target.pageIndex + 1,
      anchor: target.entry.anchor,
      sourceLine: target.entry.range.startLine
    }));
  }

  public clear() {
    this.invalidatePendingRender();
    this.lastCompiledHtml = '';
    this.lastSourceManifest = [];
    this.lastSourceRevision = null;
    this.paginatedEngine?.clearCommittedPreviewIndex();
    if (this.liveRenderer) this.liveRenderer.clear();
    else this.container.replaceChildren();
  }

  /** Cancels superseded work without changing the cached document. */
  public invalidatePendingRender() {
    if (this.mode === 'paginated') this.invalidatePaginatedEngine();
    else this.liveRenderGeneration += 1;
    if (this.scheduledRenderFrame !== null) {
      window.cancelAnimationFrame(this.scheduledRenderFrame);
      this.scheduledRenderFrame = null;
    }
    this.navigation.clear();
  }

  /** Clears the visible stage before an independently prepared replacement. */
  public clearVisiblePreview() {
    this.invalidatePendingRender();
    this.paginatedEngine?.clearCommittedPreviewIndex();
    if (this.liveRenderer) this.liveRenderer.clear();
    else this.container.replaceChildren();
    this.container.parentElement?.scrollTo({ top: 0, behavior: 'auto' });
  }

  /** Schedules the one authoritative preview render for newly compiled HTML. */
  public scheduleRender(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ): void {
    // In paginated mode an edit supersedes Paged.js work. Live mode has no
    // background paginator and only reconciles the latest compiled blocks.
    if (this.mode === 'paginated') this.invalidatePaginatedEngine();
    else this.liveRenderGeneration += 1;
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    if (this.scheduledRenderFrame !== null) window.cancelAnimationFrame(this.scheduledRenderFrame);
    this.scheduledRenderFrame = window.requestAnimationFrame(async () => {
      this.scheduledRenderFrame = null;
      const started = performance.now();
      const result = await this.render(html, sourceManifest).catch(error => {
        console.error(error);
        return null;
      });
      if (result) this.commitNavigation(sourceRevision, result);
      previewMetrics.recordPreviewRender('exact-lane', performance.now() - started);
    });
  }

  public async forceRender(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ): Promise<RenderResult> {
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;
    if (this.scheduledRenderFrame !== null) {
      window.cancelAnimationFrame(this.scheduledRenderFrame);
      this.scheduledRenderFrame = null;
    }
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    else this.navigation.clear();

    const started = performance.now();
    try {
      const result = await this.render(html, sourceManifest);
      this.commitNavigation(sourceRevision, result);
      previewMetrics.recordPreviewRender('force-render', performance.now() - started);
      return result;
    } catch (error) {
      previewMetrics.recordPreviewRender('force-render', performance.now() - started);
      console.error(error);
      return {
        status: 'degraded',
        pageCount: 0,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  public scrollToTop() {
    this.viewport.scrollToTop();
  }

  public navigateToSourceLine(line: number, sourceRevision: number) {
    this.navigation.requestNavigation(line, sourceRevision);
  }

  private async render(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[]
  ): Promise<RenderResult> {
    if (this.mode === 'paginated') {
      this.viewport.updateZoomScale();
      const engine = await this.getPaginatedEngine();
      return engine.runRender(html, this.currentPageSetup, this.assetResolver, this.currentTypographySetup, this.currentListSetup, this.currentTableSetup, sourceManifest);
    }

    const generation = ++this.liveRenderGeneration;
    const document = await this.liveRenderer!.render(
      html,
      sourceManifest,
      this.currentPageSetup,
      () => generation === this.liveRenderGeneration
    );
    if (!document) return { status: 'stale', pageCount: 0 };
    return { status: 'rendered', pageCount: document.blocks.length };
  }

  private commitNavigation(sourceRevision: number | null, result: RenderResult): void {
    if (sourceRevision === null || result.status !== 'rendered') return;
    const index = this.mode === 'live'
      ? LivePreviewIndex.build(this.container, this.liveRenderer!.document!)
      : this.paginatedEngine?.getCommittedPreviewIndex();
    if (index) this.navigation.commitRender(sourceRevision, index);
  }

  private async getPaginatedEngine(): Promise<RenderEngine> {
    if (this.paginatedEngine) return this.paginatedEngine;
    if (!this.paginatedEngineLoad) {
      this.paginatedEngineLoad = import('./RenderEngine').then(({ RenderEngine }) => {
        const engine = new RenderEngine(this.container, this.renderEngineOptions);
        this.paginatedEngine = engine;
        return engine;
      });
    }
    return this.paginatedEngineLoad;
  }

  private invalidatePaginatedEngine(): void {
    this.paginatedEngine?.invalidate();
  }
}
