import { paginateIsolated } from './helpers/isolated-pagination.ts';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

async function run() {
  const started = performance.now();
  const first = await paginateIsolated('<h1>Timed out generation</h1><p>Fallback remains readable.</p>');
  const timeoutElapsedMs = performance.now() - started;
  const fallbackReadable = first.status === 'success' && first.result.html.includes('Fallback remains readable.');
  const recovered = await paginateIsolated(
    '<h1>Recovered generation</h1><p>REAL_PAGED_RECOVERY_CONTENT</p>',
  );

  window.__HARNESS_RESULT__ = {
    ok: first.status === 'success' && recovered.status === 'success',
    timeoutElapsedMs,
    fallbackReadable,
    pageCount: recovered.status === 'success' ? recovered.result.pageCount : 0,
    recoveredText: recovered.status === 'success' && recovered.result.html.includes('REAL_PAGED_RECOVERY_CONTENT'),
    firstStatus: first.status,
    recoveredStatus: recovered.status
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
