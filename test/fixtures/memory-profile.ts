import { RenderEngine } from '../../src/preview/RenderEngine';
import type { PageSetup } from '../../src/types';

type ProfileScenario = { name: string; html: string };
type ProfileRequest = { samples: number; scenarios: ProfileScenario[] };

declare global {
  interface Window {
    __RUN_MEMORY_PROFILE__?: (request: ProfileRequest) => Promise<unknown>;
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
    // Yield so V8 garbage collection can run
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function getHeapSize(): number {
  if (window.performance && (window.performance as any).memory) {
    return (window.performance as any).memory.usedJSHeapSize;
  }
  return 0;
}

window.__RUN_MEMORY_PROFILE__ = async ({ scenarios, samples }) => {
  await warmPaginationRuntime();
  const results = [];

  for (const scenario of scenarios) {
    const heapSizes: number[] = [];
    let pageCount = 0;

    // Baseline run
    const oldStage = document.getElementById('stage');
    const stage = document.createElement('div');
    stage.id = 'stage';
    stage.className = 'paged-stage';
    oldStage?.replaceWith(stage);

    const engine = new RenderEngine(stage, {
      renderTimeoutMs: 120_000,
      unthrottledPagination: true
    });

    // Warmup the scenario once
    await engine.runRender(scenario.html, pageSetup, null, null);
    await forceGC();
    const baselineHeap = getHeapSize();

    for (let sample = 0; sample < samples; sample += 1) {
      // Re-trigger render
      await engine.runRender(scenario.html, pageSetup, null, null);
      pageCount = stage.querySelectorAll('.pagedjs_page').length;

      // Yield and run GC
      await forceGC();
      heapSizes.push(getHeapSize());
      await nextFrame();
    }

    const finalHeap = getHeapSize();
    const retainedHeapGrowth = finalHeap - baselineHeap;

    results.push({
      name: scenario.name,
      pageCount,
      medianHeapMiB: round(percentile(heapSizes, 0.5) / 1024 / 1024),
      p95HeapMiB: round(percentile(heapSizes, 0.95) / 1024 / 1024),
      retainedHeapGrowthMiB: round(retainedHeapGrowth / 1024 / 1024),
      historyMiB: heapSizes.map(h => round(h / 1024 / 1024))
    });
  }

  return results;
};

async function warmPaginationRuntime() {
  const oldStage = document.getElementById('stage');
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.className = 'paged-stage';
  oldStage?.replaceWith(stage);
  const engine = new RenderEngine(stage, {
    renderTimeoutMs: 30_000,
    unthrottledPagination: true
  });
  await engine.runRender('<p>Pagination memory profiling warmup.</p>', pageSetup, null, null);
}

function percentile(sorted: number[], quantile: number) {
  const arr = [...sorted].sort((left, right) => left - right);
  if (arr.length === 0) return 0;
  return arr[Math.min(arr.length - 1, Math.ceil(arr.length * quantile) - 1)];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}
