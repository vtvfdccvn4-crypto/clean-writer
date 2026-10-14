import type { ImageSetup, TocSetup } from '../types';
import type { PrintLayoutSettings } from './PrintLayoutSettings';
import {
  cssStringLiteral,
  orderedListStructureCss,
  tableScopedCss,
  typographyElementCss,
  unorderedListCss,
  type DocumentCssScope,
} from '../styles/document-style-css';

const PRINT_SCOPE: DocumentCssScope = { scope: '.clear-writer-print-content' };

/** Compiles the isolated stylesheet for the immutable print-layout snapshot. */
export function compilePrintCss(layout: PrintLayoutSettings): string {
  const marginBoxes = marginBoxCss(layout);
  const marginStyles = marginStyleCss(layout);
  return `
    @page {
      size: ${layout.paper.widthMm}mm ${layout.paper.heightMm}mm;
      margin: ${layout.paper.marginsMm.top}mm ${layout.paper.marginsMm.right}mm ${layout.paper.marginsMm.bottom}mm ${layout.paper.marginsMm.left}mm;
      ${marginBoxes}
    }
    ${marginStyles}
    ${typographyElementCss('p', layout.typography.paragraph, PRINT_SCOPE)}
    ${typographyElementCss('h1', layout.typography.h1, PRINT_SCOPE)}
    ${typographyElementCss('h2', layout.typography.h2, PRINT_SCOPE)}
    ${typographyElementCss('h3', layout.typography.h3, PRINT_SCOPE)}
    ${typographyElementCss('h4', layout.typography.h4, PRINT_SCOPE)}
    ${typographyElementCss('h5', layout.typography.h5, PRINT_SCOPE)}
    ${typographyElementCss('h6', layout.typography.h6, PRINT_SCOPE)}
    ${unorderedListCss('ul[data-marker="asterisk"]', layout.lists.ulAsterisk, PRINT_SCOPE)}
    ${unorderedListCss('ul[data-marker="dash"]', layout.lists.ulDash, PRINT_SCOPE)}
    ${unorderedListCss('ul[data-marker="plus"]', layout.lists.ulPlus, PRINT_SCOPE)}
    ${orderedListStructureCss('ol[data-marker="period"]', layout.lists.ol, PRINT_SCOPE)}
    ${orderedListStructureCss('ol[data-marker="paren"]', layout.lists.olParen, PRINT_SCOPE)}
    ${tableScopedCss(1, layout.tables.table1, PRINT_SCOPE)}
    ${tableScopedCss(2, layout.tables.table2, PRINT_SCOPE)}
    ${imageCss(layout.images)}
    ${layout.customStyles.map(customStyleCss).join('\n')}
    ${layout.customBlockStyles.map(style => customBlockStyleCss(style, layout.typography.paragraph)).join('\n')}
    ${layout.toc ? tocCss(layout.toc) : ''}
    ${layout.showGuidelines ? guidelineCss() : ''}
    .clear-writer-print-content [data-print-break-before="true"] {
      break-before: page;
      page-break-before: always;
    }
  `;
}

/**
 * The completed Paged.js pages are printed as physical sheets. Keep this
 * output rule in the artifact stylesheet so print cannot silently add its own
 * geometry or break policy after pagination has completed.
 */
export function compilePdfArtifactPrintCss(layout: PrintLayoutSettings): string {
  return `
    @media print {
      @page { size: ${layout.paper.widthMm}mm ${layout.paper.heightMm}mm; margin: 0; }
      html, body { margin: 0; padding: 0; }
      .pagedjs_page { break-after: page; }
      .pagedjs_page:last-child { break-after: auto; }
    }
  `;
}

/** Non-printing visual boundaries used while inspecting paginated previews. */
function guidelineCss(): string {
  return `
    @media screen {
      .pagedjs_page_content {
        outline: 1px dashed color-mix(in srgb, #2563eb 58%, transparent);
        outline-offset: -1px;
      }
      .pagedjs_margin-top-left, .pagedjs_margin-top-center, .pagedjs_margin-top-right,
      .pagedjs_margin-bottom-left, .pagedjs_margin-bottom-center, .pagedjs_margin-bottom-right {
        outline: 1px dashed color-mix(in srgb, #d97706 58%, transparent);
        outline-offset: -1px;
      }
    }
  `;
}

/** Paged.js only needs margin regions for cells that will receive content. */
function marginBoxCss(layout: PrintLayoutSettings): string {
  return marginCells(layout)
    .filter(([, content]) => content.trim().length > 0)
    .map(([position]) => `@${position} { content: ""; }`)
    .join('\n      ');
}

function marginStyleCss(layout: PrintLayoutSettings): string {
  const headerHasContent = marginCells(layout).slice(0, 3).some(([, content]) => content.trim().length > 0);
  const footerHasContent = marginCells(layout).slice(3).some(([, content]) => content.trim().length > 0);
  if (!headerHasContent && !footerHasContent) return '';
  return `
    ${headerHasContent ? `.pagedjs_margin-top {
      grid-template-columns: minmax(0, 1fr) ${cssDimension(layout.header.centerWidth)} minmax(0, 1fr) !important;
    }
    .pagedjs_page.clear-writer-print-no-header .pagedjs_margin-top,
    .pagedjs_page.clear-writer-print-no-header .pagedjs_margin-top * {
      visibility: hidden !important;
    }` : ''}
    ${footerHasContent ? `.pagedjs_margin-bottom {
      grid-template-columns: minmax(0, 1fr) ${cssDimension(layout.footer.centerWidth)} minmax(0, 1fr) !important;
    }
    .pagedjs_page.clear-writer-print-no-footer .pagedjs_margin-bottom,
    .pagedjs_page.clear-writer-print-no-footer .pagedjs_margin-bottom * {
      visibility: hidden !important;
    }` : ''}
    .pagedjs_margin-content.clear-writer-print-margin-content::after,
    .pagedjs_margin-content.clear-writer-print-margin-content::before {
      content: none !important;
    }
    .pagedjs_margin-content.clear-writer-print-margin-content {
      overflow: hidden;
    }
    .pagedjs_margin-content.clear-writer-print-margin-content > img {
      box-sizing: border-box;
      flex: 0 1 auto;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      line-height: inherit;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }`;
}

function marginCells(layout: PrintLayoutSettings) {
  return [
    ['top-left', layout.header.left.content],
    ['top-center', layout.header.center.content],
    ['top-right', layout.header.right.content],
    ['bottom-left', layout.footer.left.content],
    ['bottom-center', layout.footer.center.content],
    ['bottom-right', layout.footer.right.content]
  ] as const;
}

function imageCss(image: ImageSetup): string {
  const margin = imageMarginCss(image);
  return `
    .clear-writer-print-content .clear-writer-print-image-block {
      margin: 0;
    }
    .clear-writer-print-content .clear-writer-print-image-block > img[data-image-source] {
      display: block;
      max-width: 100%;
      height: auto;
      margin: ${margin};
    }
  `;
}

function imageMarginCss(image: ImageSetup): string {
  const top = `${image.marginTop}mm`;
  const bottom = `${image.marginBottom}mm`;
  if (image.alignment === 'left') return `${top} auto ${bottom} 0`;
  if (image.alignment === 'right') return `${top} 0 ${bottom} auto`;
  return image.marginTop === image.marginBottom ? `${top} auto` : `${top} auto ${bottom}`;
}

function customStyleCss(style: PrintLayoutSettings['customStyles'][number]): string {
  return `
    .clear-writer-print-content .custom-style[data-custom-style-id=${cssStringLiteral(style.id)}] {
      ${style.color ? `color: ${style.color};` : ''}
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
    }
  `;
}

function customBlockStyleCss(
  style: PrintLayoutSettings['customBlockStyles'][number],
  paragraph: PrintLayoutSettings['typography']['paragraph']
): string {
  return `
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssStringLiteral(style.id)}] {
      font-family: ${cssStringLiteral(style.fontFamily)};
      font-size: ${style.fontSize}pt;
      ${style.color ? `color: ${style.color};` : ''}
      font-weight: ${style.isBold ? 'bold' : 'normal'};
      font-style: ${style.isItalic ? 'italic' : 'normal'};
      line-height: ${style.lineHeight ?? paragraph.lineHeight};
      margin-top: ${style.marginTop ?? paragraph.marginTop}pt;
      margin-bottom: ${style.marginBottom ?? paragraph.marginBottom}pt;
    }
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssStringLiteral(style.id)}] > .custom-block-icon {
      display: inline-block;
      margin-inline-end: .5em;
    }
    .clear-writer-print-content .custom-block-style[data-custom-block-id=${cssStringLiteral(style.id)}] > img.custom-block-glyph {
      width: 1em;
      height: 1em;
      object-fit: contain;
      vertical-align: -0.12em;
    }
  `;
}

function tocCss(toc: TocSetup): string {
  const defaultIndentations = [0, 19.5, 36, 49.5, 66, 82.5];
  const levels = ([1, 2, 3, 4, 5, 6] as const).map(level => {
    const style = toc[`h${level}`];
    return `
      .clear-writer-print-content .toc-level-${level} {
        font-family: ${cssStringLiteral(style.fontFamily)};
        font-size: ${style.fontSize}pt;
        color: ${style.color};
        font-weight: ${style.isBold ? 'bold' : 'normal'};
        font-style: ${style.isItalic ? 'italic' : 'normal'};
        margin-left: ${style.indentation ?? defaultIndentations[level - 1]}pt;
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
    .clear-writer-print-content .toc-level-1 { margin-top: 1em; }
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
      flex: 0 0 4ch;
      inline-size: 4ch;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    ${levels}
  `;
}

function cssDimension(value: string): string {
  return value.trim().replace(/[;{}]/g, '');
}
