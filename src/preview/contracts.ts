export interface RenderResult {
  status: 'rendered' | 'degraded' | 'stale';
  pageCount: number;
  error?: Error;
}
