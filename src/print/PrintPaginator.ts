import { PagedJsAdapter, type PagedRenderSession } from '../preview/PagedJsAdapter';
import type { PrintLayoutSettings } from './PrintLayoutSettings';
import { renderPrintMargins, type PrintMarginImageSources } from './PrintMarginRenderer';
import { renderPrintListMarkers } from './PrintListMarkerRenderer';
import { renderPrintTocPageNumbers } from './PrintTocPageNumbers';
import { validatePrintArtifact } from './PrintArtifactValidator';

export interface PrintPaginationResult {
  readonly html: string;
  readonly paginationCss: string;
  readonly pageCount: number;
  /** First compiled-source anchor on every physical page after page one. */
  readonly pageBoundaries: readonly PrintPageBoundary[];
}

export interface PrintPageBoundary {
  readonly pageNumber: number;
  readonly anchor: string;
}

export interface PrintPaginationOptions {
  /** PDF export rejects blank pages; advisory editor guides can tolerate them. */
  readonly validateArtifact?: boolean;
}

/**
 * The sole Paged.js owner in the PDF pipeline.
 *
 * It receives a complete print document and stylesheet, creates pages in the
 * isolated export frame, then returns an immutable artifact. It deliberately
 * does not share PreviewController, live styles, or application state.
 */
export class PrintPaginator {
  private readonly pagedJs = new PagedJsAdapter(undefined, true);

  async paginate(
    html: string,
    css: string,
    layout: PrintLayoutSettings,
    imageSources: PrintMarginImageSources,
    target: HTMLElement,
    options: PrintPaginationOptions = {}
  ): Promise<PrintPaginationResult> {
    let phase = 'prepare print surface';
    target.replaceChildren();
    const source = document.createElement('article');
    source.className = 'clear-writer-print-source';
    source.innerHTML = html;
    const styleUrl = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
    const previousPagedStyles = new Set(
      Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]'))
    );

    let session: PagedRenderSession | null = null;
    try {
      phase = 'prepare Paged.js';
      await this.pagedJs.prepareForRender();
      phase = 'start Paged.js pagination';
      session = this.pagedJs.beginPreview(source, [styleUrl], target);
      phase = 'wait for Paged.js pagination';
      await session.wait(15_000);
      phase = 'retire Paged.js page listeners';
      session.retirePageListeners();
      phase = 'materialise ordered-list markers';
      renderPrintListMarkers(target, layout);
      phase = 'resolve table of contents page references';
      renderPrintTocPageNumbers(target);
      phase = 'materialise header and footer text';
      renderPrintMargins(target, layout, imageSources);
      phase = 'validate paginated artifact';
      const pageCount = options.validateArtifact === false
        ? target.querySelectorAll('.pagedjs_page').length
        : validatePrintArtifact(target);
      const pageBoundaries = collectPageBoundaries(target);
      phase = 'collect generated page stylesheet';
      const paginationCss = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]'))
        .filter(style => !previousPagedStyles.has(style))
        .map(style => style.textContent || '')
        .join('\n');
      if (!paginationCss.trim()) throw new Error('Print pagination produced no page stylesheet.');
      return { html: target.innerHTML, paginationCss, pageCount, pageBoundaries };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Print pagination failed during ${phase}: ${message}`, { cause: error });
    } finally {
      if (session) session.finish(() => URL.revokeObjectURL(styleUrl));
      else URL.revokeObjectURL(styleUrl);
    }
  }
}

/**
 * Reads Paged.js's committed physical pages without adding markers to the
 * print artifact. The same anchors are present in the canonical preview.
 */
export function collectPageBoundaries(root: ParentNode): PrintPageBoundary[] {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const boundaries: PrintPageBoundary[] = [];
  pages.forEach((page, index) => {
    if (index === 0) return;
    const element = page.querySelector<HTMLElement>('[data-ref], [data-split-from]');
    const anchor = element?.getAttribute('data-ref') ?? element?.getAttribute('data-split-from');
    if (anchor) boundaries.push({ pageNumber: index + 1, anchor });
  });
  return boundaries;
}
