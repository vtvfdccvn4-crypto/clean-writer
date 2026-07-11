import { RenderEngine } from '../../src/preview/RenderEngine';
import type { PageSetup } from '../../src/types';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    gc?: () => void;
  }
}

const pageSetup: PageSetup = {
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 18,
  marginRight: 18
};

async function forceGC() {
  for (let i = 0; i < 2; i++) {
    if (typeof window.gc === 'function') {
      window.gc();
    } else if (typeof globalThis.gc === 'function') {
      (globalThis as any).gc();
    }
    // Yield to the event loop so finalizers and garbage collection tasks can run
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function getHeapSize(): number {
  if (window.performance && (window.performance as any).memory) {
    return (window.performance as any).memory.usedJSHeapSize;
  }
  return 0;
}

async function run() {
  const stage = document.getElementById('stage')!;
  const engine = new RenderEngine(stage, {
    renderTimeoutMs: 120_000,
    unthrottledPagination: true
  });

  // Warmup run to initialize JIT, layout engine, and Paged.js internal cache
  const warmupHtml = '<p>Pagination warmup for memory leak test.</p>';
  await engine.runRender(warmupHtml, pageSetup, null, null);
  await forceGC();

  const baselineHeap = getHeapSize();
  if (baselineHeap === 0) {
    throw new Error('window.performance.memory is not available in this environment.');
  }

  const workloadHtml = buildFivePageWorkload();
  const cycles = 5;
  const history: Array<{
    cycle: number;
    heapSize: number;
    listenerCount: number;
    isRenderActive: boolean;
    pageCount: number;
  }> = [];

  for (let cycle = 1; cycle <= cycles; cycle++) {
    // Perform render
    await engine.runRender(workloadHtml, pageSetup, null, null);
    
    // Check page count immediately after rendering
    const pageCount = stage.querySelectorAll('.pagedjs_page').length;
    
    // Call GC and yield to task queue
    await forceGC();

    // Get current heap size and listener info
    const heapSize = getHeapSize();
    const adapterState = (engine as any).pagedJs.getDebugState();

    history.push({
      cycle,
      heapSize,
      listenerCount: adapterState.interceptedListenerCount,
      isRenderActive: adapterState.isRenderActive,
      pageCount
    });
  }

  const finalHeap = getHeapSize();
  const retainedHeapGrowth = finalHeap - baselineHeap;

  window.__HARNESS_RESULT__ = {
    ok: true,
    baselineHeap,
    finalHeap,
    retainedHeapGrowth,
    history
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});

function buildFivePageWorkload() {
  return Array.from({ length: 5 }, (_, index) => {
    const sectionBreak = index === 0 ? '' : '<div class="section-break" aria-hidden="true">&nbsp;</div>\n';
    return [
      `<div class="document-section" data-section-index="${index}">`,
      sectionBreak,
      `<h1>Budget section ${index + 1}</h1>`,
      `<p>Controlled pagination workload ${index + 1} keeps the page height consistent and the section small.</p>`,
      `<p>This verifies the hidden-worker pagination path without letting a single section spill onto an extra page.</p>`,
      `</div>`
    ].join('');
  }).join('\n');
}
