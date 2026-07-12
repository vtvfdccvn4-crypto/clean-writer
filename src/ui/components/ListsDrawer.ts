import { renderDrawerColorControl, renderDrawerControl, renderDrawerFontStyleStack } from './drawerControls';

export const listsDrawerContentTemplate = (): string => {
  const renderListConfig = (prefix: string, title: string, typeLabel: string, selectHtml: string, markerHtml: string) => `
    <section class="drawer-card">
      <div class="drawer-card-head">
        <span>${title}</span>
      </div>
      ${renderDrawerControl('List style', selectHtml)}
      ${renderDrawerFontStyleStack({
        fontId: `${prefix}-font`,
        sizeId: `${prefix}-size`,
        colorId: `${prefix}-color`,
        boldId: `${prefix}-bold`,
        italicId: `${prefix}-italic`,
        sizeValue: 11,
        colorValue: '#000000'
      })}

      ${renderDrawerControl(
        typeLabel === 'Ordered' ? 'Counter style' : 'Bullet icon',
        `<div class="drawer-list-marker-controls">
          ${markerHtml}
          ${renderDrawerColorControl(`${prefix}-bullet-color`, 'Icon color', '#000000', 'drawer-list-marker-color')}
        </div>`,
      )}

      <div class="drawer-grid drawer-grid-2">
        <label class="drawer-control">
          <span>Margin–marker gap (pt)</span>
          <input id="${prefix}-margin-left" type="number" min="0" max="100" value="20">
        </label>
        <label class="drawer-control">
          <span>Marker–text gap (pt)</span>
          <input id="${prefix}-padding-left" type="number" min="0" max="100" value="8">
        </label>
      </div>
    </section>
  `;

  return `
      <div class="drawer-body">
        ${renderListConfig(
          'ul-selected',
          'Unordered lists',
          'Unordered',
          `<select id="ul-list-style">
            <option value="ulAsterisk">Asterisk marker (*)</option>
            <option value="ulDash">Dash marker (-)</option>
            <option value="ulPlus">Plus marker (+)</option>
          </select>`,
          `<select id="ul-selected-bullet-icon">
            <option value="•">•</option>
            <option value="◦">◦</option>
            <option value="▪">▪</option>
            <option value="▫">▫</option>
            <option value="-">-</option>
            <option value="+">+</option>
            <option value="➤">➤</option>
            <option value="✓">✓</option>
          </select>`
        )}
        ${renderListConfig(
          'ol-selected',
          'Ordered lists',
          'Ordered',
          `<select id="ol-list-style">
            <option value="ol">Period delimiter: 1.</option>
            <option value="olParen">Parenthesis delimiter: 1)</option>
          </select>`,
          `<select id="ol-selected-bullet-icon">
            <option value="decimal">1, 2, 3</option>
            <option value="lower-alpha">a, b, c</option>
            <option value="upper-alpha">A, B, C</option>
            <option value="lower-roman">i, ii, iii</option>
            <option value="upper-roman">I, II, III</option>
          </select>`
        )}

        <button id="btn-apply-lists" class="drawer-primary-button" type="button">Apply settings</button>
      </div>
  `;
};
