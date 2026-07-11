import { renderFontFamilyOptions } from '../../config/font-families';
import { renderDrawerControl, renderDrawerSizeSelect, renderDrawerSwitchControl } from './drawerControls';

const renderTableStyle = (prefix: string, title: string, secondary = false) => `
  <details class="drawer-details drawer-card" open>
    <summary class="drawer-summary">
      <span>${title}</span>
      <span class="drawer-summary-hint">${secondary ? 'Marked' : 'Default'}</span>
    </summary>
    <div class="drawer-details-body">
      ${secondary ? '<p class="drawer-note">Place <code>&lt;!-- table-style: 2 --&gt;</code> immediately before the table.</p>' : '<p class="drawer-note">Applied to every regular Markdown table.</p>'}
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Font family', `<select id="${prefix}-font">${renderFontFamilyOptions()}</select>`)}
        ${renderDrawerControl('Font size (pt)', renderDrawerSizeSelect(`${prefix}-font-size`, 10))}
      </div>
      ${renderDrawerControl('Bold header', renderDrawerSwitchControl(`${prefix}-header-bold`, 'Bold header'))}
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Header text', `<input id="${prefix}-header-text" type="color" value="${secondary ? '#1f2937' : '#ffffff'}">`)}
        ${renderDrawerControl('Header background', `<input id="${prefix}-header-background" type="color" value="${secondary ? '#e8ece8' : '#5d7561'}">`)}
        ${renderDrawerControl('Body text', `<input id="${prefix}-body-text" type="color" value="#1f2937">`)}
        ${renderDrawerControl('Body background', `<input id="${prefix}-body-background" type="color" value="#ffffff">`)}
        ${renderDrawerControl('Alternate row', `<input id="${prefix}-alternate-row" type="color" value="${secondary ? '#ffffff' : '#f4f6f4'}">`)}
        ${renderDrawerControl('Border', `<input id="${prefix}-border-color" type="color" value="${secondary ? '#829087' : '#cbd5cf'}">`)}
      </div>
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Border width (pt)', `<input id="${prefix}-border-width" type="number" min="0" max="10" step="0.25" value="${secondary ? 1 : 0.75}">`)}
        ${renderDrawerControl('Cell padding (pt)', `<input id="${prefix}-cell-padding" type="number" min="0" max="50" value="${secondary ? 8 : 6}">`)}
        ${renderDrawerControl('Top margin (pt)', `<input id="${prefix}-margin-top" type="number" min="0" max="200" value="8">`)}
        ${renderDrawerControl('Bottom margin (pt)', `<input id="${prefix}-margin-bottom" type="number" min="0" max="200" value="12">`)}
      </div>
    </div>
  </details>
`;

export const tablesDrawerContentTemplate = (): string => `
    <div class="drawer-body">
      <p class="drawer-intro">Configure two independent table treatments for preview and PDF.</p>
      ${renderTableStyle('table-1', 'Table style 1')}
      ${renderTableStyle('table-2', 'Table style 2', true)}
      <button id="btn-apply-tables" class="drawer-primary-button" type="button">Apply settings</button>
    </div>
`;
