import type { PageSetup, TypographySetup, ListSetup, TableSetup } from '../state';
import { RenderEngine, type RenderEngineOptions, type RenderResult } from './RenderEngine';
import { PreviewViewport } from './PreviewViewport';
import { previewMetrics } from '../perf/preview-metrics';

import type { AssetResolver } from '../platform/types';
import type { PreviewSourceManifestEntry } from '../compiler/rehype-plugins';
import type { CommittedPreviewIndex } from './navigation/CommittedPreviewIndex';
import { PreviewNavigationCoordinator } from './navigation/PreviewNavigationCoordinator';

export class PreviewController {
  private container: HTMLElement;
  private exactLaneTimeout: any = null;
  private assetResolver: AssetResolver;
  
  private renderEngine: RenderEngine;
  private viewport: PreviewViewport;
  private navigation: PreviewNavigationCoordinator;

  private currentPageSetup: PageSetup = {
    paperWidth: 210, paperHeight: 297,
    marginTop: 25, marginBottom: 25,
    marginLeft: 20, marginRight: 20,
    header: { centerWidth: '100px', left: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false}, center: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false}, right: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false} },
    footer: { centerWidth: '100px', left: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false}, center: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false}, right: {content:'', fontFamily:'', fontSize:9, color:'', isBold:false, isItalic:false} }
  };
  private currentTypographySetup: TypographySetup | null = null;
  private currentListSetup: ListSetup | null = null;
  private currentTableSetup: TableSetup | null = null;
  private lastCompiledHtml: string = '';
  private lastSourceManifest: readonly PreviewSourceManifestEntry[] = [];
  private lastSourceRevision: number | null = null;

  constructor(container: HTMLElement, assetResolver: AssetResolver, renderEngineOptions: RenderEngineOptions = {}) {
    this.container = container;
    this.assetResolver = assetResolver;
    this.renderEngine = new RenderEngine(container, renderEngineOptions);
    this.viewport = new PreviewViewport(container, this.currentPageSetup);
    this.navigation = new PreviewNavigationCoordinator(target => {
      this.viewport.scrollElementToTop(target.element);
    });
    this.viewport.setupResponsiveZoom();
    this.viewport.updateZoomScale();
  }

  public applyPageSetup(setup: PageSetup, renderCachedDocument = true) {
    if (JSON.stringify(this.currentPageSetup) === JSON.stringify(setup)) return;
    this.currentPageSetup = setup;
    this.viewport.setPageSetup(setup);
    if (renderCachedDocument && this.lastCompiledHtml) {
      this.forceRender(this.lastCompiledHtml, this.lastSourceManifest, this.lastSourceRevision);
    }
  }

  public applyTypographySetup(setup: TypographySetup) {
    this.currentTypographySetup = setup;
    this.renderEngine.applyTypographySetup(setup);
  }

  public applyListSetup(setup: ListSetup) {
    this.currentListSetup = setup;
    this.renderEngine.applyListSetup(setup);
  }

  public applyTableSetup(setup: TableSetup) {
    this.currentTableSetup = setup;
    this.renderEngine.applyTableSetup(setup);
  }

  public getPageSetup(): PageSetup {
    return this.currentPageSetup;
  }

  public getLastCompiledHtml(): string {
    return this.lastCompiledHtml;
  }

  public clear() {
    this.renderEngine.invalidate();
    if (this.exactLaneTimeout) {
      clearTimeout(this.exactLaneTimeout);
      this.exactLaneTimeout = null;
    }
    this.lastCompiledHtml = '';
    this.lastSourceManifest = [];
    this.lastSourceRevision = null;
    this.renderEngine.clearCommittedPreviewIndex();
    this.navigation.clear();
    this.container.replaceChildren();
  }

  public updateFastLane(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ) {
    previewMetrics.recordFastLaneUpdate();
    // Any edit supersedes a Paged.js render that may still be running. Without
    // this guard, an older render can briefly replace newer fast-lane content.
    this.renderEngine.invalidate();
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;

    // Exact pagination is the sole preview-update path while source-to-preview
    // navigation is redesigned. Do not mutate Paged.js fragments in place.
  }

  public async updateExactLane(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ) {
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    if (this.exactLaneTimeout) clearTimeout(this.exactLaneTimeout);
    const delay = 800;
    this.exactLaneTimeout = setTimeout(async () => {
      const started = performance.now();
      const result = await this.renderEngine.runRender(html, this.currentPageSetup, this.assetResolver, this.currentTypographySetup, this.currentListSetup, this.currentTableSetup, sourceManifest).catch((e: any) => {
        console.error(e);
        return null;
      });
      if (result && sourceRevision !== null && result.status === 'rendered') {
        const index = this.renderEngine.getCommittedPreviewIndex();
        if (index) this.navigation.commitRender(sourceRevision, index);
      }
      previewMetrics.recordPreviewRender('exact-lane', performance.now() - started);
    }, delay);
  }

  public async forceRender(
    html: string,
    sourceManifest: readonly PreviewSourceManifestEntry[] = [],
    sourceRevision: number | null = null
  ): Promise<RenderResult> {
    this.lastCompiledHtml = html;
    this.lastSourceManifest = sourceManifest;
    this.lastSourceRevision = sourceRevision;
    if (this.exactLaneTimeout) {
      clearTimeout(this.exactLaneTimeout);
      this.exactLaneTimeout = null;
    }
    if (sourceRevision !== null) this.navigation.beginRender(sourceRevision);
    else this.navigation.clear();

    const started = performance.now();
    try {
      const result = await this.renderEngine.runRender(html, this.currentPageSetup, this.assetResolver, this.currentTypographySetup, this.currentListSetup, this.currentTableSetup, sourceManifest);
      if (sourceRevision !== null && result.status === 'rendered') {
        const index = this.renderEngine.getCommittedPreviewIndex();
        if (index) this.navigation.commitRender(sourceRevision, index);
      }
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

  public getCommittedPreviewIndex(): CommittedPreviewIndex | null {
    return this.renderEngine.getCommittedPreviewIndex();
  }

  public navigateToSourceLine(line: number, sourceRevision: number) {
    this.navigation.requestNavigation(line, sourceRevision);
  }
}
