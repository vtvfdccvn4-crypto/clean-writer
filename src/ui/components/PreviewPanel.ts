function previewEyeIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.9 8s2.1-4.1 6.1-4.1S14.1 8 14.1 8s-2.1 4.1-6.1 4.1S1.9 8 1.9 8Z" />
      <circle cx="8" cy="8" r="1.55" />
    </svg>
  `;
}

export const previewPanelTemplate = (): string => `
  <aside id="preview-panel" class="shared-preview-pane pane is-project-closed" aria-label="Preview" aria-hidden="true">
    <div class="preview-toolbar panel-bar panel-header">
      <div class="toolbar-status">
        <span class="status-dot"></span>
        <button id="btn-full-doc" class="toolbar-icon-button toolbar-text-button is-active" type="button" aria-pressed="true" title="Merged preview" aria-label="Merged preview">
          ${previewEyeIconMarkup()}
          <span class="toolbar-button-label">Preview</span>
        </button>
      </div>
    </div>

    <div class="preview-scroll-container panel-content">
      <div id="paged-stage" class="paged-stage">
        <!-- Paged.js injects pages here -->
      </div>
    </div>

    <details id="preview-diagnostics-panel" class="preview-diagnostics-panel" hidden>
      <summary>Preview diagnostics</summary>
      <pre id="preview-diagnostics-output" aria-live="polite">No preview timing recorded.</pre>
    </details>

    <div class="preview-footer-toolbar panel-bar panel-footer">
      <output id="preview-page-indicator" class="preview-page-indicator" aria-live="polite" aria-label="Preview page" hidden>Page 1 of 1 Pages</output>
      <div class="panel-actions preview-export-actions">
        <button id="btn-pdf-preview" class="toolbar-icon-button toolbar-text-button" type="button" aria-label="PDF preview" title="PDF preview">
          <span class="toolbar-button-label">PDF Preview</span>
        </button>
      </div>
    </div>
  </aside>
`;
