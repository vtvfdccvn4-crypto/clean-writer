import type { HeaderFooterRow, ProjectMetadata } from '../types';
import type { PreviewPageTiming } from '../perf/preview-timing';

export interface PdfPreviewMarginData {
  header: Readonly<HeaderFooterRow>;
  footer: Readonly<HeaderFooterRow>;
  metadata: Readonly<ProjectMetadata>;
}

/** Immutable input for one isolated PDF-preview pagination job. */
export interface PdfPreviewJob {
  html: string;
  css: string;
  layout?: import('../print/PrintLayoutSettings').PrintLayoutSettings;
  margins: PdfPreviewMarginData;
  marginImageSources: Record<string, string>;
}

export interface PdfPreviewGuideJob {
  html: string;
  css: string;
}

export type PdfPreviewProgressPhase =
  | 'open-print-target'
  | 'load-pagination-frame'
  | 'paginate'
  | 'transfer-print-artifact'
  | 'install-print-document'
  | 'print';

export type PdfPreviewProgress = {
  type: 'clear-writer-pdf-preview-progress';
  requestId: string;
  phase: PdfPreviewProgressPhase;
  pagesCompleted?: number;
  estimatedPages?: number;
  elapsedMs?: number;
  timeoutMs?: number;
};

export type PdfPreviewPaginationBudget = {
  estimatedPages: number;
  imageCount: number;
  textCharacters: number;
  timeoutMs: number;
};

export type PdfPreviewPhaseTiming = {
  phase: PdfPreviewProgressPhase;
  durationMs: number;
};

export type PdfPreviewPaginationDiagnostics = {
  requestId: string;
  budget: PdfPreviewPaginationBudget;
  elapsedMs: number;
  pageCount?: number;
  timings: PdfPreviewPhaseTiming[];
};

export type PdfPreviewRenderRequest = {
  type: 'clear-writer-pdf-preview-request';
  requestId: string;
  input: PdfPreviewJob;
};

export type PdfPreviewRenderResult = {
  type: 'clear-writer-pdf-preview-result';
  requestId: string;
  html: string;
  paginationCss: string;
  pageCount: number;
  paginationMs?: number;
  frameTimings?: PdfPreviewFrameTimings;
  pageTimings?: readonly PreviewPageTiming[];
  error?: string;
};

export type PdfPreviewFrameTimings = {
  sourceInstallMs: number;
  pagedJsInitializationMs: number;
  paginationMs: number;
  paginationCssExtractionMs?: number;
  paginationCssCharacterCount?: number;
  paginationStyleCount?: number;
  pagedJsQueueCycleMs?: number;
  pagedJsQueueTaskCount?: number;
  marginMaterializationMs?: number;
  marginParseMs?: number;
  marginPageScanMs?: number;
  marginDomWriteMs?: number;
  marginPagesVisited?: number;
  marginContainersWritten?: number;
  artifactSerializationMs?: number;
};

export type PdfPreviewPageBoundary = { pageNumber: number; anchor: string };

export type PdfPreviewGuideRequest = {
  type: 'clear-writer-pdf-preview-guide-request';
  requestId: string;
  input: PdfPreviewGuideJob;
};

export type PdfPreviewGuideResult = {
  type: 'clear-writer-pdf-preview-guide-result';
  requestId: string;
  pageBoundaries: PdfPreviewPageBoundary[];
  paginationMs?: number;
  error?: string;
};

export type PdfPreviewFrameRequest = PdfPreviewRenderRequest | PdfPreviewGuideRequest;
export type PdfPreviewFrameResult = PdfPreviewRenderResult | PdfPreviewGuideResult;
export type PdfPreviewFrameMessage = PdfPreviewProgress | PdfPreviewFrameResult;

/** Expected terminal states for an isolated pagination request. */
export type PdfPreviewPaginationOutcome<T> =
  | { status: 'success'; result: T; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'cancelled'; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'timed-out'; message: string; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'failed'; message: string; diagnostics: PdfPreviewPaginationDiagnostics };

export const PDF_PREVIEW_FRAME_READY = 'clear-writer-pdf-preview-ready';
