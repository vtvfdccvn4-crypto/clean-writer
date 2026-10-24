import type { HeaderFooterRow, ProjectMetadata } from '../types';
import type { PreviewPageTiming } from '../perf/preview-timing';
import type { PdfArtifact } from './PdfArtifact';
import type { PdfRenderSnapshot } from './PdfRenderSnapshot';

export interface PdfPreviewMarginData {
  header: Readonly<HeaderFooterRow>;
  footer: Readonly<HeaderFooterRow>;
  metadata: Readonly<ProjectMetadata>;
}

/** Immutable input for one isolated PDF-preview pagination job. */
export type PdfPreviewJob = PdfRenderSnapshot;

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
};

/** Watchdog limits for one pagination job, in milliseconds. */
export type PdfPreviewWatchdogLimits = {
  /** Longest allowed wait without a newly completed physical page. */
  stallMs: number;
  /** Absolute upper bound on the job, however much progress it makes. */
  ceilingMs: number;
};

export type PdfPreviewPaginationBudget = PdfPreviewWatchdogLimits & {
  estimatedPages: number;
  imageCount: number;
  textCharacters: number;
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
  artifact: PdfArtifact;
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

export type PdfPreviewFrameRequest = PdfPreviewRenderRequest;
export type PdfPreviewFrameResult = PdfPreviewRenderResult;
/** Sent when a request arrives while the frame is still running another job. */
export type PdfPreviewBusyMessage = {
  type: 'clear-writer-pdf-preview-busy';
  requestId: string;
  activeRequestId: string;
};
export type PdfPreviewFrameMessage = PdfPreviewProgress | PdfPreviewFrameResult | PdfPreviewBusyMessage;

/** Expected terminal states for an isolated pagination request. */
export type PdfPreviewPaginationOutcome<T> =
  | { status: 'success'; result: T; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'cancelled'; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'timed-out'; message: string; diagnostics: PdfPreviewPaginationDiagnostics }
  | { status: 'failed'; message: string; diagnostics: PdfPreviewPaginationDiagnostics };

export const PDF_PREVIEW_FRAME_READY = 'clear-writer-pdf-preview-ready';
