import { state } from '../../src/state';
import { projectSession } from '../../src/services/ProjectSessionStore';
import type { EditorManager } from '../../src/ui/editor-manager';
import { generateLargeProject } from './helpers/project-generator.ts';
import { click, isHidden, waitFor as waitForSmoke } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __HARNESS_PROGRESS__?: string;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
    clearWriterPerf?: {
      snapshot(): {
        previewTimings: Array<{
          kind: string;
          status: string;
          totalDurationMs: number;
          phases: Array<{ phase: string; durationMs: number }>;
          pageTimings?: Array<{ pageNumber: number; deltaMs: number; domNodeCount: number }>;
          metadata?: { pageCount?: number };
        }>;
      };
    };
  }
}

const waitFor = <T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> =>
  waitForSmoke(label, read, timeoutMs, { reportProgress: true });

async function run() {
  console.log('[PERF] Starting run()');
  const requestedSectionCount = Number(new URLSearchParams(window.location.search).get('sections') ?? '50');
  const sectionCount = Number.isInteger(requestedSectionCount) && requestedSectionCount > 0 ? requestedSectionCount : 50;
  
  // Clean up any old test sessions
  try {
    console.log('[PERF] Getting OPFS root');
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    console.log('[PERF] Removing old perf project');
    await projectsDir.removeEntry('test-perf-project', { recursive: true });
  } catch (e) {
    console.log('[PERF] Ignore removeEntry error', String(e));
  }
  
  console.log('[PERF] Initializing test session');
  const root = await navigator.storage.getDirectory();
  const projectsDir = await root.getDirectoryHandle('projects', { create: true });
  const projectDir = await projectsDir.getDirectoryHandle('test-perf-project', { create: true });
  (window as any).__HARNESS_PROGRESS__ = 'test session initialized';
  
  // Generate a configurable nested project for preview timing baselines.
  console.log('[PERF] Generating large project');
  await generateLargeProject(projectDir, sectionCount);
  (window as any).__HARNESS_PROGRESS__ = 'large project generated';

  // ADD TO CATALOGUE
  const { OPFSCatalogue } = await import('../../src/platform/OPFSCatalogue.ts');
  const catalogue = new OPFSCatalogue();
  await catalogue.register({ id: 'test-perf-project', kind: 'opfs', displayName: 'Generated Performance Project' });
  // Open it through the app's own startup restore. Setting state.projectRef
  // directly would make the project lifecycle treat a project as already
  // present, so startup would skip opening it.
  const startupUrl = new URL(window.location.href);
  startupUrl.searchParams.set('restoreLastWorkspace', 'true');
  window.history.replaceState(null, '', startupUrl);

  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  // Wait for the project to finish loading
  await waitFor('nested project tree to load', () => {
    const loadedSectionCount = state.current.sections.filter(section => !section.isDir).length;
    const explorerReady = document.querySelector('#task-explorer-content .task-explorer-tree') !== null;
    if (loadedSectionCount >= sectionCount && explorerReady) return true;
    
    // Log the current state to see what's rendering
    const listHtml = document.getElementById('task-explorer-content')?.innerHTML;
    const welcomeVisible = document.getElementById('welcome-screen-root')?.hidden === false;
    console.log(`[PERF] Loaded sections: ${loadedSectionCount}, project: ${state.current.projectRef?.id ?? 'none'}, lifecycle: ${projectSession.getStatus()}, welcome visible: ${welcomeVisible}, HTML: ${listHtml?.substring(0, 200)}`);
    return null;
  }, 10000);
  (window as any).__HARNESS_PROGRESS__ = 'nested project tree loaded';

  const previewTiming = await waitFor('full-document preview timing', () => {
    const records = window.clearWriterPerf?.snapshot().previewTimings ?? [];
    return records.find(record => record.kind === 'document-preview' && record.status === 'success') ?? null;
  }, 60_000);
  const previewPhaseNames = previewTiming.phases.map(phase => phase.phase);
  const requiredPreviewPhases = [
    'snapshot-load',
    'asset-preload',
    'compile-parse-markdown',
    'compile-transform-document',
    'compile-stringify-html',
    'compile-rebase-manifest',
    'compile',
    'create-pagination-job',
    'load-pagination-frame',
    'paginate',
    'transfer-print-artifact',
    'parse-artifact',
    'install-pages',
    'build-navigation-index',
    'restore-scroll',
    'total'
  ];
  // A result served from the worker's cache runs no compile, so it has no compile sub-phases.
  const compileSubPhases = ['compile-parse-markdown', 'compile-transform-document', 'compile-stringify-html', 'compile-rebase-manifest'];
  const expectedPhases = previewTiming.metadata?.compileCacheHit === true
    ? requiredPreviewPhases.filter(phase => !compileSubPhases.includes(phase))
    : requiredPreviewPhases;
  if (expectedPhases.some(phase => !previewPhaseNames.includes(phase))) {
    throw new Error(`Full-document preview timing is missing phases: ${expectedPhases.filter(phase => !previewPhaseNames.includes(phase)).join(', ')}; phases: ${previewPhaseNames.join(',')}; metadata: ${JSON.stringify(previewTiming.metadata)}`);
  }
  if (new URLSearchParams(window.location.search).get('preview-diagnostics') === 'true'
    && previewTiming.pageTimings?.length !== previewTiming.metadata?.pageCount) {
    throw new Error(`Expected one page timing per page, got ${previewTiming.pageTimings?.length ?? 0} for ${previewTiming.metadata?.pageCount ?? 0} pages`);
  }
  (window as any).__HARNESS_PROGRESS__ = 'full-document preview timing captured';

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__ as EditorManager;

  // 1. Measure Outline Opening Performance
  const t0 = performance.now();
  console.log('[PERF] Clicking outline button');
  await click('#btn-activity-outline');
  console.log('[PERF] Click executed, waiting for panel');
  await waitFor('outline panel open', () => !document.querySelector<HTMLElement>('.outline-section')?.classList.contains('hidden') ? true : null);
  
  await waitFor('outline built', () => {
    const headings = document.querySelectorAll('#document-outline-content .document-outline-heading');
    return headings.length === sectionCount * 6 ? true : null;
  }, 10000);
  const t1 = performance.now();
  const outlineRenderMs = t1 - t0;
  (window as any).__HARNESS_PROGRESS__ = 'outline opened and measured';
  
  // Close the outline panel by clicking its active activity button.
  await click('#btn-activity-outline');
  await waitFor('outline panel closed', () => document.querySelector<HTMLElement>('.outline-section')?.classList.contains('hidden') ? true : null);

  // 2. Measure Search Execution Performance
  const t2 = performance.now();
  await click('#btn-open-project-search');
  await waitFor('search drawer open', () => !isHidden(document.getElementById('project-search-drawer')) ? true : null);
  (window as any).__HARNESS_PROGRESS__ = 'search drawer opened';

  const searchInput = document.getElementById('project-search-input') as HTMLInputElement;
  searchInput.value = 'PERFORMANCE_SEARCH_TOKEN_XYZ';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

  await waitFor('search results populated', () => {
    const results = document.querySelectorAll('#project-search-results .project-search-item');
    return results.length === 1 ? true : null;
  }, 10000);
  const t3 = performance.now();
  const searchExecutionMs = t3 - t2;
  (window as any).__HARNESS_PROGRESS__ = 'search execution measured';

  // 3. Measure Navigation Performance
  const t4 = performance.now();
  const firstSearchResult = document.querySelector('#project-search-results .project-search-item') as HTMLElement;
  firstSearchResult.click();
  
  const lastSectionPath = `sections/Chapter${Math.ceil(sectionCount / 5)}/Section${sectionCount}.md`;
  await waitFor(`active file switched to Section${sectionCount}`, () => state.current.activeFile === lastSectionPath ? true : null);
  await waitFor(`Section${sectionCount} loaded`, () => document.querySelector('.cm-content') && editorManager.getEditorView().getValue().includes('PERFORMANCE_SEARCH_TOKEN_XYZ') ? true : null);
  editorManager.getEditorView().focus();
  const editorInputReady = document.activeElement?.closest('.cm-editor') !== null;
  const t5 = performance.now();
  const searchNavigationMs = t5 - t4;
  (window as any).__HARNESS_PROGRESS__ = 'search navigation measured';

  // 4. Repeated Interactions Check
  // Open and close outline 5 times rapidly
  for (let i = 0; i < 5; i++) {
    await click('#btn-activity-outline');
    await waitFor('outline open loop', () => !document.querySelector<HTMLElement>('.outline-section')?.classList.contains('hidden') ? true : null);
    await click('#btn-activity-outline');
    await waitFor('outline close loop', () => document.querySelector<HTMLElement>('.outline-section')?.classList.contains('hidden') ? true : null);
  }
  (window as any).__HARNESS_PROGRESS__ = 'repeated interaction 1 measured';
  
  // Reopen and close search repeatedly, changing the query each time. This
  // catches stale work and duplicate handlers without depending on timings.
  for (let i = 0; i < 5; i++) {
    await click('#btn-open-project-search');
    await waitFor('search drawer open loop', () => !isHidden(document.getElementById('project-search-drawer')) ? true : null);
    searchInput.value = `SEARCH_LOOP_${i}`;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor('search loop empty state', () => document.getElementById('project-search-empty')?.classList.contains('hidden') === false ? true : null);
    await click('#project-search-drawer .drawer-close-button');
    await waitFor('search drawer close loop', () => isHidden(document.getElementById('project-search-drawer')) ? true : null);
  }
  (window as any).__HARNESS_PROGRESS__ = 'repeated interaction 2 measured';

  window.__HARNESS_RESULT__ = {
    ok: true,
    outlineRenderMs,
    searchExecutionMs,
    searchNavigationMs,
    editorInputReady,
    repeatedInteractionsStable: true,
    sectionCount,
    previewTiming
  };
}

run().catch(err => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: err.stack || String(err)
  };
});
