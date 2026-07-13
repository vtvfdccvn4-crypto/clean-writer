import type { PageSetup, TypographySetup, ListSetup, ListStyle, TableSetup, TableStyle } from '../state';
import { state } from '../state';

export const resolveMarginContent = (content: string, pageNumber?: number) => {
  const meta = state.current.projectMetadata;
  let formatted = content;
  
  if (meta) {
    formatted = formatted.replace(/\$\{author\}/g, meta.author || '');
    formatted = formatted.replace(/\$\{documentTitle\}/g, meta.documentTitle || '');
    formatted = formatted.replace(/\$\{documentName\}/g, meta.documentName || '');
    formatted = formatted.replace(/\$\{documentNumber\}/g, meta.documentNumber || '');
    formatted = formatted.replace(/\$\{documentRevision\}/g, meta.documentRevision || '');
    formatted = formatted.replace(/\$\{documentType\}/g, meta.documentType || '');
    formatted = formatted.replace(/\$\{productName\}/g, meta.productName || '');
    formatted = formatted.replace(/\$\{productModule\}/g, meta.productModule || '');
    formatted = formatted.replace(/\$\{productVersion\}/g, meta.productVersion || '');
  }

  if (pageNumber !== undefined) {
    formatted = formatted.replace(/\{page\}/g, String(pageNumber));
  }

  return formatted;
};

// RenderEngine supplies resolved chapter text as a real margin child. Hide
// Paged.js' generated pseudo-content so page counters are not duplicated.
const chapterMarginOverrideCss = `
  .chapter-margin-resolved::before,
  .chapter-margin-resolved::after { content: none !important; }
`;

const formatContent = (content: string) => {
  if (!content) return '""';

  // Chapter labels are resolved per physical page after Paged.js has laid out
  // the document. Do not also generate this margin box in CSS: Paged.js keeps
  // its generated page counter alongside the resolved DOM text otherwise.
  if (/\{chapter:[^{}]*\}/i.test(content)) return '""';

  let formatted = resolveMarginContent(content);

  // Preserve requested line breaks while escaping CSS string metacharacters.
  formatted = formatted.replace(/\\n/g, '\uE000').replace(/<br\s*\/?>/gi, '\uE000');
  formatted = formatted.replace(/\\/g, '\\\\');
  formatted = formatted.replace(/"/g, '\\"');
  formatted = formatted.replace(/\uE000/g, '\\A ');

  if (formatted.includes('{page}')) {
    const parts = formatted.split('{page}');
    return parts.map(p => `"${p}"`).join(' counter(page) ');
  }
  return `"${formatted}"`;
};

const renderMarginBox = (box: string, cell?: any) => {
  if (!cell || !cell.content) return '';
  return `
    @${box} {
      content: ${formatContent(cell.content)};
      font-family: "${cell.fontFamily}", sans-serif;
      font-size: ${cell.fontSize}pt;
      color: ${cell.color};
      font-weight: ${cell.isBold ? 'bold' : 'normal'};
      font-style: ${cell.isItalic ? 'italic' : 'normal'};
      text-align: ${cell.horizontalAlign || 'center'};
      vertical-align: ${cell.verticalAlign || 'middle'};
      white-space: pre-wrap;
    }
  `;
};

export function generatePageCss(s: PageSetup): string {
  const isWorker = window.location.search.includes('worker=true');
  const shouldShowHeaders = isWorker || state.current.isFullDocMode;

  const emptyCell = {content:''};
  const emptyBox = { centerWidth: '100px', left: emptyCell, center: emptyCell, right: emptyCell };

  const header = shouldShowHeaders ? (s.header || emptyBox) : emptyBox;
  const footer = shouldShowHeaders ? (s.footer || emptyBox) : emptyBox;
  const defaultTocStyle = {
    fontFamily: 'Times New Roman',
    fontSize: 11,
    color: '#000000',
    isBold: false,
    isItalic: false,
    isAllCaps: false
  };
  const tocLineHeight = typeof s.toc?.lineHeight === 'number' && Number.isFinite(s.toc.lineHeight)
    ? Math.min(3, Math.max(0.5, s.toc.lineHeight))
    : 1.2;
  const specialHeadingCss = (s.specialHeadings || []).map(item => `
    .special-heading[data-special-heading-id="${item.id}"] {
      break-before: ${item.breakBefore ? 'page' : 'auto'} !important;
      page-break-before: ${item.breakBefore ? 'always' : 'auto'} !important;
    }
    .pagedjs_page_content .special-heading[data-special-heading-id="${item.id}"] {
      font-family: "${item.fontFamily}", serif !important;
      font-size: ${item.fontSize}pt !important;
      color: ${item.color} !important;
      font-weight: ${item.isBold ? 'bold' : 'normal'} !important;
      font-style: ${item.isItalic ? 'italic' : 'normal'} !important;
      text-transform: ${item.isAllCaps ? 'uppercase' : 'none'} !important;
      line-height: ${item.lineHeight} !important;
      margin-top: ${item.marginTop}pt !important;
      margin-bottom: ${item.marginBottom}pt !important;
    }
  `).join('');
  const renderTocLevelStyle = (level: number) => {
    const style = s.toc?.[`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'] || defaultTocStyle;
    return `
      .table-of-contents .toc-item.toc-level-${level} {
        font-family: "${style.fontFamily}", serif;
        font-size: ${style.fontSize}pt;
        color: ${style.color};
        font-weight: ${style.isBold ? 'bold' : 'normal'};
        font-style: ${style.isItalic ? 'italic' : 'normal'};
      }
      .table-of-contents .toc-item.toc-level-${level} .toc-label {
        text-transform: ${style.isAllCaps ? 'uppercase' : 'none'};
      }
    `;
  };

  return `${chapterMarginOverrideCss}

    @page {
      size: ${s.paperWidth}mm ${s.paperHeight}mm;
      margin: ${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm;
      
      ${renderMarginBox('top-left', header.left)}
      ${renderMarginBox('top-center', header.center)}
      ${renderMarginBox('top-right', header.right)}

      ${renderMarginBox('bottom-left', footer.left)}
      ${renderMarginBox('bottom-center', footer.center)}
      ${renderMarginBox('bottom-right', footer.right)}
    }

    /* Paged.js Margin Grid Overrides */
    .pagedjs_margin-top {
      grid-template-columns: 1fr ${header.centerWidth} 1fr !important;
    }
    .pagedjs_margin-bottom {
      grid-template-columns: 1fr ${footer.centerWidth} 1fr !important;
    }

    /* Ensure line breaks in margin boxes are respected */
    .pagedjs_margin-content,
    .pagedjs_margin-content::after,
    .pagedjs_margin-content::before {
      white-space: pre-wrap !important;
    }

    /* Markdown image cells are rendered into the real margin DOM after pagination. */
    .pagedjs_margin-content.has-markdown-image::after {
      content: none !important;
    }

    .pagedjs_margin-content.has-markdown-image {
      height: 100%;
      overflow: hidden;
    }

    ${s.showGuidelines && !window.location.search.includes('worker=true') ? `
    /* Preview Guidelines */
    .pagedjs_page_content {
      outline: 1px dashed rgba(255, 100, 100, 0.4) !important;
      outline-offset: -1px;
    }
    .pagedjs_margin-top-left, .pagedjs_margin-top-center, .pagedjs_margin-top-right,
    .pagedjs_margin-bottom-left, .pagedjs_margin-bottom-center, .pagedjs_margin-bottom-right {
      outline: 1px dashed rgba(100, 200, 100, 0.5) !important;
      outline-offset: -1px;
    }
    ` : ''}

    h1 {
      break-before: page;
    }

    .section-break {
      break-before: page;
      page-break-before: always;
      display: block;
      height: 0px;
      overflow: hidden;
    }

    .section-break + h1 {
      break-before: avoid !important;
      page-break-before: avoid !important;
    }

    .heading-number {
      font: inherit;
      color: inherit;
    }
    .special-heading-number { font: inherit; color: inherit; }
    ${specialHeadingCss}

    .page-no-header {
      /* Marker class resolved after pagination to avoid page reflow. */
    }
    .page-no-footer {
      /* Marker class resolved after pagination to avoid page reflow. */
    }

    .pagedjs_page.page-no-header .pagedjs_margin-top,
    .pagedjs_page.page-no-header .pagedjs_margin-top .pagedjs_margin-content,
    .pagedjs_page.page-no-header .pagedjs_margin-top .pagedjs_margin-content::before,
    .pagedjs_page.page-no-header .pagedjs_margin-top .pagedjs_margin-content::after {
      visibility: hidden !important;
      content: none !important;
    }

    .pagedjs_page.page-no-footer .pagedjs_margin-bottom,
    .pagedjs_page.page-no-footer .pagedjs_margin-bottom .pagedjs_margin-content,
    .pagedjs_page.page-no-footer .pagedjs_margin-bottom .pagedjs_margin-content::before,
    .pagedjs_page.page-no-footer .pagedjs_margin-bottom .pagedjs_margin-content::after {
      visibility: hidden !important;
      content: none !important;
    }

    /* Table of Contents */
    .table-of-contents {
      margin-bottom: 2em;
    }
    .table-of-contents .toc-list {
      list-style: none;
      padding-left: 0;
    }
    .table-of-contents .toc-item {
      margin: 0.2em 0;
      line-height: ${tocLineHeight};
    }
    .table-of-contents .toc-item.toc-level-1 { margin-left: 0; margin-top: 1em; }
    .table-of-contents .toc-item.toc-level-2 { margin-left: 1.5em; }
    .table-of-contents .toc-item.toc-level-3 { margin-left: 3em; }
    .table-of-contents .toc-item.toc-level-4 { margin-left: 4.5em; }
    .table-of-contents .toc-item.toc-level-5 { margin-left: 6em; }
    .table-of-contents .toc-item.toc-level-6 { margin-left: 7.5em; }
    ${[1, 2, 3, 4, 5, 6].map(renderTocLevelStyle).join('')}
    
    .table-of-contents .toc-link {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      text-decoration: none;
      color: inherit;
    }
    .table-of-contents .toc-label {
      min-width: 0;
    }
    .table-of-contents .toc-leader {
      flex: 1 1 auto;
      min-width: 1.5em;
      border-bottom: 1px dotted currentColor;
      transform: translateY(-0.2em);
    }
    .table-of-contents .toc-link::after {
      content: target-counter(attr(href), page);
      flex: 0 0 auto;
      min-width: 2ch;
      text-align: right;
    }
  `;
}

export function generateTypographyCss(setup: TypographySetup): string {
  const applyStyle = (tag: string, s: any) => `
    .pagedjs_page_content ${tag} {
      font-family: ${s.fontFamily} !important;
      font-size: ${s.fontSize}pt !important;
      color: ${s.color} !important;
      font-weight: ${s.isBold ? 'bold' : 'normal'} !important;
      font-style: ${s.isItalic ? 'italic' : 'normal'} !important;
      line-height: ${s.lineHeight} !important;
      margin-top: ${s.marginTop}pt !important;
      margin-bottom: ${s.marginBottom}pt !important;
    }
  `;

  return `
    ${applyStyle('p', setup.paragraph)}
    ${applyStyle('h1', setup.h1)}
    ${applyStyle('h2', setup.h2)}
    ${applyStyle('h3', setup.h3)}
    ${applyStyle('h4', setup.h4)}
    ${applyStyle('h5', setup.h5)}
    ${applyStyle('h6', setup.h6)}
  `;
}

export function generateListCss(setup: ListSetup): string {
  const points = (value: number, fallback: number): number => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, Math.min(100, numericValue)) : fallback;
  };

  const cssString = (value: string, fallback: string): string => {
    const text = value || fallback;
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ')}"`;
  };

  const counterStyle = (value: string): string => {
    const allowed = new Set(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']);
    return allowed.has(value) ? value : 'decimal';
  };

  const listTypography = (selector: string, config: ListStyle) => `
    .pagedjs_page_content ${selector} > li {
      font-family: ${config.fontFamily} !important;
      font-size: ${points(config.fontSize, 11)}pt !important;
      color: ${config.color} !important;
      font-weight: ${config.isBold ? 'bold' : 'normal'} !important;
      font-style: ${config.isItalic ? 'italic' : 'normal'} !important;
      line-height: ${Math.min(5, Math.max(0.5, Number(config.lineHeight) || 1.6))} !important;
    }
  `;

  const buildUnorderedListCss = (selector: string, config: ListStyle) => `
    .pagedjs_page_content ${selector} {
      margin-left: 0 !important;
      padding-inline-start: ${points(config.marginLeft, 20)}pt !important;
      list-style: none !important;
    }

    ${listTypography(selector, config)}

    .pagedjs_page_content ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${points(config.paddingLeft, 8)}pt;
      padding-left: 0 !important;
    }

    .pagedjs_page_content ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      color: ${config.bulletColor} !important;
    }

    .pagedjs_page_content ${selector} > li > .document-list-marker::before {
      content: ${cssString(config.bulletIcon, '•')};
    }

    .pagedjs_page_content ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }
  `;

  const buildOrderedListCss = (selector: string, config: ListStyle, delimiter: '.' | ')') => `
    .pagedjs_page_content ${selector} {
      margin-left: 0 !important;
      padding-inline-start: ${points(config.marginLeft, 20)}pt !important;
      list-style: none !important;
      counter-reset: document-ordered-list calc(attr(start type(<integer>), 1) - 1);
    }

    ${listTypography(selector, config)}

    .pagedjs_page_content ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${points(config.paddingLeft, 8)}pt;
      padding-left: 0 !important;
      counter-increment: document-ordered-list;
    }

    .pagedjs_page_content ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      color: ${config.bulletColor} !important;
    }

    .pagedjs_page_content ${selector} > li > .document-list-marker::before {
      content: counter(document-ordered-list, ${counterStyle(config.bulletIcon)}) "${delimiter}";
    }

    .pagedjs_page_content ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }
  `;

  return `
    ${buildUnorderedListCss('ul[data-marker="asterisk"]', setup.ulAsterisk)}
    ${buildUnorderedListCss('ul[data-marker="dash"]', setup.ulDash)}
    ${buildUnorderedListCss('ul[data-marker="plus"]', setup.ulPlus)}
    ${buildOrderedListCss('ol[data-marker="period"]', setup.ol, '.')}
    ${buildOrderedListCss('ol[data-marker="paren"]', setup.olParen, ')')}
  `;
}

export function generateTableCss(setup: TableSetup): string {
  const number = (value: number, fallback: number, max: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
  };

  const buildTableCss = (styleNumber: 1 | 2, config: TableStyle) => {
    const selector = `table[data-table-style="${styleNumber}"]`;
    return `
      .pagedjs_page_content ${selector} {
        width: 100%;
        margin: ${number(config.marginTop, 8, 200)}pt 0 ${number(config.marginBottom, 12, 200)}pt;
        border-collapse: collapse;
        border-spacing: 0;
        font-family: ${config.fontFamily} !important;
        font-size: ${number(config.fontSize, 10, 200)}pt !important;
        color: ${config.bodyTextColor};
        background: ${config.bodyBackground};
        break-inside: auto;
      }

      .pagedjs_page_content ${selector} th,
      .pagedjs_page_content ${selector} td {
        padding: ${number(config.cellPadding, 6, 50)}pt;
        border: ${number(config.borderWidth, 0.75, 10)}pt solid ${config.borderColor};
        vertical-align: top;
        line-height: 1.2;
      }

      .pagedjs_page_content ${selector} th:empty::before,
      .pagedjs_page_content ${selector} td:empty::before {
        content: "\\00a0";
        display: inline-block;
        min-height: 1.2em;
      }

      .pagedjs_page_content ${selector} thead th {
        color: ${config.headerTextColor};
        background: ${config.headerBackground};
        font-weight: ${config.headerBold ? '700' : '400'};
      }

      .pagedjs_page_content ${selector} tbody td {
        color: ${config.bodyTextColor};
        background: ${config.bodyBackground};
      }

      .pagedjs_page_content ${selector} tbody tr:nth-child(even) td {
        background: ${config.alternateRowColor};
      }

      .pagedjs_page_content ${selector} tr {
        break-inside: avoid;
      }
    `;
  };

  return `${buildTableCss(1, setup.table1)}${buildTableCss(2, setup.table2)}`;
}
