export const PDF_PREVIEW_PROTOCOL_VERSION = 2 as const;
export const PDF_ARTIFACT_SCHEMA_VERSION = 2 as const;

export const CONNECT_MESSAGE = 'codebase-pdf/connect' as const;
export const READY_MESSAGE = 'codebase-pdf/ready' as const;
export const RENDER_MESSAGE = 'codebase-pdf/render' as const;
export const PROGRESS_MESSAGE = 'codebase-pdf/progress' as const;
export const RESULT_MESSAGE = 'codebase-pdf/result' as const;

export interface PdfRenderJob {
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly renderId: string;
  /** Trusted, already-sanitized HTML. Use compileTextBundle() for untrusted text. */
  readonly html: string;
  readonly css: string;
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

export type RenderPhase = 'load-frame' | 'connect-frame' | 'paginate' | 'transfer-artifact';

export interface RenderProgress {
  readonly requestId: string;
  readonly phase: RenderPhase;
  readonly pagesCompleted?: number;
  readonly estimatedPages: number;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
}

export interface RenderDiagnostics {
  readonly requestId: string;
  readonly budget: PaginationBudget;
  readonly elapsedMs: number;
  readonly pageCount?: number;
  readonly cacheHit: boolean;
}

export type RenderOutcome =
  | { readonly status: 'success'; readonly artifact: PdfArtifact; readonly diagnostics: RenderDiagnostics }
  | { readonly status: 'cancelled'; readonly diagnostics: RenderDiagnostics }
  | { readonly status: 'timed-out'; readonly message: string; readonly diagnostics: RenderDiagnostics }
  | { readonly status: 'failed'; readonly message: string; readonly diagnostics: RenderDiagnostics };

export interface ConnectMessage {
  readonly type: typeof CONNECT_MESSAGE;
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly channelId: string;
}

export interface ReadyMessage {
  readonly type: typeof READY_MESSAGE;
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly channelId: string;
}

export interface RenderMessage {
  readonly type: typeof RENDER_MESSAGE;
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly input: PdfRenderJob;
}

export interface ProgressMessage {
  readonly type: typeof PROGRESS_MESSAGE;
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly pagesCompleted: number;
}

export interface ResultMessage {
  readonly type: typeof RESULT_MESSAGE;
  readonly protocolVersion: typeof PDF_PREVIEW_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly paginationMs: number;
  readonly artifact?: PdfArtifact;
  readonly error?: string;
}
