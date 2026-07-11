import { renderFontFamilyOptions } from '../../config/font-families';
import { renderDrawerColorControl, renderDrawerControl, renderDrawerSizeSelect, renderDrawerSwitchControl } from './drawerControls';

const renderTableStyle = (prefix: string, title: string, secondary = false) => `
  <details class="drawer-details drawer-card" open>
    <summary class="drawer-summary">
      <span>${title}</span>
    </summary>
    <div class="drawer-details-body">
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Font family', `<select id="${prefix}-font">${renderFontFamilyOptions()}</select>`)}
        ${renderDrawerControl('Font size (pt)', renderDrawerSizeSelect(`${prefix}-font-size`, 10))}
      </div>
      ${renderDrawerControl('Bold header', renderDrawerSwitchControl(`${prefix}-header-bold`, 'Bold header'))}
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Header text', renderDrawerColorControl(`${prefix}-header-text`, 'Header text', secondary ? '#1f2937' : '#ffffff'))}
        ${renderDrawerControl('Header background', renderDrawerColorControl(`${prefix}-header-background`, 'Header background', secondary ? '#e8eef7' : '#405a78'))}
        ${renderDrawerControl('Body text', renderDrawerColorControl(`${prefix}-body-text`, 'Body text', '#1f2937'))}
        ${renderDrawerControl('Body background', renderDrawerColorControl(`${prefix}-body-background`, 'Body background', '#ffffff'))}
        ${renderDrawerControl('Alternate row', renderDrawerColorControl(`${prefix}-alternate-row`, 'Alternate row', secondary ? '#ffffff' : '#edf2f8'))}
        ${renderDrawerControl('Border', renderDrawerColorControl(`${prefix}-border-color`, 'Border', secondary ? '#95a8bd' : '#b8c7d9'))}
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
      ${renderTableStyle('table-1', 'Table style 1')}
      ${renderTableStyle('table-2', 'Table style 2', true)}
      <button id="btn-apply-tables" class="drawer-primary-button" type="button">Apply settings</button>
    </div>
`;
