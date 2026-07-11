export const projectSearchDrawerTemplate = (): string => `
  <div id="project-search-drawer" class="drawer hidden" aria-label="Project Search">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span>Search Project</span>
      </div>
      <button class="drawer-close-button" type="button" aria-label="Close search" title="Close search" aria-controls="project-search-drawer">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
    </div>
    <div class="drawer-body">
      <div class="drawer-card">
        <label for="project-search-input" class="sr-only">Search</label>
        <input type="text" id="project-search-input" class="form-input" placeholder="Search in all sections..." autocomplete="off">
      </div>
      <div id="project-search-status" class="project-search-status hidden"></div>
      <div id="project-search-results" class="project-search-results">
        <!-- Results injected here -->
      </div>
      <div id="project-search-empty" class="project-search-empty hidden">
        <p class="drawer-note">No results found.</p>
      </div>
    </div>
  </div>
`;
