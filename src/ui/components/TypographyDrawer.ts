import { renderDrawerFontStyleStack } from './drawerControls';

export const typographyDrawerContentTemplate = (): string => `
    <div class="drawer-body">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Target element</span>
        </div>
        <label class="drawer-control">
          <span>Element</span>
          <select id="typography-element-select">
            <option value="paragraph">Paragraph (P)</option>
            <option value="h1">Header 1 (H1)</option>
            <option value="h2">Header 2 (H2)</option>
            <option value="h3">Header 3 (H3)</option>
            <option value="h4">Header 4 (H4)</option>
            <option value="h5">Header 5 (H5)</option>
            <option value="h6">Header 6 (H6)</option>
          </select>
        </label>
      </section>

      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Font</span>
        </div>
        ${renderDrawerFontStyleStack({
          fontId: 'typo-font-family',
          sizeId: 'typo-font-size',
          colorId: 'typo-font-color',
          boldId: 'typo-font-bold',
          italicId: 'typo-font-italic',
          sizeValue: 11,
          colorValue: '#000000'
        })}
      </section>

      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Spacing</span>
        </div>
        <div class="drawer-grid drawer-grid-2">
          <label class="drawer-control">
            <span>Line height</span>
            <input type="number" id="typo-line-height" min="0.5" max="3" step="0.1">
          </label>
          <span class="drawer-spacer" aria-hidden="true"></span>
        </div>
        <div class="drawer-control-stack">
          <label class="drawer-control">
            <span>Margin top (pt)</span>
            <input type="number" id="typo-margin-top" min="0" max="100">
          </label>
          <label class="drawer-control">
            <span>Margin bottom (pt)</span>
            <input type="number" id="typo-margin-bottom" min="0" max="100">
          </label>
        </div>
      </section>

      <button id="btn-apply-typography" class="drawer-primary-button" type="button">Apply styles</button>
    </div>
`;
