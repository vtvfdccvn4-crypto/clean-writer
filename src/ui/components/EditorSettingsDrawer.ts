import { renderDrawerControl, renderDrawerSizeSelect, renderDrawerSwitchControl } from './drawerControls';

export const editorSettingsDrawerContentTemplate = (): string => `
    <div class="drawer-body">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Typography</span>
        </div>
        ${renderDrawerControl('Font size', renderDrawerSizeSelect('drawer-editor-font-size', '11pt'))}
      </section>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Markdown appearance</span>
        </div>
        ${renderDrawerControl('Bold headings', renderDrawerSwitchControl('editor-heading-bold', 'Bold headings'))}
        ${renderDrawerControl('Bold **text**', renderDrawerSwitchControl('editor-strong-bold', 'Bold **text**'))}
        ${renderDrawerControl('Italic *text*', renderDrawerSwitchControl('editor-emphasis-italic', 'Italic *text*'))}
        ${renderDrawerControl('Underline links', renderDrawerSwitchControl('editor-link-underline', 'Underline links'))}
      </section>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Layout and gutters</span>
        </div>
        ${renderDrawerControl('Line wrapping', renderDrawerSwitchControl('editor-line-wrapping', 'Line wrapping'))}
        ${renderDrawerControl('Line numbers', renderDrawerSwitchControl('editor-line-numbers', 'Line numbers'))}
        ${renderDrawerControl('Folding controls', renderDrawerSwitchControl('editor-fold-gutter', 'Folding controls'))}
        ${renderDrawerControl(
          'Folding glyph',
          `<select id="editor-fold-gutter-glyph" class="drawer-size-select editor-fold-glyph-select" aria-label="Folding glyph">
            <option value="chevrons">⌄ ›</option>
            <option value="triangles">▾ ▸</option>
            <option value="arrows">↓ →</option>
            <option value="plus-minus">− +</option>
          </select>`
        )}
        ${renderDrawerControl('Highlight active line', renderDrawerSwitchControl('editor-active-line', 'Highlight active line'))}
      </section>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Editing assists</span>
        </div>
        ${renderDrawerControl('Special characters', renderDrawerSwitchControl('editor-special-characters', 'Show special characters'))}
        ${renderDrawerControl('Bracket matching', renderDrawerSwitchControl('editor-bracket-matching', 'Bracket matching'))}
        ${renderDrawerControl('Auto-close brackets', renderDrawerSwitchControl('editor-close-brackets', 'Auto-close brackets'))}
        ${renderDrawerControl('Autocompletion', renderDrawerSwitchControl('editor-autocompletion', 'Autocompletion'))}
        ${renderDrawerControl('Smart indentation', renderDrawerSwitchControl('editor-indent-on-input', 'Smart indentation'))}
      </section>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <span>Selection</span>
        </div>
        ${renderDrawerControl('Multiple selections', renderDrawerSwitchControl('editor-multiple-selections', 'Multiple selections'))}
        ${renderDrawerControl('Rectangular selection', renderDrawerSwitchControl('editor-rectangular-selection', 'Rectangular selection'))}
        ${renderDrawerControl('Highlight matching text', renderDrawerSwitchControl('editor-selection-matches', 'Highlight matching text'))}
      </section>
    </div>
`;
