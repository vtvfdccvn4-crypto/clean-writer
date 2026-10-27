import type { PageSetup, TypographySetup, ListSetup, TableSetup, ImageSetup } from '../types';
import { DEFAULT_PAGE_SETUP } from '../config/defaults';
import type { RenderResult } from './contracts';
import { PreviewViewport } from './PreviewViewport';
import { previewMetrics } from '../perf/preview-metrics';

import type { PreviewSourceManifestEntry } from '../compiler/rehype-plugins';
import type { PdfPreviewFrameTimings, PdfPreviewJob } from '../pdf-preview/contracts';
import { PdfArtifactStore } from '../pdf-preview/PdfArtifactStore';
import { renderPdfArtifactContent, createPdfArtifactStyle } from '../pdf-preview/PdfArtifactRenderer';
import type { PdfArtifact } from '../pdf-preview/PdfArtifact';
import type { PdfArtifactKey } from '../pdf-preview/PdfRenderSnapshot';
import { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';
import { PreviewNavigationCoordinator } from './navigation/PreviewNavigationCoordinator';
import { PreviewClickNavigator } from './navigation/PreviewClickNavigator';
import { CommittedPreviewIndex, type CommittedPreviewTarget } from './navigation/CommittedPreviewIndex';
import { LivePreviewRenderer } from './live/LivePreviewRenderer';
import type { CanonicalPageBreakGuide } from './live/LivePreviewRenderer';
import { LivePreviewIndex } from './live/LivePreviewIndex';
import { applyImagePreviewStyle, applyListPreviewStyle, applyLiveDocumentStyle, applyTablePreviewStyle, applyTypographyPreviewStyle } from './PreviewStyleManager';
import type { PreviewTimingPhase } from '../perf/preview-timing';
import type { PreviewPageTiming } from '../perf/preview-timing';
import { adjacentHeadingIndex } from './navigation/pageNavigation';

/** The line, in pixels from the top of the scroll area, that a scrolled-to heading or page is aligned to. Matches PreviewViewport. */
const NAVIGATION_TOP_INSET = 12;

export interface PreviewControllerOptions {
  mode?: 'live' | 'paginated';
  /** Handles a source-block click in the committed preview. */
  onPreviewSourceClick?: (line: number) => void;
  /** Supplies the full source target for cross-section full-document clicks. */
  onPreviewSourceTargetClick?: (target: CommittedPreviewTarget) => void;
  /** Rebuilds the isolated print job when physical page settings change. */
  createIsolatedJob?: (sourceHtml: string, pageSetup: PageSetup) => PdfPreviewJob;
  /** Shared editor host used to serialize visible preview and guide jobs. */
  paginationHost?: IsolatedPaginationHost;
}

export class PreviewController {
  private container: HTMLElement;
  private scheduledRenderFrame: number | null = null;
  private readonly createIsolatedJob: PreviewControllerOptions['createIsolatedJob'];
  private readonly isolatedPaginationHost: IsolatedPaginationHost;
  private isolatedRenderAbortController: AbortController | null = null;
  private isolatedCommittedPreviewIndex: CommittedPreviewIndex | null = null;
  private isolatedPaginationStyle: HTMLStyleElement | null = null;
  private liveRenderer: LivePreviewRenderer | null;
  private mode: 'live' | 'paginated';
  private viewport: PreviewViewport;
  private navigation: PreviewNavigationCoordinator;
  private clickNavigation: PreviewClickNavigator;
  private readonly pageIndicator: HTMLOutputElement | null;
  private readonly previewScrollParent: HTMLElement | null;
  private pageIndicatorFrame: number | null = null;
  private pageIndicatorGeometry: number[] = [];
  private pageIndicatorGeometryDirty = true;
  private disposed = false;

  private currentPageSetup: PageSetup = {
    ...DEFAULT_PAGE_SETUP
  };
  private lastCompiledHtml: string = '';
  private lastSourceManifest: readonly PreviewSourceManifestEntry[] = [];
  private lastSourceRevision: number | null = null;
  private liveRenderGeneration = 0;
  private readonly pdfArtifacts = new PdfArtifactStore();

  constructor(container: HTMLElement, options: PreviewControllerOptions = {}) {
    this.container = container;
    this.mode = options.mode ?? 'live';
    this.createIsolatedJob = options.createIsolatedJob;
    this.isolatedPaginationHost = options.paginationHost ?? new IsolatedPaginationHost();
    this.isolatedPaginationHost.prewarm();
    this.liveRenderer = this.mode === 'live' ? new LivePreviewRenderer(container) : null;
    this.container.classList.toggle('is-live-preview', this.mode === 'live');
    this.container.parentElement?.classList.toggle('is-live-preview-scroll', this.mode === 'live');
    this.previewScrollParent = this.container.parentElement;
    this.pageIndicator = document.getElementById('preview-page-indicator') as HTMLOutputElement | null;
    this.previewScrollParent?.addEventListener('scroll', this.handlePreviewScroll, { passive: true });
    window.addEventListener('resize', this.handleWindowResize, { passive: true });
    if (this.mode === 'live') applyLiveDocumentStyle(this.currentPageSetup);
    this.viewport = new PreviewViewport(container, this.currentPageSetup);
    this.navigation = new PreviewNavigationCoordinator(target => {
      this.viewport.scrollElementToTop(target.element);
    });
    this.clickNavigation = new PreviewClickNavigator(container, (line, target) => {
      if (target.entry.filePath && options.onPreviewSourceTargetClick) {
        options.onPreviewSourceTargetClick(target);
      } else {
        options.onPreviewSourceClick?.(line);
      }
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
    if (mode === 'live') this.clearIsolatedPaginationStyle();
    this.container.classList.toggle('is-live-preview', mode === 'live');
    this.container.parentElement?.classList.toggle('is-live-preview-scroll', mode === 'live');
    this.updatePageIndicator();
    if (mode === 'live') applyLiveDocumentStyle(this.currentPageSetup);
    this.viewport.updateZoomScale();
  }

  /** Returns only an artifact whose full compiled input exactly matches the caller's job. */
  public getPdfArtifact(artifactKey: PdfArtifactKey): PdfArtifact | null {
    return this.pdfArtifacts.get(artifactKey);
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
      if (this.mode === 'paginated' && this.createIsolatedJob) {
        void this.forceRenderIsolated(
          this.createIsolatedJob(this.lastCompiledHtml, setup),
          this.lastCompiledHtml,
          this.lastSourceManifest,
          this.lastSourceRevision
        );
      } else {
        this.forceRender(this.lastCompiledHtml, this.lastSourceManifest, this.lastSourceRevision);
      }
    }
  }

  public applyTypographySetup(setup: TypographySetup) {
    applyTypographyPreviewStyle(setup);
  }

  public applyListSetup(setup: ListSetup) {
    applyListPreviewStyle(setup);
  }

  public applyTableSetup(setup: TableSetup) {
    applyTablePreviewStyle(setup);
  }

  public applyImageSetup(_setup: ImageSetup) {
    applyImagePreviewStyle();
  }

  /** Rebuilds the final preview when a print-layout input outside PageSetup changes. */
  public refreshPaginatedPreview(): void {
    if (this.mode !== 'paginated' || !this.createIsolatedJob || !this.lastCompiledHtml) return;
    void this.forceRenderIsolated(
      this.createIsolatedJob(this.lastCompiledHtml, this.currentPageSetup),
      this.lastCompiledHtml,
      this.lastSourceManifest,
      this.lastSourceRevision
    );
  }

  /** Apply physical-page guides calculated by the isolated paginator. */
  public setCanonicalPageBreakGuides(guides: readonly CanonicalPageBreakGuide[]): void {
    this.liveRenderer?.setPageBreakGuides(guides);
  }

  /** Reads boundaries from the most recent visible paginated render. */
  public getPaginatedPageBreakGuides(): CanonicalPageBreakGuide[] {
    const index = this.isolatedCommittedPreviewIndex;
    return (index?.getPageBreakTargets() ?? []).map(target => ({
      pageNumber: target.pageIndex + 1,
      anchor: target.entry.anchor,
      sourceLine: target.entry.range.startLine
    }));
  }

  public clear() {
    this.invalidatePendingRender();
    this.pdfArtifacts.clear();
    this.lastCompiledHtml = '';
    this.lastSourceManifest = [];
    this.lastSourceRevision = null;
    this.isolatedCommittedPreviewIndex = null;
    this.clearIsolatedPaginationStyle();
    this.pageIndicatorGeometry = [];
    this.pageIndicatorGeometryDirty = true;
    if (this.liveRenderer) this.liveRenderer.clear();
    else this.container.replaceChildren();
    this.updatePageIndicator();
  }

  /** Releases browser-owned preview resources when the application host is torn down. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidatePendingRender();
    if (this.pageIndicatorFrame !== null) window.cancelAnimationFrame(this.pageIndicatorFrame);
    this.pageIndicatorFrame = null;
    this.previewScrollParent?.removeEventListener('scroll', this.handlePreviewScroll);
    window.removeEventListener('resize', this.handleWindowResize);
    this.clickNavigation.destroy();
    this.viewport.dispose();
    this.liveRenderer?.clear();
    this.clearIsolatedPaginationStyle();
    this.isolatedPaginationHost.dispose();
  }

  /** Cancels superseded work without changing the cached document. */
  public invalidatePendingRender() {
    this.isolatedRenderAbortController?.abort();
    this.isolatedRenderAbortController = null;
    this.liveRenderGeneration += 1;
    this.cancelScheduledRender();
    this.navigation.clear();
    this.clickNavigation.setIndex(null);
  }

  /** Clears the visible stage before an independently prepared replacement. */
  public clearVisiblePreview() {
    this.invalidatePendingRender();
    this.isolatedCommittedPreviewIndex = null;
    this.pageIndicatorGeometry = [];
    this.pageIndicatorGeometryDirty = true;
    if (this.liveRenderer) this.liveRenderer.clear();
    else this.container.replaceChildren();
    this.updatePageIndicator();
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
    this.liveRenderGeneration += 1;
    this.cacheDocument(html, sourceManifest, sourceRevision);
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    this.clickNavigation.setIndex(null);
    this.cancelScheduledRender();
    this.scheduledRenderFrame = window.requestAnimationFrame(async () => {
      this.scheduledRenderFrame = null;
      const started = performance.now();
      const result = await this.render(html, sourceManifest).catch(error => {
        console.error(error);
        return null;
      });
      this.updatePageIndicator();
      if (result) this.commitNavigation(sourceRevision, result);
      previewMetrics.recordPreviewRender('exact-lane', performance.now() - started);
    });
  }

  public async forceRender(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ): Promise<RenderResult> {
    this.cacheDocument(html, sourceManifest, sourceRevision);
    this.cancelScheduledRender();
    this.prepareNavigation(sourceRevision);

    const started = performance.now();
    try {
      const result = await this.render(html, sourceManifest);
      this.updatePageIndicator();
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

  /**
   * Commits an immutable artifact produced by the same isolated, cancellable
   * paginator used for PDF preview. The manifest remains local and is rebuilt
   * against the installed page DOM to keep click/source navigation intact.
   */
  public async forceRenderIsolated(
    input: PdfPreviewJob,
    sourceHtml: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null,
    onPaginationPhase?: (phase: PreviewTimingPhase, durationMs: number) => void,
    onPageTimings?: (pageTimings: readonly PreviewPageTiming[]) => void,
    onPaginationStats?: (stats: Pick<PdfPreviewFrameTimings, 'paginationCssCharacterCount' | 'paginationStyleCount'>) => void
  ): Promise<RenderResult> {
    this.cacheDocument(sourceHtml, sourceManifest, sourceRevision);
    this.invalidatePendingRender();
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);

    const abortController = new AbortController();
    this.isolatedRenderAbortController = abortController;
    const started = performance.now();
    try {
      const outcome = await this.isolatedPaginationHost.requestPrintArtifact(
        input,
        undefined,
        abortController.signal,
        onPaginationPhase
      );
      if (abortController.signal.aborted || this.isolatedRenderAbortController !== abortController) {
        return { status: 'stale', pageCount: 0 };
      }
      if (outcome.status === 'cancelled') return { status: 'stale', pageCount: 0 };
      if (outcome.status !== 'success') {
        return { status: 'degraded', pageCount: 0, error: new Error(outcome.message) };
      }

      this.pdfArtifacts.replace(outcome.result.artifact);
      onPageTimings?.(outcome.result.pageTimings ?? []);
      if (outcome.result.frameTimings) {
        onPaginationStats?.({
          paginationCssCharacterCount: outcome.result.frameTimings.paginationCssCharacterCount,
          paginationStyleCount: outcome.result.frameTimings.paginationStyleCount
        });
      }

      this.installIsolatedPaginationStyle(outcome.result.artifact);
      const parseStartedAt = performance.now();
      const artifactContent = renderPdfArtifactContent(document, outcome.result.artifact);
      onPaginationPhase?.('parse-artifact', Math.round(performance.now() - parseStartedAt));

      const installStartedAt = performance.now();
      this.commitPreparedPages(artifactContent, onPaginationPhase);
      onPaginationPhase?.('install-pages', Math.round(performance.now() - installStartedAt));

      const indexStartedAt = performance.now();
      this.isolatedCommittedPreviewIndex = CommittedPreviewIndex.build(this.container, sourceManifest);
      onPaginationPhase?.('build-navigation-index', Math.round(performance.now() - indexStartedAt));
      const result: RenderResult = { status: 'rendered', pageCount: outcome.result.artifact.pageCount };
      this.updatePageIndicator();
      this.commitNavigation(sourceRevision, result);
      return result;
    } catch (error) {
      if (abortController.signal.aborted) return { status: 'stale', pageCount: 0 };
      return { status: 'degraded', pageCount: 0, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      if (this.isolatedRenderAbortController === abortController) this.isolatedRenderAbortController = null;
      previewMetrics.recordPreviewRender('isolated-full-document', performance.now() - started);
    }
  }

  /** Physical pages in the paginated preview. Zero in the live preview or before a render completes. */
  public pageCount(): number {
    return this.container.querySelectorAll('.pagedjs_page').length;
  }

  /** Scrolls so that the given 1-based page is at the top. Returns false if there is no such page. */
  public scrollToPage(pageNumber: number): boolean {
    const pages = this.container.querySelectorAll<HTMLElement>('.pagedjs_page');
    const page = pages[pageNumber - 1];
    if (!page) return false;
    this.viewport.scrollElementToTop(page, { instant: true });
    // Name the page asked for now. The indicator follows the scroll position as it settles.
    this.showPageIndicator(pageNumber - 1, pages.length);
    return true;
  }

  /** Scrolls to the next or previous heading. Returns its text, or null when there is no such heading. */
  public scrollToAdjacentHeading(direction: 1 | -1): string | null {
    const scrollParent = this.previewScrollParent;
    if (!scrollParent) return null;
    const headings = Array.from(this.container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    const parentTop = scrollParent.getBoundingClientRect().top;
    const tops = headings.map(heading => heading.getBoundingClientRect().top - parentTop);
    const index = adjacentHeadingIndex(tops, NAVIGATION_TOP_INSET, direction);
    if (index === null) return null;
    const heading = headings[index]!;
    this.viewport.scrollElementToTop(heading, { instant: true });
    const pages = Array.from(this.container.querySelectorAll<HTMLElement>('.pagedjs_page'));
    const pageIndex = pages.findIndex(page => page.contains(heading));
    if (pageIndex >= 0) this.showPageIndicator(pageIndex, pages.length);
    return heading.textContent?.trim() || 'Untitled heading';
  }

  public scrollToTop() {
    this.viewport.scrollToTop();
  }

  public setViewportResizeSuspended(suspended: boolean): void {
    this.viewport.setResponsiveZoomSuspended(suspended);
  }

  public navigateToSourceLine(line: number, sourceRevision: number) {
    this.navigation.requestNavigation(line, sourceRevision);
  }

  private cacheDocument(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[],
    sourceRevision: number | null
  ): void {
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;
  }

  private readonly handlePreviewScroll = (): void => this.schedulePageIndicatorUpdate();

  private readonly handleWindowResize = (): void => {
    this.pageIndicatorGeometryDirty = true;
    this.schedulePageIndicatorUpdate();
  };

  private cancelScheduledRender(): void {
    if (this.scheduledRenderFrame === null) return;
    window.cancelAnimationFrame(this.scheduledRenderFrame);
    this.scheduledRenderFrame = null;
  }

  private prepareNavigation(sourceRevision: number | null): void {
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    else this.navigation.clear();
    this.clickNavigation.setIndex(null);
  }

  private async render(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[]
  ): Promise<RenderResult> {
    if (this.mode === 'paginated') {
      throw new Error('Paginated preview must use the isolated pagination pipeline.');
    }

    const generation = ++this.liveRenderGeneration;
    const document = this.liveRenderer!.render(
      html,
      sourceManifest,
      this.currentPageSetup,
      () => generation === this.liveRenderGeneration
    );
    if (!document) return { status: 'stale', pageCount: 0 };
    return { status: 'rendered', pageCount: document.blocks.length };
  }

  private schedulePageIndicatorUpdate(): void {
    if (this.pageIndicatorFrame !== null) return;
    this.pageIndicatorFrame = window.requestAnimationFrame(() => {
      this.pageIndicatorFrame = null;
      this.updatePageIndicator();
    });
  }

  private updatePageIndicator(): void {
    if (!this.pageIndicator) return;
    const pages = Array.from(this.container.querySelectorAll<HTMLElement>('.pagedjs_page'));
    const visible = this.mode === 'paginated' && pages.length > 0;
    this.pageIndicator.hidden = !visible;
    if (!visible || !this.previewScrollParent) return;

    if (this.pageIndicatorGeometryDirty || this.pageIndicatorGeometry.length !== pages.length) {
      const scrollRect = this.previewScrollParent.getBoundingClientRect();
      const scrollTop = this.previewScrollParent.scrollTop;
      this.pageIndicatorGeometry = pages.map(page => {
        const rect = page.getBoundingClientRect();
        return scrollTop + rect.top - scrollRect.top + (rect.height / 2);
      });
      this.pageIndicatorGeometryDirty = false;
    }

    const viewportCenter = this.previewScrollParent.scrollTop + (this.previewScrollParent.clientHeight / 2);
    let low = 0;
    let high = this.pageIndicatorGeometry.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.pageIndicatorGeometry[middle]! < viewportCenter) low = middle + 1;
      else high = middle;
    }
    const candidate = low;
    const previous = Math.max(0, candidate - 1);
    const currentIndex = Math.abs(this.pageIndicatorGeometry[previous]! - viewportCenter)
      <= Math.abs(this.pageIndicatorGeometry[candidate]! - viewportCenter)
      ? previous
      : candidate;
    this.showPageIndicator(currentIndex, pages.length);
  }

  private showPageIndicator(pageIndex: number, pageCount: number): void {
    if (!this.pageIndicator) return;
    this.pageIndicator.textContent = `Page ${pageIndex + 1} of ${pageCount} Pages`;
  }

  private commitNavigation(sourceRevision: number | null, result: RenderResult): void {
    if (result.status !== 'rendered') return;
    const index = this.mode === 'live'
      ? LivePreviewIndex.build(this.container, this.liveRenderer!.document!)
      : this.isolatedCommittedPreviewIndex;
    if (!index) return;
    this.clickNavigation.setIndex(index);
    if (sourceRevision !== null) this.navigation.commitRender(sourceRevision, index);
  }

  private installIsolatedPaginationStyle(artifact: PdfArtifact): void {
    this.clearIsolatedPaginationStyle();
    document.head.querySelectorAll('style[data-pagedjs-inserted-styles]').forEach(style => style.remove());
    const style = createPdfArtifactStyle(document, artifact);
    style.dataset.clearWriterIsolatedPagination = 'true';
    document.head.appendChild(style);
    this.isolatedPaginationStyle = style;
  }

  private clearIsolatedPaginationStyle(): void {
    this.isolatedPaginationStyle?.remove();
    this.isolatedPaginationStyle = null;
  }

  private commitPreparedPages(source: Node, onPhase?: (phase: PreviewTimingPhase, durationMs: number) => void): void {
    const scrollParent = this.container.parentElement;
    const scrollTop = scrollParent?.scrollTop ?? 0;
    const scrollLeft = scrollParent?.scrollLeft ?? 0;
    const previousOverflowAnchor = scrollParent?.style.overflowAnchor ?? '';
    if (scrollParent) scrollParent.style.overflowAnchor = 'none';

    const pages = document.createDocumentFragment();
    while (source.firstChild) pages.appendChild(source.firstChild);
    this.container.replaceChildren(pages);
    this.pageIndicatorGeometryDirty = true;
    if (!scrollParent) return;
    const restoreScroll = () => {
      scrollParent.scrollTop = scrollTop;
      scrollParent.scrollLeft = scrollLeft;
      scrollParent.style.overflowAnchor = previousOverflowAnchor;
    };
    const restoreStartedAt = performance.now();
    restoreScroll();
    onPhase?.('restore-scroll', Math.round(performance.now() - restoreStartedAt));
    window.requestAnimationFrame(restoreScroll);
  }
}
