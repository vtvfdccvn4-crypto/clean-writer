import { toolbarButton } from './toolbarButton';
import { materialIcon } from './icon';

export const editorPanelTemplate = (): string => `
  <main class="shared-editor-pane pane" aria-label="Markdown editor">
    <div class="editor-toolbar panel-bar panel-header">
      <div class="toolbar-status">
        <span id="active-section-label" class="active-section-label" hidden></span>
      </div>
      <div class="panel-actions">
        ${toolbarButton({ id: 'btn-open-project-search', variant: 'icon', ariaLabel: 'Search Project', title: 'Search Project', icon: materialIcon('file_search'), attributes: { 'aria-controls': 'project-search-drawer', 'aria-expanded': 'false' } })}
        ${toolbarButton({ id: 'btn-toggle-print-preview', variant: 'icon', ariaLabel: 'Show final print preview', title: 'Show final print preview', icon: materialIcon('file_text'), attributes: { 'aria-pressed': 'false' } })}
        ${toolbarButton({ id: 'btn-open-project-review', variant: 'icon', ariaLabel: 'Project Review', title: 'Project Review', icon: materialIcon('clipboard_check'), attributes: { 'aria-controls': 'project-review-drawer', 'aria-expanded': 'false' } })}
        ${toolbarButton({ id: 'btn-open-search', variant: 'icon', ariaLabel: 'Find and Replace', title: 'Find and Replace', icon: materialIcon('search') })}
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
        ${toolbarButton({ id: 'open-symbol-picker', variant: 'text', classes: ['markdown-symbol-button'], ariaLabel: 'Symbols', title: 'Symbols', icon: materialIcon('omega'), attributes: { 'aria-controls': 'symbol-picker', 'aria-expanded': 'false' } })}
      </div>
      <div id="editor-container" class="editor-container">
        <!-- CodeMirror injects here -->
      </div>
    </div>
  </main>
`;
