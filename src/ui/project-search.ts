import { state, APP_STATE_EVENTS } from '../state';
import { closeDrawer, toggleDrawer } from './drawer-manager';
import type { EditorManager } from './editor-manager';
import type { Platform } from '../platform/types';
import { searchProject, type ProjectSearchResult } from '../services/project-search';

export function initProjectSearchDrawer(platform: Platform, editorManager: EditorManager) {
  const btnOpen = document.getElementById('btn-open-project-search');
  const drawer = document.getElementById('project-search-drawer');
  const input = document.getElementById('project-search-input') as HTMLInputElement | null;
  const statusContainer = document.getElementById('project-search-status');
  const resultsContainer = document.getElementById('project-search-results');
  const emptyState = document.getElementById('project-search-empty');

  if (!btnOpen || !drawer || !input || !statusContainer || !resultsContainer || !emptyState) return;

  let currentAbortController: AbortController | null = null;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  drawer.querySelector<HTMLElement>('.drawer-close-button')?.addEventListener('click', () => {
    closeDrawer(drawer);
  });

  btnOpen.addEventListener('click', () => {
    const isOpening = drawer.classList.contains('hidden');
    toggleDrawer(drawer);
    if (isOpening) {
      setTimeout(() => input.focus(), 50);
    }
  });

  drawer.addEventListener('transitionend', () => {
    if (drawer.classList.contains('hidden')) {
      clearSearch();
    }
  });

  input.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      void performSearch(input.value);
    }, 300);
  });

  state.on(APP_STATE_EVENTS.projectTreeChanged, () => {
    if (!drawer.classList.contains('hidden')) {
      void performSearch(input.value);
    } else {
      clearSearch();
    }
  });

  state.on(APP_STATE_EVENTS.projectChanged, () => {
    clearSearch();
  });

  function clearSearch() {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    input!.value = '';
    statusContainer!.textContent = '';
    statusContainer!.classList.add('hidden');
    resultsContainer!.innerHTML = '';
    emptyState!.classList.add('hidden');
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  async function performSearch(query: string) {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    query = query.trim();
    if (!query) {
      resultsContainer!.innerHTML = '';
      emptyState!.classList.add('hidden');
      statusContainer!.classList.add('hidden');
      return;
    }

    const { projectRef, sections } = state.current;
    if (!projectRef || !sections) return;

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    statusContainer!.textContent = 'Searching...';
    statusContainer!.classList.remove('hidden');
    emptyState!.classList.add('hidden');
    resultsContainer!.innerHTML = '';

    try {
      const session = await platform.workspaceRepository.open(projectRef);
      if (signal.aborted) return;

      const results = await searchProject(session, sections, query, signal, 100);
      if (signal.aborted) return;

      renderResults(results, query);
    } catch (e) {
      if (signal.aborted) return;
      console.error('Project search failed:', e);
      statusContainer!.textContent = 'Search failed.';
    }
  }

  function renderResults(results: ProjectSearchResult[], query: string) {
    resultsContainer!.innerHTML = '';
    
    if (results.length === 0) {
      statusContainer!.classList.add('hidden');
      emptyState!.classList.remove('hidden');
      return;
    }

    emptyState!.classList.add('hidden');
    statusContainer!.textContent = `${results.length}${results.length >= 100 ? '+' : ''} result${results.length === 1 ? '' : 's'} found`;
    
    // Create elements securely using text nodes
    for (const result of results) {
      const item = document.createElement('div');
      item.className = 'project-search-item';
      
      const pathEl = document.createElement('div');
      pathEl.className = 'project-search-item-path';
      pathEl.textContent = `${result.path} (Line ${result.line})`;
      
      const excerptEl = document.createElement('div');
      excerptEl.className = 'project-search-item-excerpt';
      
      // Highlight the match safely
      const lowerExcerpt = result.excerpt.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const matchIndex = lowerExcerpt.indexOf(lowerQuery);
      
      if (matchIndex !== -1) {
        const beforeMatch = result.excerpt.substring(0, matchIndex);
        const matchText = result.excerpt.substring(matchIndex, matchIndex + query.length);
        const afterMatch = result.excerpt.substring(matchIndex + query.length);
        
        excerptEl.appendChild(document.createTextNode(beforeMatch));
        
        const mark = document.createElement('span');
        mark.className = 'project-search-item-match';
        mark.textContent = matchText;
        excerptEl.appendChild(mark);
        
        excerptEl.appendChild(document.createTextNode(afterMatch));
      } else {
        excerptEl.textContent = result.excerpt;
      }
      
      item.appendChild(pathEl);
      item.appendChild(excerptEl);
      
      item.addEventListener('click', async () => {
        await navigateToResult(result);
      });
      
      resultsContainer!.appendChild(item);
    }
  }

  async function navigateToResult(result: ProjectSearchResult) {
    if (!await editorManager.prepareForNavigation()) return;
    state.setActiveFile(result.path);
    // Request animation frame allows the new file to render before we try to focus
    requestAnimationFrame(() => {
      editorManager.focusLine(result.line);
    });
  }
}
