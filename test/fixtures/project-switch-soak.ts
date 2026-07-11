import { PreviewController } from '../../src/preview/PreviewController';
import type { PageSetup } from '../../src/types';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    gc?: () => void;
  }
}

const pageSetupA: PageSetup = {
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 15,
  marginBottom: 15,
  marginLeft: 15,
  marginRight: 15
};

const pageSetupB: PageSetup = {
  paperWidth: 215.9,
  paperHeight: 279.4,
  marginTop: 35,
  marginBottom: 35,
  marginLeft: 35,
  marginRight: 35
};

async function forceGC() {
  for (let i = 0; i < 2; i++) {
    if (typeof window.gc === 'function') {
      window.gc();
    } else if (typeof globalThis.gc === 'function') {
      (globalThis as any).gc();
    }
    // Yield to the event loop so V8 tasks can run
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
  const controller = new PreviewController(stage, {
    renderTimeoutMs: 120_000,
    unthrottledPagination: true
  });

  const htmlA = buildWorkload('A', 5);
  const htmlB = buildWorkload('B', 3);

  // Warmup run to stabilize the browser runtime state
  await controller.applyPageSetup(pageSetupA, false);
  await controller.forceRender(htmlA);
  await forceGC();

  const baselineHeap = getHeapSize();
  if (baselineHeap === 0) {
    throw new Error('window.performance.memory is not available.');
  }

  // Verify stale render prevention (race condition test)
  controller.clear();
  controller.applyPageSetup(pageSetupA, false);
  // Trigger A but don't await immediately, then trigger B
  const pA = controller.forceRender(htmlA);
  controller.applyPageSetup(pageSetupB, false);
  const pB = controller.forceRender(htmlB);

  await Promise.all([pA, pB]);
  await forceGC();

  const textContent = stage.textContent || '';
  // Confirm only Project B's content was committed, and Project A's render was discarded
  const hasOnlyB = textContent.includes('Project B section') && !textContent.includes('Project A section');
  const pagesCountAfterRace = stage.querySelectorAll('.pagedjs_page').length;

  // Run the switch soak loop (10 transitions)
  const history: Array<{
    transition: number;
    project: string;
    heapSize: number;
    pageCount: number;
  }> = [];

  for (let i = 1; i <= 10; i++) {
    const isA = i % 2 === 1;
    const projectLabel = isA ? 'A' : 'B';
    const pageSetup = isA ? pageSetupA : pageSetupB;
    const html = isA ? htmlA : htmlB;

    controller.clear();
    controller.applyPageSetup(pageSetup, false);
    await controller.forceRender(html);
    await forceGC();

    const heapSize = getHeapSize();
    const pageCount = stage.querySelectorAll('.pagedjs_page').length;

    history.push({
      transition: i,
      project: projectLabel,
      heapSize,
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
    hasOnlyB,
    pagesCountAfterRace,
    history
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});

function buildWorkload(label: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const sectionBreak = index === 0 ? '' : '<div class="section-break" aria-hidden="true">&nbsp;</div>\n';
    return [
      `<div class="document-section" data-section-index="${index}">`,
      sectionBreak,
      `<h1>Project ${label} section ${index + 1}</h1>`,
      `<p>Controlled workload for project ${label} page ${index + 1}.</p>`,
      `</div>`
    ].join('');
  }).join('\n');
}
