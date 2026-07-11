import { renderDrawerControl, renderDrawerFontStyleStack, renderDrawerSwitchControl } from './drawerControls';

const renderHeadingLevelOptions = () => [1, 2, 3, 4, 5, 6]
  .map(level => `<option value="${level}"${level === 1 ? ' selected' : ''}>H${level}</option>`)
  .join('');

export const tocSetupDrawerContentTemplate = (): string => `
    <div class="drawer-body">
      <p class="drawer-intro">Choose which heading levels appear and style each level from a single selector.</p>
      <section class="drawer-card toc-section-selector">
        <div class="drawer-card-head">
          <h5>Sections</h5>
          <span>TOC and numbering</span>
        </div>
        ${renderDrawerControl(
          'Section',
          '<select id="toc-section-select"></select>'
        )}
        <p class="drawer-note">Choose a folder or file, then set whether it appears in the table of contents and uses heading numbers.</p>
      </section>
      <div id="toc-section-list" class="drawer-grid">
        <!-- Rendered dynamically -->
      </div>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Heading depth</h5>
          <span>Included entries</span>
        </div>
        ${renderDrawerControl(
          'Show entries through',
          `<select id="toc-max-level">
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
            <option value="4">H4</option>
            <option value="5">H5</option>
            <option value="6" selected>H6</option>
          </select>`
        )}
      </section>
      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Heading style</h5>
          <span>One level at a time</span>
        </div>
        ${renderDrawerControl(
          'Heading level',
          `<select id="toc-heading-level">
            ${renderHeadingLevelOptions()}
          </select>`
        )}
        ${renderDrawerFontStyleStack({
          fontId: 'toc-selected-font',
          sizeId: 'toc-selected-size',
          colorId: 'toc-selected-color',
          boldId: 'toc-selected-bold',
          italicId: 'toc-selected-italic',
          sizeValue: 11,
          colorValue: '#000000'
        })}
        ${renderDrawerControl('All caps', renderDrawerSwitchControl('toc-selected-all-caps', 'All caps'))}
      </section>
      <button id="btn-apply-toc-setup" class="drawer-primary-button" type="button">Apply settings</button>
    </div>
`;
