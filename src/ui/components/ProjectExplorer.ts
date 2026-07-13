function folderIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.25 5.25h11.5v6.95a.7.7 0 0 1-.7.7H2.95a.7.7 0 0 1-.7-.7V5.25Z" />
      <path d="M2.25 4.5a.7.7 0 0 1 .7-.7h3.2c.27 0 .53.11.71.29l.79.79H13a.7.7 0 0 1 .7.7v.32H2.25Z" />
    </svg>
  `;
}

function plusIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </svg>
  `;
}

function fileSheetIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.25 2.75h4.6l2.9 2.9v7.6a.7.7 0 0 1-.7.7h-6.8a.7.7 0 0 1-.7-.7v-9.8a.7.7 0 0 1 .7-.7Z" />
      <path d="M8.85 2.75v3.05h3.05" />
    </svg>
  `;
}

function openIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 12.75h8.9a.85.85 0 0 0 .85-.85V5.8a.85.85 0 0 0-.85-.85H7.2l-1.1-1.3H3.85a.85.85 0 0 0-.85.85v8.25Z" />
      <path d="M8.35 7.65 12.1 4" />
      <path d="M9.7 4h2.4v2.4" />
    </svg>
  `;
}

function metadataIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 7.1v3.3" />
      <path d="M8 5.2h.01" />
    </svg>
  `;
}

function closeIconMarkup(): string {
  return `
    <svg class="explorer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </svg>
  `;
}

export const projectExplorerTemplate = (): string => `
  <aside id="sidebar" class="project-explorer pane" aria-label="Project files">
    <header class="project-explorer-bar">
      <div class="project-explorer-heading">
        <span class="project-explorer-eyebrow">Project</span>
        <span class="project-explorer-title">Explorer</span>
      </div>
      <div class="project-explorer-actions">
        <button id="btn-new" class="project-explorer-action-button" type="button" title="New project" aria-label="New project">
          ${plusIconMarkup()}
        </button>
        <button id="btn-open" class="project-explorer-action-button" type="button" title="Open project" aria-label="Open project">
          ${openIconMarkup()}
        </button>
        <button id="btn-close-project" class="project-explorer-action-button" type="button" title="Close project" aria-label="Close project">
          ${closeIconMarkup()}
        </button>
        <button id="btn-project-metadata" class="project-explorer-action-button" type="button" title="Project metadata" aria-label="Project metadata" aria-controls="project-metadata-drawer" aria-expanded="false">
          ${metadataIconMarkup()}
        </button>
      </div>
    </header>
    <div id="sidebar-content" class="sidebar-content">
      <details class="sidebar-section project-tree-section sections-section">
        <summary class="section-title">
          <span>Sections</span>
          <span class="section-title-actions">
            <button id="btn-new-folder" class="section-title-action" type="button" title="New Folder" aria-label="New Folder">
              ${folderIconMarkup()}
            </button>
            <button id="btn-new-section" class="section-title-action" type="button" title="New File" aria-label="New File">
              ${fileSheetIconMarkup()}
            </button>
          </span>
        </summary>
        <ul id="section-list" class="file-list">
          <!-- Files injected via JS -->
        </ul>
      </details>
      <section class="sidebar-section project-tree-section outline-section" aria-labelledby="outline-panel-title" hidden>
        <div class="section-title" id="outline-panel-title">Document Outline</div>
        <div id="project-statistics-summary" class="project-statistics-summary hidden"></div>
        <div id="document-outline-content" class="document-outline-content"></div>
        <div id="document-outline-empty" class="document-outline-empty hidden"><p class="drawer-note">No headings found.</p><p class="drawer-note">Add # headings to a document to see its structure here.</p></div>
      </section>

      <details class="sidebar-section project-tree-section images-section">
        <summary class="section-title">
          <span>Images</span>
          <span class="section-actions">
            <button id="btn-add-image" class="icon-button" type="button" title="Add image" aria-label="Add image">
              ${plusIconMarkup()}
            </button>
          </span>
        </summary>
        <div class="image-browser">
          <div class="image-list-viewport">
            <ul id="image-list" class="file-list image-list" role="listbox" aria-label="Project images">
              <!-- Images injected via JS -->
            </ul>
          </div>
          <figure id="image-preview-card" class="image-preview-card" aria-label="Selected image preview">
            <div class="image-preview-stage">
              <img id="image-preview" class="image-preview" alt="">
              <span id="image-preview-empty" class="image-preview-empty">Select an image</span>
            </div>
            <figcaption class="image-preview-footer">
              <span id="image-preview-caption" class="image-preview-caption"></span>
              <button id="btn-insert-image" class="action-button small" type="button" title="Insert at cursor" hidden>Insert</button>
            </figcaption>
          </figure>
        </div>
      </details>
    </div>
  </aside>
`;
