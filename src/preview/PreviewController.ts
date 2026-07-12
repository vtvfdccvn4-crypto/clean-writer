import morphdom from 'morphdom';
import type { PageSetup, TypographySetup, ListSetup, TableSetup } from '../state';
import { RenderEngine, type RenderEngineOptions, type RenderResult } from './RenderEngine';
import { ScrollSync } from './ScrollSync';
import { applyHeadingNumbering } from './headingNumbering';
import { applySpecialHeadings } from './specialHeadings';
import { applyTableOfContents } from './tableOfContents';
import { bindImageFallbacks } from '../images/imageSources';
import { previewMetrics } from '../perf/preview-metrics';

import type { AssetResolver } from '../platform/types';

export class PreviewController {
  private container: HTMLElement;
  private exactLaneTimeout: any = null;
  private assetResolver: AssetResolver;
  
  private renderEngine: RenderEngine;
  private scrollSync: ScrollSync;

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
  private fastLaneStructure: string[] = [];
  private fastLaneHtmlByLine = new Map<string, string>();
  private requiresStructuralRender = false;

  constructor(container: HTMLElement, assetResolver: AssetResolver, renderEngineOptions: RenderEngineOptions = {}) {
    this.container = container;
    this.assetResolver = assetResolver;
    this.renderEngine = new RenderEngine(container, renderEngineOptions);
    this.scrollSync = new ScrollSync(container, this.currentPageSetup);
    this.scrollSync.setupResponsiveZoom();
    this.scrollSync.updateZoomScale();
  }

  public applyPageSetup(setup: PageSetup, renderCachedDocument = true) {
    if (JSON.stringify(this.currentPageSetup) === JSON.stringify(setup)) return;
    this.currentPageSetup = setup;
    this.scrollSync.setPageSetup(setup);
    if (renderCachedDocument && this.lastCompiledHtml) {
      this.forceRender(this.lastCompiledHtml);
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
    this.fastLaneStructure = [];
    this.fastLaneHtmlByLine.clear();
    this.requiresStructuralRender = false;
    this.container.replaceChildren();
  }

  public updateFastLane(html: string) {
    previewMetrics.recordFastLaneUpdate();
    // Any edit supersedes a Paged.js render that may still be running. Without
    // this guard, an older render can briefly replace newer fast-lane content.
    this.renderEngine.invalidate();
    this.lastCompiledHtml = html;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    bindImageFallbacks(wrapper);
    applyHeadingNumbering(wrapper);
    applySpecialHeadings(wrapper);
    applyTableOfContents(wrapper, this.currentPageSetup.toc?.maxLevel);
    const nextStructure = getHtmlStructure(wrapper);
    const nextHtmlByLine = getHtmlBySourceLine(wrapper);

    // A newline can add/remove a block and renumber every following source key.
    // Patching that into already fragmented Paged.js pages leaves duplicate or
    // orphaned fragments. Keep the coherent old frame until exact pagination
    // can atomically commit the new structure.
    this.requiresStructuralRender = this.fastLaneStructure.length > 0
      && !sameStructure(this.fastLaneStructure, nextStructure);
    this.fastLaneStructure = nextStructure;

    const changedElements = Array.from(wrapper.children).filter((element) => {
      const line = element.getAttribute('data-source-line');
      return line !== null && this.fastLaneHtmlByLine.get(line) !== element.outerHTML;
    });
    this.fastLaneHtmlByLine = nextHtmlByLine;

    // Paged.js duplicates a source-line key when a block crosses a page. A
    // partial morph would update only one fragment and briefly show both the
    // old and new text. Missing or duplicated targets therefore require the
    // exact lane as well.
    if (!this.requiresStructuralRender && this.container.querySelector('.pagedjs_pages')) {
      this.requiresStructuralRender = changedElements.some((element) => {
        const line = element.getAttribute('data-source-line')!;
        return this.container.querySelectorAll(`[data-source-line="${line}"]`).length !== 1;
      });
    }

    if (this.requiresStructuralRender && this.container.querySelector('.pagedjs_pages')) {
      return;
    }

    const pageContent = this.container.querySelector('.pagedjs_page_content');
    if (!pageContent) {
      this.container.innerHTML = `
        <div class="pagedjs_page">
          <div class="pagedjs_page_content">${html}</div>
        </div>
      `;
      bindImageFallbacks(this.container);
      return;
    }

    let morphedAnything = false;
    changedElements.forEach((newEl) => {
      const lineObj = newEl.getAttribute('data-source-line');
      if (lineObj) {
        const existingEl = this.container.querySelector(`[data-source-line="${lineObj}"]`);
        if (existingEl) {
          morphdom(existingEl, newEl, {
            childrenOnly: false,
            // Preserve Paged.js bookkeeping on nodes that survive the morph.
            // Removing data-ref/data-split attributes destabilizes the page
            // fragments until the next exact render.
            onBeforeElUpdated: preservePagedAttributes
          });
          morphedAnything = true;
        }
      }
    });

    if (!morphedAnything && !this.container.querySelector('.pagedjs_pages')) {
      const pageContentEl = this.container.querySelector('.pagedjs_page_content');
      if (pageContentEl) morphdom(pageContentEl, wrapper, { childrenOnly: false });
    }
  }

  public async updateExactLane(html: string) {
    this.lastCompiledHtml = html;
    if (this.exactLaneTimeout) clearTimeout(this.exactLaneTimeout);
    
    // Structural edits cannot be represented safely in fragmented pages, so
    // paginate them promptly. Text-only edits retain the quieter debounce.
    const delay = this.requiresStructuralRender ? 0 : 800;
    this.exactLaneTimeout = setTimeout(async () => {
      const started = performance.now();
      await this.renderEngine.runRender(html, this.currentPageSetup, this.assetResolver, this.currentTypographySetup, this.currentListSetup, this.currentTableSetup).catch((e: any) => console.error(e));
      previewMetrics.recordPreviewRender('exact-lane', performance.now() - started);
    }, delay);
  }

  public async forceRender(html: string): Promise<RenderResult> {
    this.lastCompiledHtml = html;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    bindImageFallbacks(wrapper);
    this.fastLaneStructure = getHtmlStructure(wrapper);
    this.fastLaneHtmlByLine = getHtmlBySourceLine(wrapper);
    this.requiresStructuralRender = false;
    if (this.exactLaneTimeout) {
      clearTimeout(this.exactLaneTimeout);
      this.exactLaneTimeout = null;
    }

    const started = performance.now();
    try {
      const result = await this.renderEngine.runRender(html, this.currentPageSetup, this.assetResolver, this.currentTypographySetup, this.currentListSetup, this.currentTableSetup);
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

  public scrollToLine(line: number, isTextMutation: boolean) {
    this.scrollSync.scrollToLine(line, isTextMutation);
  }

  public scrollToTop() {
    this.scrollSync.scrollToTop();
  }
}

function sameStructure(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getHtmlStructure(wrapper: HTMLElement): string[] {
  return Array.from(wrapper.children).map((element) =>
    `${element.tagName}:${element.getAttribute('data-source-line') ?? ''}`
  );
}

function getHtmlBySourceLine(wrapper: HTMLElement): Map<string, string> {
  const result = new Map<string, string>();
  Array.from(wrapper.children).forEach((element) => {
    const line = element.getAttribute('data-source-line');
    if (line !== null) result.set(line, element.outerHTML);
  });
  return result;
}

function preservePagedAttributes(fromEl: Element, toEl: Element): boolean {
  Array.from(fromEl.attributes).forEach((attribute) => {
    if (isPagedAttribute(attribute.name) && !toEl.hasAttribute(attribute.name)) {
      toEl.setAttribute(attribute.name, attribute.value);
    }
  });
  return true;
}

function isPagedAttribute(name: string): boolean {
  return name === 'data-ref'
    || name === 'data-id'
    || name.startsWith('data-split-')
    || name.startsWith('data-break-')
    || name.startsWith('data-previous-break-')
    || name.startsWith('data-next-break-');
}
