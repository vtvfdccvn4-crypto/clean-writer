/**
 * Structured timing data for one full-document preview attempt.
 *
 * This contract is intentionally independent from the aggregate metrics in
 * preview-metrics.ts. Aggregate metrics are useful for a compact status chip;
 * these records explain where one particular preview spent its time.
 */

export type PreviewOperationId = string;

export type PreviewOperationKind = 'document-preview' | 'pdf-export' | 'page-guides';

export type PreviewOperationTrigger =
  | 'project-open'
  | 'full-document-mode'
  | 'single-document-load'
  | 'page-settings-change'
  | 'manual-refresh'
  | 'recovery';

export type PreviewOperationStatus = 'success' | 'stale' | 'cancelled' | 'failed';

/** Ordered phases used by full-document preview timing. */
export type PreviewTimingPhase =
  | 'snapshot-load'
  | 'asset-preload'
  | 'compile'
  | 'compile-parse-markdown'
  | 'compile-transform-document'
  | 'compile-stringify-html'
  | 'compile-rebase-manifest'
  | 'create-pagination-job'
  | 'load-pagination-frame'
  | 'frame-source-install'
  | 'frame-pagedjs-initialization'
  | 'frame-pagedjs-queue-cycle'
  | 'frame-pagination-css-extraction'
  | 'paginate'
  | 'frame-margin-materialization'
  | 'frame-margin-dom-write'
  | 'frame-artifact-serialization'
  | 'transfer-print-artifact'
  | 'parse-artifact'
  | 'install-pages'
  | 'build-navigation-index'
  | 'restore-scroll'
  | 'total';

export interface PreviewPhaseTiming {
  phase: PreviewTimingPhase;
  durationMs: number;
}

export interface PreviewPageTiming {
  pageNumber: number;
  elapsedMs: number;
  deltaMs: number;
  domNodeCount: number;
  imageCount: number;
  tableCount: number;
  headingCount: number;
  sourceAnchor?: string;
}

export interface PreviewDocumentMetadata {
  /** Project-relative active document path, when applicable. */
  documentPath?: string;
  sourceRevision?: number | null;
  sourceSectionCount?: number;
  sourceFileCount?: number;
  sourceCharacterCount?: number;
  compiledHtmlCharacterCount?: number;
  manifestEntryCount?: number;
  imageCount?: number;
  estimatedPageCount?: number;
  pageCount?: number;
  artifactCharacterCount?: number;
  paginationCssCharacterCount?: number;
  paginationStyleCount?: number;
}

export interface PreviewTimingRecord {
  operationId: PreviewOperationId;
  kind: PreviewOperationKind;
  trigger?: PreviewOperationTrigger;
  status: PreviewOperationStatus;
  startedAt: number;
  completedAt: number;
  totalDurationMs: number;
  metadata: PreviewDocumentMetadata;
  phases: readonly PreviewPhaseTiming[];
  pageTimings?: readonly PreviewPageTiming[];
  slowestPhase?: PreviewTimingPhase;
  errorMessage?: string;
}
