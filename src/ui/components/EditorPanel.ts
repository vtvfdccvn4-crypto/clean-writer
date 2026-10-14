import { toolbarButton } from './toolbarButton';
import { materialIcon } from './icon';

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

function editorPrintPreviewIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 1.75h5.25L12.5 5v8.25a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1Z" />
      <path d="M9 1.9V5h3.1M5.5 8h5M5.5 10.5h5" />
    </svg>
  `;
}

function editorReviewIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.25 2.25h9.5v11.5h-9.5zM5.5 5h5M5.5 8h5M5.5 11h3" />
      <path d="m3.7 5.1.65.65 1.1-1.2" />
    </svg>
  `;
}

export const editorPanelTemplate = (): string => `
  <main class="shared-editor-pane pane" aria-label="Markdown editor">
    <div class="editor-toolbar panel-bar panel-header">
      <div class="toolbar-status">
        <span id="active-section-label" class="active-section-label" hidden></span>
      </div>
      <div class="panel-actions">
        ${toolbarButton({ id: 'btn-open-project-search', variant: 'icon', ariaLabel: 'Search Project', title: 'Search Project', icon: editorProjectSearchIconMarkup(), attributes: { 'aria-controls': 'project-search-drawer', 'aria-expanded': 'false' } })}
        ${toolbarButton({ id: 'btn-toggle-print-preview', variant: 'icon', ariaLabel: 'Show final print preview', title: 'Show final print preview', icon: editorPrintPreviewIconMarkup(), attributes: { 'aria-pressed': 'false' } })}
        ${toolbarButton({ id: 'btn-open-project-review', variant: 'icon', ariaLabel: 'Project Review', title: 'Project Review', icon: editorReviewIconMarkup(), attributes: { 'aria-controls': 'project-review-drawer', 'aria-expanded': 'false' } })}
        ${toolbarButton({ id: 'btn-open-search', variant: 'icon', ariaLabel: 'Find and Replace', title: 'Find and Replace', icon: editorSearchIconMarkup() })}
        ${toolbarButton({ id: 'btn-editor-preferences', variant: 'icon', ariaLabel: 'Editor preferences', title: 'Editor preferences', icon: materialIcon('settings'), attributes: { 'aria-controls': 'editor-preferences-drawer' } })}
      </div>
    </div>
    <div class="editor-stage panel-content">
      <div class="markdown-toolbar" role="toolbar" aria-label="Markdown formatting" aria-orientation="vertical">
        ${toolbarButton({ variant: 'text', title: 'Heading 1', content: 'H1', attributes: { 'data-markdown-command': 'heading-1', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Heading 2', content: 'H2', attributes: { 'data-markdown-command': 'heading-2', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Heading 3', content: 'H3', attributes: { 'data-markdown-command': 'heading-3', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Bold', content: 'B', attributes: { 'data-markdown-command': 'bold', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Italic', content: '<em>I</em>', attributes: { 'data-markdown-command': 'italic', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Link', content: 'Link', attributes: { 'data-markdown-command': 'link', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Bulleted list', content: 'List', attributes: { 'data-markdown-command': 'unordered-list', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Numbered list', content: '1.', attributes: { 'data-markdown-command': 'ordered-list', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Quote', content: 'Quote', attributes: { 'data-markdown-command': 'quote', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Inline code', content: 'Code', attributes: { 'data-markdown-command': 'inline-code', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Code block', content: 'Block', attributes: { 'data-markdown-command': 'code-block', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Insert page break', content: 'PB', attributes: { 'data-markdown-command': 'page-break', disabled: 'disabled' } })}
        ${toolbarButton({ variant: 'text', title: 'Insert table', content: 'Table', attributes: { 'data-markdown-command': 'table', disabled: 'disabled' } })}
        ${toolbarButton({ id: 'open-symbol-picker', variant: 'text', classes: ['markdown-symbol-button'], ariaLabel: 'Symbols', title: 'Symbols', icon: editorSymbolsIconMarkup(), attributes: { 'aria-controls': 'symbol-picker', 'aria-expanded': 'false' } })}
      </div>
      <div id="editor-container" class="editor-container">
        <!-- CodeMirror injects here -->
      </div>
    </div>
    <div class="editor-footer panel-bar panel-footer" aria-hidden="true"></div>
  </main>
`;
