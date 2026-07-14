import { renderDrawerControl } from './drawerControls';

export const imageSettingsDrawerContentTemplate = (): string => `
  <div class="drawer-body">
    <section class="drawer-card">
      <div class="drawer-card-head"><span>New image defaults</span></div>
      <div class="drawer-grid drawer-grid-2">
        ${renderDrawerControl('Alignment', `
          <select id="image-alignment">
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        `)}
        ${renderDrawerControl('Top margin (mm)', '<input id="image-margin-top" type="number" min="0" max="200" step="0.5">')}
        ${renderDrawerControl('Bottom margin (mm)', '<input id="image-margin-bottom" type="number" min="0" max="200" step="0.5">')}
      </div>
    </section>
    <button id="btn-apply-image-settings" class="drawer-primary-button" type="button">Apply settings</button>
  </div>
`;
