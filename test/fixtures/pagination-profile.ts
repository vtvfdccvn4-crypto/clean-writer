import { RenderEngine } from '../../src/preview/RenderEngine';
import type { PageSetup } from '../../src/types';

type ProfileScenario = { name: string; html: string };
type ProfileRequest = { samples: number; scenarios: ProfileScenario[] };

declare global {
  interface Window {
    __RUN_PAGINATION_PROFILE__?: (request: ProfileRequest) => Promise<unknown>;
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

window.__RUN_PAGINATION_PROFILE__ = async ({ scenarios, samples }) => {
  await warmPaginationRuntime();
  const results = [];
  for (const scenario of scenarios) {
    const durations: number[] = [];
    let pageCount = 0;

    for (let sample = 0; sample < samples; sample += 1) {
      const oldStage = document.getElementById('stage');
      const stage = document.createElement('div');
      stage.id = 'stage';
      stage.className = 'paged-stage';
      oldStage?.replaceWith(stage);
      const engine = new RenderEngine(stage, {
        renderTimeoutMs: 120_000,
        unthrottledPagination: true
      });
      const started = performance.now();
      await engine.runRender(scenario.html, pageSetup, null, null);
      const elapsed = performance.now() - started;
      pageCount = stage.querySelectorAll('.pagedjs_page').length;
      durations.push(elapsed);
      await nextFrame();
    }

    const paginationMs = summarize(durations);
    results.push({
      name: scenario.name,
      pageCount,
      paginationMs,
      medianMsPerPage: round(paginationMs.median / Math.max(1, pageCount))
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
  await engine.runRender('<p>Pagination profiler warmup.</p>', pageSetup, null, null);
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    min: round(sorted[0] ?? 0),
    max: round(sorted.at(-1) ?? 0)
  };
}

function percentile(sorted: number[], quantile: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}
