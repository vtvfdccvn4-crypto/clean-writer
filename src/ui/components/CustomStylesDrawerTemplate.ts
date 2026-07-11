import { renderDrawerControl, renderDrawerFontStyleStack } from './drawerControls';

export const customInlineStylesContentTemplate = (): string => `
    <div class="drawer-body" id="tab-inline">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Inline pairs</h5>
          <button id="cs-add-btn" class="icon-btn" type="button" aria-label="Add inline style" aria-controls="cs-editor-card" aria-expanded="false" title="Add inline style">+</button>
        </div>
        <div id="custom-styles-list" class="custom-styles-list"></div>
      </section>

      <section class="drawer-card hidden" id="cs-editor-card">
        <div class="drawer-card-head">
          <h5>Inline style</h5>
          <span>New pair</span>
        </div>
        <form id="custom-style-form" class="custom-style-form">
          <input type="hidden" id="cs-id" value="">
          ${renderDrawerControl('Style name', '<input type="text" id="cs-name" placeholder="e.g. Warning Text" required>')}
          <div class="drawer-grid drawer-grid-2">
            ${renderDrawerControl('Opening pair', '<input type="text" id="cs-opening" placeholder="e.g. [[">')}
            ${renderDrawerControl('Closing pair', '<input type="text" id="cs-closing" placeholder="e.g. ]]">')}
          </div>
          ${renderDrawerFontStyleStack({
            fontId: 'cs-font',
            sizeId: 'cs-size',
            colorId: 'cs-color',
            boldId: 'cs-bold',
            italicId: 'cs-italic',
            sizeValue: '',
            sizeIncludeDefault: true,
            fontIncludeDefault: true,
            colorValue: '#000000'
          })}
          <div class="drawer-grid drawer-grid-2">
            <button type="submit" class="drawer-primary-button" id="cs-submit-btn">Apply</button>
            <button type="button" class="drawer-secondary-button" id="cs-cancel-btn">Cancel</button>
          </div>
        </form>
      </section>
    </div>
`;

export const customQuoteStylesContentTemplate = (): string => `
    <div class="drawer-body" id="tab-block">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Quote styles</h5>
          <button id="cbs-add-btn" class="icon-btn" type="button" aria-label="Add quote style" aria-controls="cbs-editor-card" aria-expanded="false" title="Add quote style">+</button>
        </div>
        <div id="custom-block-styles-list" class="custom-styles-list"></div>
      </section>

      <section class="drawer-card hidden" id="cbs-editor-card">
        <div class="drawer-card-head">
          <h5>Quote style</h5>
          <span>New prefix</span>
        </div>
        <form id="custom-block-style-form" class="custom-style-form">
          <input type="hidden" id="cbs-id" value="">
          ${renderDrawerControl('Style name', '<input type="text" id="cbs-name" placeholder="e.g. Pull Quote">')}
          <div class="drawer-grid drawer-grid-2">
            ${renderDrawerControl('Prefix', '<input type="text" id="cbs-prefix" placeholder="e.g. :::quote">')}
            ${renderDrawerControl(
              'Icon',
              `<span class="block-glyph-picker-control">
                <select id="cbs-icon" class="hidden" aria-hidden="true" tabindex="-1">
                  <option value="">No icon</option>
                </select>
                <div style="display: flex; gap: 4px;">
                  <button id="cbs-icon-trigger" class="block-glyph-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Choose block glyph" style="flex: 1;">
                    <span id="cbs-icon-empty" class="block-glyph-empty">Choose glyph</span>
                    <img id="cbs-icon-preview" class="block-glyph-preview hidden" alt="" aria-hidden="true">
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3Z"></path></svg>
                  </button>
                  <button id="btn-upload-glyph" class="icon-btn" type="button" title="Upload new glyph" aria-label="Upload new glyph" style="flex: 0 0 auto; height: auto;">+</button>
                </div>
                <span id="cbs-icon-menu" class="block-glyph-menu hidden" role="listbox" aria-label="Available block glyphs"></span>
              </span>`
            )}
          </div>
          ${renderDrawerFontStyleStack({
            fontId: 'cbs-font',
            sizeId: 'cbs-size',
            colorId: 'cbs-color',
            boldId: 'cbs-bold',
            italicId: 'cbs-italic',
            sizeValue: '',
            sizeIncludeDefault: true,
            fontIncludeDefault: true,
            colorValue: '#000000'
          })}
          <section class="block-style-spacing">
            <div class="drawer-card-head">
              <h5>Spacing</h5>
              <span>Line height and margins</span>
            </div>
            <div class="drawer-grid drawer-grid-2">
              ${renderDrawerControl('Line height', '<input type="number" id="cbs-line-height" min="0.5" max="3" step="0.05">')}
              <span class="drawer-spacer" aria-hidden="true"></span>
            </div>
            <div class="drawer-grid drawer-grid-2">
              ${renderDrawerControl('Margin top (pt)', '<input type="number" id="cbs-margin-top" min="0" max="100" step="1">')}
              ${renderDrawerControl('Margin bottom (pt)', '<input type="number" id="cbs-margin-bottom" min="0" max="100" step="1">')}
            </div>
          </section>
          <div class="drawer-grid drawer-grid-2">
            <button type="submit" class="drawer-primary-button" id="cbs-submit-btn">Apply</button>
            <button type="button" class="drawer-secondary-button" id="cbs-cancel-btn">Cancel</button>
          </div>
        </form>
      </section>
    </div>
`;
