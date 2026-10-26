import { materialIcon } from './icon';
import { toolbarButton } from './toolbarButton';
import { pdfJobStatusTemplate } from '../pdf-job-status';

function previewEyeIconMarkup(): string {
  return materialIcon('document_scanner');
}

export const previewPanelTemplate = (): string => `
  <aside id="preview-panel" class="shared-preview-pane pane is-project-closed" aria-label="Preview" aria-hidden="true">
    <div class="preview-toolbar panel-bar panel-header">
      <div class="toolbar-status">
        <span class="status-dot"></span>
        ${toolbarButton({ id: 'btn-full-doc', variant: 'icon-text', classes: ['is-active'], ariaLabel: 'Merged preview', title: 'Merged preview', icon: previewEyeIconMarkup(), content: '<span class="toolbar-button-label">Preview</span>', attributes: { 'aria-pressed': 'true' } })}
      </div>
      <div class="panel-actions">
        ${toolbarButton({ id: 'btn-preview-page-setup', variant: 'icon', ariaLabel: 'Page setup', title: 'Page setup', icon: materialIcon('tune'), attributes: { 'aria-controls': 'page-setup-drawer' } })}
        ${toolbarButton({ id: 'btn-preview-styles', variant: 'icon', ariaLabel: 'Styles', title: 'Styles', icon: materialIcon('palette'), attributes: { 'aria-controls': 'styles-drawer' } })}
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

    <div id="preview-freshness" class="preview-freshness" hidden>
      <span id="preview-freshness-text" class="preview-freshness-text" role="status" aria-live="polite"></span>
      <button id="preview-freshness-action" class="preview-freshness-action" type="button"></button>
    </div>
    ${pdfJobStatusTemplate()}
    <div class="preview-footer-toolbar panel-bar panel-footer">
      <output id="preview-page-indicator" class="preview-page-indicator" aria-live="polite" aria-label="Preview page" hidden>Page 1 of 1 Pages</output>
      <div class="panel-actions preview-export-actions">
        ${toolbarButton({ id: 'btn-pdf-preview', variant: 'icon-text', ariaLabel: 'PDF preview', title: 'PDF preview', icon: materialIcon('picture_as_pdf') })}
      </div>
    </div>
  </aside>
`;
