function previewEyeIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.9 8s2.1-4.1 6.1-4.1S14.1 8 14.1 8s-2.1 4.1-6.1 4.1S1.9 8 1.9 8Z" />
      <circle cx="8" cy="8" r="1.55" />
    </svg>
  `;
}

function previewExportIconMarkup(): string {
  return `
    <svg class="toolbar-icon toolbar-icon--pdf" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 3h5.1L12 5.9v6.35A.75.75 0 0 1 11.25 13h-7.5A.75.75 0 0 1 3 12.25V4a1 1 0 0 1 1-1Z" />
      <path d="M8 6.75v4.1" />
      <path d="M6.4 8.4 8 10l1.6-1.6" />
    </svg>
  `;
}

function previewWordIconMarkup(): string {
  return `
    <svg class="toolbar-icon toolbar-icon--docx" viewBox="0 0 16 16" aria-hidden="true" focusable="false" style="color: #2b579a;">
      <path d="M4 3h5.1L12 5.9v6.35A.75.75 0 0 1 11.25 13h-7.5A.75.75 0 0 1 3 12.25V4a1 1 0 0 1 1-1Z" />
      <text x="7.5" y="10.2" font-family="system-ui, sans-serif" font-size="5" font-weight="bold" fill="currentColor" text-anchor="middle">W</text>
    </svg>
  `;
}

export const previewPanelTemplate = (): string => `
  <aside class="preview-pane pane is-project-closed" aria-label="Preview" aria-hidden="true">
    <div class="preview-toolbar panel-bar">
      <div class="toolbar-status">
        <span class="status-dot"></span>
        <span>Live Preview</span>
        <span id="preview-diagnostics" class="preview-diagnostics" aria-live="polite">idle</span>
      </div>
      <div class="panel-actions">
        <button id="btn-full-doc" class="toolbar-icon-button is-active" type="button" aria-pressed="true" title="Merged preview" aria-label="Merged preview">
          ${previewEyeIconMarkup()}
        </button>
        <button id="btn-export-pdf" class="toolbar-icon-button" type="button" aria-label="Export PDF" title="Export to PDF">
          ${previewExportIconMarkup()}
        </button>
        <button id="btn-export-docx" class="toolbar-icon-button" type="button" aria-label="Export Word" title="Export to Word (Docx)">
          ${previewWordIconMarkup()}
        </button>
      </div>
    </div>

    <div class="preview-scroll-container">
      <div id="paged-stage" class="paged-stage">
        <!-- Paged.js injects pages here -->
      </div>
    </div>
  </aside>
`;
