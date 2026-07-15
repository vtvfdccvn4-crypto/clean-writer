import type { PageSetup, TypographySetup, ListSetup, TableSetup } from '../state';
import { generatePageCss, resolveMarginContent } from './CssGenerator';
import { applyListPreviewStyle, applyTablePreviewStyle, applyTypographyPreviewStyle } from './PreviewStyleManager';
import { applyImageFallback, bindImageFallbacks, resolveImageSource } from '../images/imageSources';
import { parseMarkdownImages } from '../images/markdownImages';
import type { AssetResolver } from '../platform/types';
import type { PreviewSourceManifestEntry } from '../compiler/rehype-plugins';
import { applyHeadingNumbering } from './headingNumbering';
import { applySpecialHeadings } from './specialHeadings';
import { applyTableOfContents } from './tableOfContents';
import {
  PagedJsAdapter,
  type PagedPreviewerFactory,
  type PagedRenderSession
} from './PagedJsAdapter';
import { CommittedPreviewIndex } from './navigation/CommittedPreviewIndex';

export interface RenderEngineOptions {
  renderTimeoutMs?: number;
  previewerFactory?: PagedPreviewerFactory;
  unthrottledPagination?: boolean;
}

export interface RenderResult {
  status: 'rendered' | 'degraded' | 'stale';
  pageCount: number;
  error?: Error;
}

export class RenderEngine {
  private container: HTMLElement;
  private readonly pagedJs: PagedJsAdapter;
  private renderGeneration = 0;
  private readonly renderTimeoutMs: number;
  private committedPreviewIndex: CommittedPreviewIndex | null = null;

  constructor(container: HTMLElement, options: RenderEngineOptions = {}) {
    this.container = container;
    this.renderTimeoutMs = Math.max(10, options.renderTimeoutMs ?? 15_000);
    this.pagedJs = new PagedJsAdapter(
      options.previewerFactory,
      options.unthrottledPagination
    );
  }

  /** Prevent an in-flight render from committing pages for superseded HTML. */
  public invalidate() {
    this.renderGeneration += 1;
  }

  public clearCommittedPreviewIndex() {
    this.committedPreviewIndex = null;
  }

  public getCommittedPreviewIndex(): CommittedPreviewIndex | null {
    return this.committedPreviewIndex;
  }

  public async runRender(
    html: string, 
    pageSetup: PageSetup, 
    assetResolver: AssetResolver | null | undefined,
    typographySetup: TypographySetup | null, 
    listSetup: ListSetup | null,
    tableSetup: TableSetup | null = null,
    sourceManifest: readonly PreviewSourceManifestEntry[] = []
  ): Promise<RenderResult> {
    const generation = ++this.renderGeneration;

    await this.pagedJs.prepareForRender();
    // Paged.js installs its working styles in the application document. Keep
    // the currently committed set alive until the replacement pages have been
    // committed, then retire only those old styles.  Never perform broad DOM
    // cleanup here: that used to touch the visible preview while a new render
    // was still in progress.
    const oldPagedStyles = Array.from(document.head.querySelectorAll<HTMLStyleElement>(
      'style[data-pagedjs-inserted-styles]'
    ));

    const cssText = generatePageCss(pageSetup);
    const styleBlob = new Blob([cssText], { type: 'text/css' });
    const styleUrl = URL.createObjectURL(styleBlob);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    bindImageFallbacks(wrapper);
    applyHeadingNumbering(wrapper);
    applySpecialHeadings(wrapper);
    applyTableOfContents(wrapper, pageSetup.toc?.maxLevel);

    const tempContainer = this.createStagingContainer();

    let session: PagedRenderSession | null = null;
    let didCommit = false;
    const cleanupRenderResources = () => {
      if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);
      URL.revokeObjectURL(styleUrl);
    };
    try {
      session = this.pagedJs.beginPreview(wrapper, [styleUrl], tempContainer);
      await session.wait(this.renderTimeoutMs);

      // Paged.js leaves a ResizeObserver on every completed page. Once those
      // pages are moved out of its staging tree, a late callback traverses
      // detached source nodes and throws from nodeAfter(). The completed page
      // DOM is immutable here, so retire those observers before committing it.
      session.retirePageListeners();

    if (generation !== this.renderGeneration) return { status: 'stale', pageCount: 0 };

      await this.postProcessMarginBoxes(pageSetup, assetResolver, tempContainer);
      if (generation !== this.renderGeneration) return { status: 'stale', pageCount: 0 };

      if (typographySetup) this.applyTypographySetup(typographySetup);
      if (listSetup) this.applyListSetup(listSetup);
      if (tableSetup) this.applyTableSetup(tableSetup);

      this.commitPreparedPages(tempContainer);
      didCommit = true;
      // Removing styles before the commit permits a paint of an unstyled
      // document. Removing only the previous session's styles afterwards
      // keeps the replacement fully styled and avoids document-wide cleanup.
      oldPagedStyles.forEach(style => style.remove());
      this.committedPreviewIndex = CommittedPreviewIndex.build(this.container, wrapper, sourceManifest);
      return {
        status: 'rendered',
        pageCount: this.container.querySelectorAll('.pagedjs_page').length
      };
    } catch (e: any) {
      const renderedPages = tempContainer.querySelectorAll('.pagedjs_page');
      console.warn('[RenderEngine] Paged.js render failed:', e.message, '| pages rendered:', renderedPages.length);

      if (generation !== this.renderGeneration) return { status: 'stale', pageCount: 0 };

      if (renderedPages.length > 0) {
        await this.postProcessMarginBoxes(pageSetup, assetResolver, tempContainer);
        if (generation !== this.renderGeneration) return { status: 'stale', pageCount: 0 };
      }

      const fallback = document.createDocumentFragment();
      if (renderedPages.length === 0) {
        const page = document.createElement('div');
        page.className = 'pagedjs_page';
        const content = document.createElement('div');
        content.className = 'pagedjs_page_content';
        content.innerHTML = wrapper.innerHTML;
        page.appendChild(content);
        fallback.appendChild(page);
      } else {
        while (tempContainer.firstChild) fallback.appendChild(tempContainer.firstChild);
      }

      this.commitPreparedPages(fallback);
      didCommit = true;
      oldPagedStyles.forEach(style => style.remove());
      this.committedPreviewIndex = CommittedPreviewIndex.build(this.container, wrapper, sourceManifest);
      return {
        status: 'degraded',
        pageCount: this.container.querySelectorAll('.pagedjs_page').length,
        error: e instanceof Error ? e : new Error(String(e))
      };
    } finally {
      if (session) session.finish(cleanupRenderResources);
      else cleanupRenderResources();
      // A stale or failed attempt must not leave its global Paged.js stylesheet
      // behind to influence the still-visible, previously committed document.
      if (!didCommit) {
        const oldStyles = new Set(oldPagedStyles);
        document.head.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]').forEach(style => {
          if (!oldStyles.has(style)) style.remove();
        });
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

  /**
   * Paged.js mutates its target throughout pagination.  Its target must never
   * share a layout tree with the live stage: even an invisible sibling can
   * trigger scroll anchoring and transient page layout in the preview pane.
   */
  private createStagingContainer(): HTMLElement {
    const staging = document.createElement('div');
    staging.className = this.container.className;
    staging.setAttribute('aria-hidden', 'true');
    const width = Math.max(1, Math.round(this.container.getBoundingClientRect().width));
    Object.assign(staging.style, {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      width: `${width}px`,
      visibility: 'hidden',
      pointerEvents: 'none',
      contain: 'layout style paint'
    });
    document.body.appendChild(staging);
    return staging;
  }

  /** Commit a complete replacement without resetting a scroll made during pagination. */
  private commitPreparedPages(source: Node): void {
    const scrollParent = this.container.parentElement;
    const scrollTop = scrollParent?.scrollTop ?? 0;
    const scrollLeft = scrollParent?.scrollLeft ?? 0;
    const previousOverflowAnchor = scrollParent?.style.overflowAnchor ?? '';
    if (scrollParent) scrollParent.style.overflowAnchor = 'none';

    const nextPages = document.createDocumentFragment();
    while (source.firstChild) nextPages.appendChild(source.firstChild);
    this.container.replaceChildren(nextPages);

    if (!scrollParent) return;
    const restoreScroll = () => {
      scrollParent.scrollTop = scrollTop;
      scrollParent.scrollLeft = scrollLeft;
      scrollParent.style.overflowAnchor = previousOverflowAnchor;
    };
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  }

  private async postProcessMarginBoxes(pageSetup: PageSetup, assetResolver?: AssetResolver | null, root: ParentNode = this.container) {
    const cells = [
      { selector: '.pagedjs_margin-top-left > .pagedjs_margin-content', cell: pageSetup.header?.left },
      { selector: '.pagedjs_margin-top-center > .pagedjs_margin-content', cell: pageSetup.header?.center },
      { selector: '.pagedjs_margin-top-right > .pagedjs_margin-content', cell: pageSetup.header?.right },
      { selector: '.pagedjs_margin-bottom-left > .pagedjs_margin-content', cell: pageSetup.footer?.left },
      { selector: '.pagedjs_margin-bottom-center > .pagedjs_margin-content', cell: pageSetup.footer?.center },
      { selector: '.pagedjs_margin-bottom-right > .pagedjs_margin-content', cell: pageSetup.footer?.right }
    ];

    if (assetResolver) {
      const pathsToPreload: string[] = [];
      for (const cell of cells) {
        if (cell.cell?.content) {
          const content = resolveMarginContent(cell.cell.content, 1);
          pathsToPreload.push(...parseMarkdownImages(content).map(m => m.source));
        }
      }
      if (pathsToPreload.length > 0) {
        await assetResolver.preloadImages(Array.from(new Set(pathsToPreload)));
      }
    }

    const imageLoads: Promise<void>[] = [];

    let currentChapter = '';
    root.querySelectorAll<HTMLElement>('.pagedjs_page').forEach((page, pageIndex) => {
      const chapterHeading = page.querySelector<HTMLElement>('h1 .heading-number, h1.heading-number');
      if (chapterHeading) {
        const match = chapterHeading.textContent?.match(/^(\d+(?:\.\d+)*)\./);
        if (match) currentChapter = match[1];
      }
      const { hideHeader, hideFooter } = resolvePageVisibility(page);
      page.classList.toggle('page-no-header', hideHeader);
      page.classList.toggle('page-no-footer', hideFooter);

      if (hideHeader) {
        clearMarginBoxContent(page, [
          '.pagedjs_margin-top-left > .pagedjs_margin-content',
          '.pagedjs_margin-top-center > .pagedjs_margin-content',
          '.pagedjs_margin-top-right > .pagedjs_margin-content'
        ]);
      }

      if (hideFooter) {
        clearMarginBoxContent(page, [
          '.pagedjs_margin-bottom-left > .pagedjs_margin-content',
          '.pagedjs_margin-bottom-center > .pagedjs_margin-content',
          '.pagedjs_margin-bottom-right > .pagedjs_margin-content'
        ]);
      }

      for (const cell of cells) {
        if (!cell.cell?.content) continue;
        if (hideHeader && cell.selector.includes('.pagedjs_margin-top')) continue;
        if (hideFooter && cell.selector.includes('.pagedjs_margin-bottom')) continue;

        const content = resolveChapterMarginContent(
          resolveMarginContent(cell.cell.content, pageIndex + 1),
          currentChapter
        )
          .replace(/\\n/g, '\n')
          .replace(/<br\s*\/?>/gi, '\n');
        const marginContent = page.querySelector<HTMLElement>(cell.selector);
        if (!marginContent) continue;
        if (/\{chapter:[^{}]*\}/i.test(cell.cell.content)) {
          marginContent.classList.add('chapter-margin-resolved');
          const cssContent = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ');
          marginContent.style.content = `"${cssContent}"`;
          if (parseMarkdownImages(content).length === 0) {
            marginContent.replaceChildren(document.createTextNode(content));
            marginContent.style.content = 'normal';
          }
        }
        if (parseMarkdownImages(content).length === 0) continue;
        imageLoads.push(...renderMarginContent(
          marginContent,
          content,
          assetResolver,
          cell.cell.verticalAlign,
          cell.cell.horizontalAlign
        ));
      }
    });

    await Promise.all(imageLoads);
  }
}

function resolveChapterMarginContent(content: string, chapter: string): string {
  return content.replace(/\{chapter:([^{}]*)\}/gi, (_token, label: string) =>
    chapter ? `${label}${chapter}` : ''
  );
}

function clearMarginBoxContent(page: HTMLElement, selectors: string[]) {
  for (const selector of selectors) {
    const marginContent = page.querySelector<HTMLElement>(selector);
    if (!marginContent) continue;
    marginContent.replaceChildren();
  }
}

function resolvePageVisibility(page: HTMLElement): { hideHeader: boolean; hideFooter: boolean } {
  const sectionMarkers = Array.from(page.querySelectorAll<HTMLElement>('[data-section-index]'));
  let chosenMarker: HTMLElement | null = null;
  let chosenIndex = Number.POSITIVE_INFINITY;

  for (const marker of sectionMarkers) {
    if (!Number.isFinite(Number(marker.dataset.sectionIndex))) continue;
    const rawIndex = Number(marker.dataset.sectionIndex);
    if (rawIndex < chosenIndex) {
      chosenIndex = rawIndex;
      chosenMarker = marker;
    }
  }

  if (chosenMarker) {
    return {
      hideHeader: chosenMarker.dataset.hideHeader === 'true',
      hideFooter: chosenMarker.dataset.hideFooter === 'true'
    };
  }

  return {
    hideHeader: page.querySelector('.page-no-header') !== null,
    hideFooter: page.querySelector('.page-no-footer') !== null
  };
}

function renderMarginContent(
  container: HTMLElement,
  text: string,
  assetResolver: AssetResolver | null | undefined,
  verticalAlign: 'top' | 'middle' | 'bottom' = 'middle',
  horizontalAlign: 'left' | 'center' | 'right' = 'center'
): Promise<void>[] {
  const matches = parseMarkdownImages(text);
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  const imageLoads: Promise<void>[] = [];

  for (const match of matches) {
    if (match.start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));
    }

    const img = document.createElement('img');
    img.alt = match.alt;
    if (match.title) img.title = match.title;
    img.dataset.imageSource = match.source;
    img.style.maxHeight = '100%';
    img.style.maxWidth = '100%';
    img.style.objectFit = 'contain';
    img.style.verticalAlign = 'middle';

    imageLoads.push(waitForMarginImage(img, match.source));
    img.src = resolveImageSource(match.source, assetResolver);
    fragment.appendChild(img);
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  container.classList.add('has-markdown-image');
  container.style.display = 'flex';
  container.style.alignItems = verticalAlign === 'top'
    ? 'flex-start'
    : verticalAlign === 'bottom'
      ? 'flex-end'
      : 'center';
  container.style.justifyContent = horizontalAlign === 'left'
    ? 'flex-start'
    : horizontalAlign === 'right'
      ? 'flex-end'
      : 'center';
  container.replaceChildren(fragment);
  return imageLoads;
}

function waitForMarginImage(img: HTMLImageElement, originalSource: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timeout = window.setTimeout(finish, 3000);

    img.addEventListener('load', () => {
      window.clearTimeout(timeout);
      finish();
    });
    img.onerror = () => {
      applyImageFallback(img, originalSource);
      if (img.complete) {
        window.clearTimeout(timeout);
        finish();
      }
    };
  });
}
