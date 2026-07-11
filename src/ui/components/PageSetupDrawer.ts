import {
  renderDrawerControl,
  renderDrawerSwitchControl,
  renderDrawerFontStyleStack,
  renderDrawerAlignmentOptions
} from './drawerControls';

const renderCellConfig = (type: 'header' | 'footer') => {
  const prefix = `${type}-selected`;
  return `
    <label class="drawer-control">
      <span>Content</span>
      <input id="${prefix}-content" type="text" placeholder="Content (use {page} for page, <br> for new line)">
    </label>
    ${renderDrawerFontStyleStack({
      fontId: `${prefix}-font`,
      sizeId: `${prefix}-size`,
      colorId: `${prefix}-color`,
      boldId: `${prefix}-bold`,
      italicId: `${prefix}-italic`,
      sizeValue: 9,
      colorValue: '#666666'
    })}
    <label class="drawer-control">
      <span>Alignment</span>
      <select id="${prefix}-alignment" title="Cell alignment">
        ${renderDrawerAlignmentOptions('middle')}
      </select>
    </label>
  `;
};

const renderRowConfig = (type: 'header' | 'footer') => `
  <details class="drawer-details drawer-card" open>
    <summary class="drawer-summary">
      <span>${type === 'header' ? 'Header' : 'Footer'} settings</span>
    </summary>
    <div class="drawer-details-body">
      <label class="drawer-control">
        <span>Center column width</span>
        <input id="${type}-center-width" type="text" value="100px" placeholder="e.g. 100px or 50%">
      </label>
      ${renderDrawerControl(
        'Cell',
        `<select id="${type}-cell-select" title="${type === 'header' ? 'Header' : 'Footer'} cell">
          <option value="left">Left</option>
          <option value="center">Middle</option>
          <option value="right">Right</option>
        </select>`
      )}
      ${renderCellConfig(type)}
    </div>
  </details>
`;

export const pageSetupDrawerContentTemplate = (): string => `
    <div class="drawer-body">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Paper size</span>
        </div>
        <label class="drawer-control">
          <span>Paper size</span>
          <select id="paper-size">
            <option value="210,297">A4 (210 × 297 mm)</option>
            <option value="148,210">A5 (148 × 210 mm)</option>
            <option value="216,279">US Letter (216 × 279 mm)</option>
            <option value="216,356">US Legal (216 × 356 mm)</option>
            <option value="176,250">B5 (176 × 250 mm)</option>
          </select>
        </label>
      </section>

      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Margins</span>
        </div>
        <div class="drawer-grid drawer-grid-2">
          <label class="drawer-control">
            <span>Top</span>
            <input id="margin-top" type="number" value="25" min="0" max="100" step="1">
          </label>
          <label class="drawer-control">
            <span>Bottom</span>
            <input id="margin-bottom" type="number" value="25" min="0" max="100" step="1">
          </label>
          <label class="drawer-control">
            <span>Left</span>
            <input id="margin-left" type="number" value="20" min="0" max="100" step="1">
          </label>
          <label class="drawer-control">
            <span>Right</span>
            <input id="margin-right" type="number" value="20" min="0" max="100" step="1">
          </label>
        </div>
      </section>

      <section class="drawer-card">
        ${renderDrawerControl('Show guidelines', renderDrawerSwitchControl('show-guidelines', 'Show guidelines', 'drawer-switch--full'))}
      </section>

      ${renderRowConfig('header')}
      ${renderRowConfig('footer')}

      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Section configuration</span>
        </div>
        <label class="drawer-control">
          <span>Section</span>
          <select id="page-section-visibility-select" title="Section to configure"></select>
        </label>
        <div id="page-section-visibility-controls" class="drawer-control-stack"></div>
      </section>

      <button id="btn-apply-page-setup" class="drawer-primary-button" type="button">Apply settings</button>
    </div>
`;
