export const documentOutlineDrawerTemplate = (): string => `
  <div id="document-outline-drawer" class="drawer hidden" aria-label="Document Outline">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span>Document Outline</span>
      </div>
      <button class="drawer-close-button" type="button" aria-label="Close outline" title="Close outline" aria-controls="document-outline-drawer">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
    </div>
    <div class="drawer-body">
      <div id="project-statistics-summary" class="project-statistics-summary hidden"></div>
      <div id="document-outline-content" class="document-outline-content">
        <!-- Outline items injected here -->
      </div>
      <div id="document-outline-empty" class="document-outline-empty hidden">
        <p class="drawer-note">No headings found.</p>
        <p class="drawer-note">Add # headings to your document to see its structure here.</p>
      </div>
    </div>
  </div>
`;
