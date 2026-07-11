import { Previewer } from 'pagedjs';
import { RenderEngine } from '../../src/preview/RenderEngine';
import type { PageSetup } from '../../src/types';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const pageSetup: PageSetup = {
  paperWidth: 148,
  paperHeight: 210,
  marginTop: 16,
  marginBottom: 16,
  marginLeft: 16,
  marginRight: 16
};

async function run() {
  const stage = document.getElementById('stage')!;
  let factoryCalls = 0;
  const engine = new RenderEngine(stage, {
    renderTimeoutMs: 60,
    previewerFactory: () => {
      factoryCalls += 1;
      // The constructor consumes call 1. Call 2 simulates a Paged.js job whose
      // promise never resolves; subsequent calls use the real library.
      if (factoryCalls === 2) return { preview: () => new Promise(() => undefined) };
      return new Previewer();
    }
  });

  const started = performance.now();
  await engine.runRender('<h1>Timed out generation</h1><p>Fallback remains readable.</p>', pageSetup, null, null);
  const timeoutElapsedMs = performance.now() - started;
  const fallbackReadable = stage.textContent?.includes('Fallback remains readable.') ?? false;

  await engine.runRender(
    '<h1>Recovered generation</h1><p>REAL_PAGED_RECOVERY_CONTENT</p>',
    pageSetup,
    null,
    null
  );

  window.__HARNESS_RESULT__ = {
    ok: true,
    timeoutElapsedMs,
    fallbackReadable,
    pageCount: stage.querySelectorAll('.pagedjs_page').length,
    recoveredText: stage.textContent?.includes('REAL_PAGED_RECOVERY_CONTENT') ?? false,
    factoryCalls
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
