export const PDF_PIPELINE_PROTOCOL_VERSION = 1 as const;
export const PDF_ARTIFACT_SCHEMA_VERSION = 1 as const;

export const FRAME_READY_MESSAGE = 'isolated-pdf-renderer/ready' as const;
export const RENDER_REQUEST_MESSAGE = 'isolated-pdf-renderer/request' as const;
export const RENDER_PROGRESS_MESSAGE = 'isolated-pdf-renderer/progress' as const;
export const RENDER_RESULT_MESSAGE = 'isolated-pdf-renderer/result' as const;

export interface PdfRenderJob {
  readonly protocolVersion: typeof PDF_PIPELINE_PROTOCOL_VERSION;
  /** SHA-256 identity of every input that can affect the physical pages. */
  readonly renderId: string;
  /** Trusted HTML. Sanitize untrusted content before creating the job. */
  readonly html: string;
  readonly css: string;
  /** CSS applied to the serialized physical-page artifact, after pagination. */
  readonly artifactCss: string;
}

export interface PdfArtifactPage {
  readonly number: number;
  readonly anchor?: string;
}

export interface PdfArtifact {
  readonly schemaVersion: typeof PDF_ARTIFACT_SCHEMA_VERSION;
  readonly artifactId: string;
  readonly renderId: string;
  readonly html: string;
  readonly css: string;
  readonly pageCount: number;
  readonly pages: readonly PdfArtifactPage[];
}

export interface PaginationBudget {
  readonly estimatedPages: number;
  readonly imageCount: number;
  readonly textCharacters: number;
  readonly timeoutMs: number;
}

export type PipelinePhase =
  | 'load-frame'
  | 'paginate'
  | 'transfer-artifact'
  | 'install-print-document'
  | 'wait-for-resources'
  | 'print';

export interface PipelineProgress {
  readonly type: typeof RENDER_PROGRESS_MESSAGE;
  readonly requestId: string;
  readonly phase: PipelinePhase;
  readonly pagesCompleted?: number;
  readonly estimatedPages: number;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
}

export interface PhaseTiming {
  readonly phase: PipelinePhase;
  readonly durationMs: number;
}

export interface PaginationDiagnostics {
  readonly requestId: string;
  readonly budget: PaginationBudget;
  readonly elapsedMs: number;
  readonly pageCount?: number;
  readonly timings: readonly PhaseTiming[];
}

export type PaginationOutcome =
  | { readonly status: 'success'; readonly artifact: PdfArtifact; readonly diagnostics: PaginationDiagnostics }
  | { readonly status: 'cancelled'; readonly diagnostics: PaginationDiagnostics }
  | { readonly status: 'timed-out'; readonly message: string; readonly diagnostics: PaginationDiagnostics }
  | { readonly status: 'failed'; readonly message: string; readonly diagnostics: PaginationDiagnostics };

export interface FrameReadyMessage {
  readonly type: typeof FRAME_READY_MESSAGE;
  readonly protocolVersion: typeof PDF_PIPELINE_PROTOCOL_VERSION;
}

export interface RenderRequestMessage {
  readonly type: typeof RENDER_REQUEST_MESSAGE;
  readonly protocolVersion: typeof PDF_PIPELINE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly input: PdfRenderJob;
}

export interface RenderProgressMessage {
  readonly type: typeof RENDER_PROGRESS_MESSAGE;
  readonly protocolVersion: typeof PDF_PIPELINE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly phase: 'paginate';
  readonly pagesCompleted: number;
}

export interface RenderResultMessage {
  readonly type: typeof RENDER_RESULT_MESSAGE;
  readonly protocolVersion: typeof PDF_PIPELINE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly artifact?: PdfArtifact;
  readonly paginationMs: number;
  readonly error?: string;
}
