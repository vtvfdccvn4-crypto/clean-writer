function editorSymbolsIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="5" cy="5" r="0.85" />
      <circle cx="11" cy="5" r="0.85" />
      <circle cx="5" cy="11" r="0.85" />
      <circle cx="11" cy="11" r="0.85" />
    </svg>
  `;
}

function editorSearchIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M11.742 10.328a6.5 6.5 0 1 0-1.414 1.414l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
    </svg>
  `;
}

function editorProjectSearchIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M11.742 10.328a6.5 6.5 0 1 0-1.414 1.414l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
      <path d="M4.5 4h4v1h-4zm0 3h4v1h-4zm0 3h2v1h-2z" />
    </svg>
  `;
}

export const editorPanelTemplate = (): string => `
  <main class="editor-pane pane" aria-label="Markdown editor">
    <div class="editor-toolbar panel-bar panel-header">
      <div class="toolbar-status">
        <span id="active-section-label" class="active-section-label" hidden></span>
      </div>
      <div class="panel-actions">
        <button id="btn-open-project-search" class="toolbar-icon-button" type="button" aria-label="Search Project" title="Search Project" aria-controls="project-search-drawer" aria-expanded="false">
          ${editorProjectSearchIconMarkup()}
        </button>
        <button id="btn-open-project-review" class="toolbar-icon-button" type="button" aria-label="Project Review" title="Project Review" aria-controls="project-review-drawer" aria-expanded="false">Review</button>
        <button id="btn-open-search" class="toolbar-icon-button" type="button" aria-label="Find and Replace" title="Find and Replace">
          ${editorSearchIconMarkup()}
        </button>
      </div>
    </div>
    <div class="editor-stage panel-content">
      <div class="markdown-toolbar" role="toolbar" aria-label="Markdown formatting" aria-orientation="vertical">
        <button class="toolbar-text-button" type="button" data-markdown-command="heading-1" title="Heading 1">H1</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="heading-2" title="Heading 2">H2</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="heading-3" title="Heading 3">H3</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="bold" title="Bold">B</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="italic" title="Italic"><em>I</em></button>
        <button class="toolbar-text-button" type="button" data-markdown-command="link" title="Link">Link</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="unordered-list" title="Bulleted list">List</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="ordered-list" title="Numbered list">1.</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="quote" title="Quote">Quote</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="inline-code" title="Inline code">Code</button>
        <button class="toolbar-text-button" type="button" data-markdown-command="code-block" title="Code block">Block</button>
        <button id="open-symbol-picker" class="markdown-symbol-button" type="button" aria-label="Symbols" title="Symbols" aria-controls="symbol-picker" aria-expanded="false">
          ${editorSymbolsIconMarkup()}
        </button>
      </div>
      <div id="editor-container" class="editor-container">
        <!-- CodeMirror injects here -->
      </div>
    </div>
    <div class="editor-footer panel-bar panel-footer" aria-hidden="true"></div>
  </main>
`;
