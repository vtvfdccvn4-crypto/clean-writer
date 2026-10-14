import { materializePdfPreviewMargins } from '../pdf-preview/PdfPreviewMarginRenderer';
import { paginatePreviewFrame } from '../pdf-preview/PdfPreviewFramePaginator';
import { materializePdfListMarkers } from '../pdf-preview/PdfPreviewListMarkers';
import { materializePdfPreviewTocPageNumbers } from '../pdf-preview/PdfPreviewTocPageNumbers';
import { PDF_ARTIFACT_SCHEMA_VERSION, createPdfArtifact } from '../pdf-preview/PdfArtifact';
import {
  PDF_PREVIEW_FRAME_READY,
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
      }, source => materializePdfListMarkers(source, input.listMarkerStyles));
      materializePdfPreviewTocPageNumbers(stage);
      const marginMetrics = materializePdfPreviewMargins(stage, input.margins, input.marginImageSources);
      const artifactStartedAt = performance.now();
      const html = stage.innerHTML;
      const pages = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page')).map((page, index) => {
        const sourceElement = page.querySelector<HTMLElement>('[data-ref], [data-split-from]');
        const anchor = sourceElement?.getAttribute('data-ref') ?? sourceElement?.getAttribute('data-split-from') ?? undefined;
        return { number: index + 1, ...(anchor !== undefined ? { anchor } : {}) };
      });
      // Freeze the artifact here, after every page-dependent value has been
      // materialized, so an incomplete render fails inside the frame.
      const artifact = createPdfArtifact({
        schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
        artifactId: crypto.randomUUID(),
        key: input.key,
        html,
        css: pagination.paginationCss + '\n' + input.artifactPrintCss,
        pageCount: pagination.pageCount,
        pages
      });
      const artifactSerializationMs = Math.round(performance.now() - artifactStartedAt);
      window.parent.postMessage({
        type: 'clear-writer-pdf-preview-result', requestId, artifact, paginationMs: pagination.durationMs,
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
        type: 'clear-writer-pdf-preview-result', requestId,
        artifact: undefined as never,
        error: error instanceof Error ? error.message : String(error)
      }, window.location.origin);
    }
  });

  window.parent.postMessage({ type: PDF_PREVIEW_FRAME_READY }, window.location.origin);
}
