import { renderDrawerControl, renderDrawerFontStyleStack, renderDrawerSwitchControl } from './drawerControls';

export const specialHeadingsDrawerContentTemplate = (): string => `
  <div class="drawer-body">
    <section class="drawer-card">
      <div class="drawer-card-head"><span>Exercise heading</span></div>
      ${renderDrawerControl('Markdown directive', '<input id="special-heading-directive" type="text" value=":::exercise">')}
      ${renderDrawerControl('Heading level', '<select id="special-heading-level"><option value="1">H1</option><option value="2">H2</option><option value="3" selected>H3</option><option value="4">H4</option><option value="5">H5</option><option value="6">H6</option></select>')}
      ${renderDrawerControl('Counter starts at', '<input id="special-heading-start" type="number" min="1" value="1">')}
      ${renderDrawerControl('Counter prefix', '<input id="special-heading-counter-prefix" type="text" placeholder="e.g. Exercise ">')}
      ${renderDrawerControl('Counter suffix', '<input id="special-heading-counter-suffix" type="text" placeholder="e.g. )">')}
      ${renderDrawerControl('Page break before', renderDrawerSwitchControl('special-heading-break', 'Page break before'))}
      ${renderDrawerControl('Include in TOC', renderDrawerSwitchControl('special-heading-toc', 'Include in TOC'))}
    </section>
    <section class="drawer-card">
      <div class="drawer-card-head"><span>Appearance</span></div>
      ${renderDrawerFontStyleStack({
        fontId: 'special-heading-font', sizeId: 'special-heading-size', colorId: 'special-heading-color',
        boldId: 'special-heading-bold', italicId: 'special-heading-italic', sizeValue: 11, colorValue: '#000000'
      })}
      ${renderDrawerControl('All caps', renderDrawerSwitchControl('special-heading-all-caps', 'All caps'))}
      ${renderDrawerControl('Line height', '<input id="special-heading-line-height" type="number" min="0.5" max="3" step="0.1" value="1.2">')}
      ${renderDrawerControl('Spacing before (pt)', '<input id="special-heading-margin-top" type="number" min="0" value="12">')}
      ${renderDrawerControl('Spacing after (pt)', '<input id="special-heading-margin-bottom" type="number" min="0" value="6">')}
    </section>
    <button id="btn-apply-special-heading" class="drawer-primary-button" type="button">Apply settings</button>
  </div>`;
