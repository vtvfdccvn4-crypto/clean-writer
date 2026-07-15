import { PrintPaginator } from '../print/PrintPaginator';
import type { PrintLayoutSettings } from '../print/PrintLayoutSettings';

type ExportRequest = {
  type: 'clear-writer-export-request';
  requestId: string;
  input: {
    html: string;
    css: string;
    layout: PrintLayoutSettings;
    marginImageSources: Record<string, string>;
    purpose?: 'export' | 'guides';
  };
};

/**
 * The paged DOM is not self-describing: Paged.js emits its page and margin-box
 * geometry as styles in this frame's head.  Export that generated CSS with the
 * DOM before this frame is destroyed, otherwise a print document receives
 * unbounded margin-box markup and lays headers/footer assets out incorrectly.
 */
export function collectPaginationCss(root: ParentNode = document): string {
  return Array.from(root.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]'))
    .map(style => style.textContent || '')
    .join('\n');
}

export function bootExportPaginationFrame(): void {
  document.body.innerHTML = '<main id="clear-writer-print-stage"></main>';
  const stage = document.getElementById('clear-writer-print-stage')!;
  const paginator = new PrintPaginator();

  window.addEventListener('message', async (event: MessageEvent<ExportRequest>) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'clear-writer-export-request') return;
    const { requestId, input } = event.data;
    try {
      const result = await paginator.paginate(
        input.html,
        input.css,
        input.layout,
        input.marginImageSources,
        stage,
        { validateArtifact: input.purpose !== 'guides' }
      );
      window.parent.postMessage({
        type: 'clear-writer-export-result', requestId, status: 'rendered',
        html: result.html, paginationCss: result.paginationCss, pageBoundaries: result.pageBoundaries
      }, window.location.origin);
    } catch (error) {
      window.parent.postMessage({
        type: 'clear-writer-export-result', requestId, status: 'degraded', html: '', paginationCss: '', pageBoundaries: [],
        error: error instanceof Error ? error.message : String(error)
      }, window.location.origin);
    }
  });

  window.parent.postMessage({ type: 'clear-writer-export-ready' }, window.location.origin);
}
