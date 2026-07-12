import { state } from '../../src/state';
import type { EditorManager } from '../../src/ui/editor-manager';
import { generateLargeProject } from './helpers/project-generator.ts';
import { click, isHidden, waitFor as waitForSmoke } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __HARNESS_PROGRESS__?: string;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

const waitFor = <T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> =>
  waitForSmoke(label, read, timeoutMs, { reportProgress: true });

async function run() {
  console.log('[PERF] Starting run()');
  
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
  
  // Generate a moderately large nested project (50 sections in 10 folders).
  console.log('[PERF] Generating large project');
  await generateLargeProject(projectDir, 50);
  (window as any).__HARNESS_PROGRESS__ = 'large project generated';

  // ADD TO CATALOGUE
  const { OPFSCatalogue } = await import('../../src/platform/OPFSCatalogue.ts');
  const catalogue = new OPFSCatalogue();
  await catalogue.register({ id: 'test-perf-project', kind: 'opfs', displayName: 'Generated Performance Project' });
  state.setProjectRef({ id: 'test-perf-project', kind: 'opfs', displayName: 'Generated Performance Project' });

  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  // Wait for the project to finish loading
  await waitFor('nested project tree to load', () => {
    const rows = document.querySelectorAll('#section-list .tree-row');
    if (rows.length >= 60) return true;
    
    // Log the current state to see what's rendering
    const listHtml = document.getElementById('section-list')?.innerHTML;
    console.log(`[PERF] Loaded rows: ${rows.length}, HTML: ${listHtml?.substring(0, 200)}`);
    return null;
  }, 10000);
  (window as any).__HARNESS_PROGRESS__ = 'nested project tree loaded';

  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__ as EditorManager;

  // 1. Measure Outline Opening Performance
  const t0 = performance.now();
  console.log('[PERF] Clicking outline button');
  const outlineBtn = document.getElementById('btn-open-document-outline');
  await click('#btn-open-document-outline');
  console.log('[PERF] Click executed, waiting for drawer');
  await waitFor('outline drawer open', () => {
    const hidden = isHidden(document.getElementById('document-outline-drawer'));
    console.log('[PERF] outline hidden state:', hidden);
    return !hidden ? true : null;
  });
  
  await waitFor('outline built', () => {
    const headings = document.querySelectorAll('#document-outline-content .document-outline-heading');
    // 50 sections * 6 headings (1 title + 5 subs) = 300 headings expected
    return headings.length === 300 ? true : null;
  }, 10000);
  const t1 = performance.now();
  const outlineRenderMs = t1 - t0;
  (window as any).__HARNESS_PROGRESS__ = 'outline opened and measured';
  
  // Close Outline Drawer
  await click('#document-outline-drawer .drawer-close-button');
  await waitFor('outline drawer closed', () => isHidden(document.getElementById('document-outline-drawer')) ? true : null);

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
  
  await waitFor('active file switched to Section50', () => state.current.activeFile === 'sections/Chapter10/Section50.md' ? true : null);
  await waitFor('Section50 loaded', () => document.querySelector('.cm-content') && editorManager.getEditorView().getValue().includes('PERFORMANCE_SEARCH_TOKEN_XYZ') ? true : null);
  editorManager.getEditorView().focus();
  const editorInputReady = document.activeElement?.closest('.cm-editor') !== null;
  const t5 = performance.now();
  const searchNavigationMs = t5 - t4;
  (window as any).__HARNESS_PROGRESS__ = 'search navigation measured';

  // 4. Repeated Interactions Check
  // Open and close outline 5 times rapidly
  for (let i = 0; i < 5; i++) {
    await click('#btn-open-document-outline');
    await waitFor('outline open loop', () => !isHidden(document.getElementById('document-outline-drawer')) ? true : null);
    await click('#document-outline-drawer .drawer-close-button');
    await waitFor('outline close loop', () => isHidden(document.getElementById('document-outline-drawer')) ? true : null);
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
    repeatedInteractionsStable: true
  };
}

run().catch(err => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: err.stack || String(err)
  };
});
