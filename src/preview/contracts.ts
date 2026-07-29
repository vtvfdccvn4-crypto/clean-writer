import type { PagedPreviewerFactory } from './PagedJsAdapter';

/** Options retained for the live-preview adapter boundary. */
export interface LivePreviewOptions {
  renderTimeoutMs?: number;
  previewerFactory?: PagedPreviewerFactory;
  unthrottledPagination?: boolean;
}

export interface RenderResult {
  status: 'rendered' | 'degraded' | 'stale';
  pageCount: number;
  error?: Error;
}
