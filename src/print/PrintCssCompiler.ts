import type { ImageSetup, ListStyle, TableStyle, TocSetup, TypographyStyle } from '../types';
import type { PrintLayoutSettings } from './PrintLayoutSettings';

/** Compiles the isolated stylesheet for the immutable print-layout snapshot. */
export function compilePrintCss(layout: PrintLayoutSettings): string {
  return `
    @page {
      size: ${layout.paper.widthMm}mm ${layout.paper.heightMm}mm;
      margin: ${layout.paper.marginsMm.top}mm ${layout.paper.marginsMm.right}mm ${layout.paper.marginsMm.bottom}mm ${layout.paper.marginsMm.left}mm;
      @top-left { content: ""; }
      @top-center { content: ""; }
      @top-right { content: ""; }
      @bottom-left { content: ""; }
      @bottom-center { content: ""; }
      @bottom-right { content: ""; }
    }
    .pagedjs_margin-top {
      grid-template-columns: minmax(0, 1fr) ${cssDimension(layout.header.centerWidth)} minmax(0, 1fr) !important;
    }
    .pagedjs_margin-bottom {
      grid-template-columns: minmax(0, 1fr) ${cssDimension(layout.footer.centerWidth)} minmax(0, 1fr) !important;
    }
    .pagedjs_margin-content.clear-writer-print-margin-content::after,
    .pagedjs_margin-content.clear-writer-print-margin-content::before {
      content: none !important;
    }
    .pagedjs_margin-content.clear-writer-print-margin-content {
      overflow: hidden;
    }
    .pagedjs_margin-content.clear-writer-print-margin-content > img {
      display: block;
      box-sizing: border-box;
      flex: 0 1 auto;
      min-width: 0;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .pagedjs_page.clear-writer-print-no-header .pagedjs_margin-top,
    .pagedjs_page.clear-writer-print-no-header .pagedjs_margin-top * {
      visibility: hidden !important;
    }
    .pagedjs_page.clear-writer-print-no-footer .pagedjs_margin-bottom,
    .pagedjs_page.clear-writer-print-no-footer .pagedjs_margin-bottom * {
      visibility: hidden !important;
    }
    ${typographyCss('p', layout.typography.paragraph)}
    ${typographyCss('h1', layout.typography.h1)}
    ${typographyCss('h2', layout.typography.h2)}
    ${typographyCss('h3', layout.typography.h3)}
    ${typographyCss('h4', layout.typography.h4)}
    ${typographyCss('h5', layout.typography.h5)}
    ${typographyCss('h6', layout.typography.h6)}
    ${unorderedListCss('ul[data-marker="asterisk"]', layout.lists.ulAsterisk)}
    ${unorderedListCss('ul[data-marker="dash"]', layout.lists.ulDash)}
    ${unorderedListCss('ul[data-marker="plus"]', layout.lists.ulPlus)}
    ${orderedListCss('ol[data-marker="period"]', layout.lists.ol)}
    ${orderedListCss('ol[data-marker="paren"]', layout.lists.olParen)}
    ${tableCss(1, layout.tables.table1)}
    ${tableCss(2, layout.tables.table2)}
    ${imageCss(layout.images)}
    ${layout.customStyles.map(customStyleCss).join('\n')}
    ${layout.customBlockStyles.map(style => customBlockStyleCss(style, layout.typography.paragraph)).join('\n')}
    ${layout.toc ? tocCss(layout.toc) : ''}
    .clear-writer-print-content [data-print-break-before="true"] {
      break-before: page;
      page-break-before: always;
    }
  `;
}

function typographyCss(selector: string, style: TypographyStyle): string {
  return `
    .clear-writer-print-content ${selector} {
      font-family: ${cssString(style.fontFamily)};
      font-size: ${style.fontSize}pt;
      color: ${style.color};
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
      line-height: ${style.lineHeight};
      margin-top: ${style.marginTop}pt;
      margin-bottom: ${style.marginBottom}pt;
    }
  `;
}

function listBaseCss(selector: string, style: ListStyle): string {
  return `
    .clear-writer-print-content ${selector} {
      margin: 0;
      padding-inline-start: ${style.marginLeft}pt;
      list-style: none;
    }
    .clear-writer-print-content ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${style.paddingLeft}pt;
      padding: 0;
      font-family: ${cssString(style.fontFamily)};
      font-size: ${style.fontSize}pt;
      color: ${style.color};
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
      line-height: ${style.lineHeight};
    }
    .clear-writer-print-content ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      color: ${style.bulletColor || style.color || 'inherit'};
    }
    .clear-writer-print-content ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }
    .clear-writer-print-content ${selector} > li > .document-list-content > :first-child { margin-top: 0; }
    .clear-writer-print-content ${selector} > li > .document-list-content > :last-child { margin-bottom: 0; }
  `;
}

function unorderedListCss(selector: string, style: ListStyle): string {
  return `${listBaseCss(selector, style)}
    .clear-writer-print-content ${selector} > li > .document-list-marker::before {
      content: ${cssString(style.bulletIcon)};
    }
  `;
}

function orderedListCss(selector: string, style: ListStyle): string {
  return listBaseCss(selector, style);
}

function tableCss(styleNumber: 1 | 2, style: TableStyle): string {
  const selector = `.clear-writer-print-content table[data-table-style="${styleNumber}"]`;
  return `
    ${selector} {
      width: 100%;
      margin-top: ${style.marginTop}pt;
      margin-bottom: ${style.marginBottom}pt;
      border-collapse: collapse;
      border-spacing: 0;
      font-family: ${cssString(style.fontFamily)};
      font-size: ${style.fontSize}pt;
    }
    ${selector} th, ${selector} td {
      padding: ${style.cellPadding}pt;
      border: ${style.borderWidth}pt solid ${style.borderColor};
      vertical-align: top;
    }
    ${selector} thead th {
      color: ${style.headerTextColor};
      background-color: ${style.headerBackground};
      font-weight: ${style.headerBold ? 'bold' : 'normal'};
    }
    ${selector} tbody td {
      color: ${style.bodyTextColor};
      background-color: ${style.bodyBackground};
    }
    ${selector} tbody tr:nth-child(even) td {
      background-color: ${style.alternateRowColor};
    }
  `;
}

function imageCss(image: ImageSetup): string {
  const horizontalMargins = image.alignment === 'left' ? '0 auto 0 0'
    : image.alignment === 'right' ? '0 0 0 auto'
      : '0 auto';
  return `
    .clear-writer-print-content .clear-writer-print-image-block {
      margin: 0;
    }
    .clear-writer-print-content .clear-writer-print-image-block > img[data-image-source] {
      display: block;
      max-width: 100%;
      height: auto;
      margin: ${image.marginTop}mm ${horizontalMargins} ${image.marginBottom}mm;
    }
  `;
}

function customStyleCss(style: PrintLayoutSettings['customStyles'][number]): string {
  return `
    .clear-writer-print-content .custom-style[data-custom-style-id=${cssString(style.id)}] {
      font-family: ${cssString(style.fontFamily)};
      font-size: ${style.fontSize}pt;
      ${style.color ? `color: ${style.color};` : ''}
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
    }
  `;
}

function customBlockStyleCss(
  style: PrintLayoutSettings['customBlockStyles'][number],
  paragraph: TypographyStyle
): string {
  return `
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssString(style.id)}] {
      font-family: ${cssString(style.fontFamily)};
      font-size: ${style.fontSize}pt;
      ${style.color ? `color: ${style.color};` : ''}
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
      line-height: ${style.lineHeight ?? paragraph.lineHeight};
      margin-top: ${style.marginTop ?? paragraph.marginTop}pt;
      margin-bottom: ${style.marginBottom ?? paragraph.marginBottom}pt;
    }
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssString(style.id)}] > .custom-block-icon {
      display: inline-block;
      margin-inline-end: .5em;
    }
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssString(style.id)}] > img.custom-block-glyph {
      width: 1em;
      height: 1em;
      object-fit: contain;
      vertical-align: -0.12em;
    }
  `;
}

function tocCss(toc: TocSetup): string {
  const levels = ([1, 2, 3, 4, 5, 6] as const).map(level => {
    const style = toc[`h${level}`];
    return `
      .clear-writer-print-content .toc-level-${level} {
        font-family: ${cssString(style.fontFamily)};
        font-size: ${style.fontSize}pt;
        color: ${style.color};
        font-weight: ${style.isBold ? 'bold' : 'normal'};
        font-style: ${style.isItalic ? 'italic' : 'normal'};
      }
      .clear-writer-print-content .toc-level-${level} .toc-label {
        text-transform: ${style.isAllCaps ? 'uppercase' : 'none'};
      }
    `;
  }).join('');
  return `
    .clear-writer-print-content .table-of-contents { margin-bottom: 2em; }
    .clear-writer-print-content .toc-list { margin: 0; padding: 0; list-style: none; }
    .clear-writer-print-content .toc-item { margin: .2em 0; line-height: ${toc.lineHeight}; }
    .clear-writer-print-content .toc-level-1 { margin-left: 0; margin-top: 1em; }
    .clear-writer-print-content .toc-level-2 { margin-left: 1.5em; }
    .clear-writer-print-content .toc-level-3 { margin-left: 3em; }
    .clear-writer-print-content .toc-level-4 { margin-left: 4.5em; }
    .clear-writer-print-content .toc-level-5 { margin-left: 6em; }
    .clear-writer-print-content .toc-level-6 { margin-left: 7.5em; }
    .clear-writer-print-content .toc-link {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      color: inherit;
      text-decoration: none;
    }
    .clear-writer-print-content .toc-label { min-width: 0; }
    .clear-writer-print-content .toc-leader {
      flex: 1 1 auto;
      min-width: 1.5em;
      border-bottom: 1px dotted currentColor;
      transform: translateY(-0.2em);
    }
    .clear-writer-print-content .toc-page-number {
      flex: 0 0 auto;
      min-width: 2ch;
      text-align: right;
    }
    ${levels}
  `;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ')}"`;
}

function cssDimension(value: string): string {
  return value.trim().replace(/[;{}]/g, '');
}
