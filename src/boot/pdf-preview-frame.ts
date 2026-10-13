import { materializePdfPreviewMargins } from '../pdf-preview/PdfPreviewMarginRenderer';
import { paginatePreviewFrame } from '../pdf-preview/PdfPreviewFramePaginator';
import { materializePdfListMarkers } from '../pdf-preview/PdfPreviewListMarkers';
import { materializePdfPreviewTocPageNumbers } from '../pdf-preview/PdfPreviewTocPageNumbers';
import {
  PDF_PREVIEW_FRAME_READY,
  type PdfPreviewGuideRequest,
  type PdfPreviewRenderRequest
} from '../pdf-preview/contracts';

export function bootPdfPreviewFrame(): void {
  document.body.replaceChildren();
  const stage = document.createElement('main');
  stage.id = 'clear-writer-pdf-preview-stage';
  document.body.appendChild(stage);

  window.addEventListener('message', async (event: MessageEvent<PdfPreviewRenderRequest>) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'clear-writer-pdf-preview-request') return;
    const { requestId, input } = event.data;
    try {
      const pagination = await paginatePreviewFrame(stage, input.html, input.css, pagesCompleted => {
        window.parent.postMessage({
          type: 'clear-writer-pdf-preview-progress',
          requestId,
          phase: 'paginate',
          pagesCompleted
        }, window.location.origin);
      });
      if (input.layout) materializePdfListMarkers(stage, { bulletIcon: input.layout.lists.ol.bulletIcon, parenthesized: { bulletIcon: input.layout.lists.olParen.bulletIcon } });
      materializePdfPreviewTocPageNumbers(stage);
      const marginMetrics = materializePdfPreviewMargins(stage, input.margins, input.marginImageSources);
      const artifactStartedAt = performance.now();
      const html = stage.innerHTML;
      const artifactSerializationMs = Math.round(performance.now() - artifactStartedAt);
      window.parent.postMessage({
        type: 'clear-writer-pdf-preview-result', requestId, html,
        paginationCss: pagination.paginationCss, pageCount: pagination.pageCount, paginationMs: pagination.durationMs,
        frameTimings: {
          sourceInstallMs: pagination.sourceInstallMs,
          pagedJsInitializationMs: pagination.pagedJsInitializationMs,
          paginationMs: pagination.durationMs,
          paginationCssExtractionMs: pagination.paginationCssExtractionMs,
          paginationCssCharacterCount: pagination.paginationCssCharacterCount,
          paginationStyleCount: pagination.paginationStyleCount,
          pagedJsQueueCycleMs: pagination.pagedJsQueueCycleMs,
          pagedJsQueueTaskCount: pagination.pagedJsQueueTaskCount,
          marginMaterializationMs: marginMetrics.elapsedMs,
          marginParseMs: marginMetrics.parseMs,
          marginPageScanMs: marginMetrics.pageScanMs,
          marginDomWriteMs: marginMetrics.domWriteMs,
          marginPagesVisited: marginMetrics.pagesVisited,
          marginContainersWritten: marginMetrics.containersWritten,
          artifactSerializationMs
        },
        pageTimings: pagination.pageTimings
      }, window.location.origin);
    } catch (error) {
      window.parent.postMessage({
        type: 'clear-writer-pdf-preview-result', requestId, html: '', paginationCss: '', pageCount: 0,
        error: error instanceof Error ? error.message : String(error)
      }, window.location.origin);
    }
  });

  window.addEventListener('message', async (event: MessageEvent<PdfPreviewGuideRequest>) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'clear-writer-pdf-preview-guide-request') return;
    const { requestId, input } = event.data;
    try {
      const pagination = await paginatePreviewFrame(stage, input.html, input.css);
      const pageBoundaries = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page')).flatMap((page, index) => {
        if (index === 0) return [];
        const anchor = page.querySelector<HTMLElement>('[data-ref], [data-split-from]')?.getAttribute('data-ref')
          ?? page.querySelector<HTMLElement>('[data-ref], [data-split-from]')?.getAttribute('data-split-from');
        return anchor ? [{ pageNumber: index + 1, anchor }] : [];
      });
      window.parent.postMessage({ type: 'clear-writer-pdf-preview-guide-result', requestId, pageBoundaries, paginationMs: pagination.durationMs }, window.location.origin);
    } catch (error) {
      window.parent.postMessage({
        type: 'clear-writer-pdf-preview-guide-result', requestId, pageBoundaries: [],
        error: error instanceof Error ? error.message : String(error)
      }, window.location.origin);
    }
  });

  window.parent.postMessage({ type: PDF_PREVIEW_FRAME_READY }, window.location.origin);
}
