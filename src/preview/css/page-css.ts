import type { PageSetup } from '../../state';
import { resolveHeaderFooterCell, resolvePageTocStyles, resolveSpecialHeadingStyle } from '../../styles/resolved-document-styles';
import { state } from '../../state';

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
  const resolved = resolveHeaderFooterCell(cell);
  return `
    @${box} {
      content: ${formatContent(resolved.content)};
      font-family: "${resolved.fontFamily}", sans-serif;
      font-size: ${resolved.fontSize}pt;
      color: ${resolved.color};
      font-weight: ${resolved.isBold ? 'bold' : 'normal'};
      font-style: ${resolved.isItalic ? 'italic' : 'normal'};
      text-align: ${resolved.horizontalAlign || 'center'};
      vertical-align: ${resolved.verticalAlign || 'middle'};
      white-space: pre-wrap;
    }
  `;
};

const escapeCssAttributeValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function generatePageCss(s: PageSetup): string {
  const isWorker = window.location.search.includes('worker=true');
  const shouldShowHeaders = isWorker || state.current.isFullDocMode;

  const emptyCell = {content:''};
  const emptyBox = { centerWidth: '100px', left: emptyCell, center: emptyCell, right: emptyCell };

  const header = shouldShowHeaders ? (s.header || emptyBox) : emptyBox;
  const footer = shouldShowHeaders ? (s.footer || emptyBox) : emptyBox;
  const tocLineHeight = typeof s.toc?.lineHeight === 'number' && Number.isFinite(s.toc.lineHeight)
    ? Math.min(3, Math.max(0.5, s.toc.lineHeight))
    : 1.2;
  const tocStyles = resolvePageTocStyles(s);
  const specialHeadingCss = (s.specialHeadings || []).map(item => {
    const style = resolveSpecialHeadingStyle(item);
    const id = escapeCssAttributeValue(item.id);
    return `
    .special-heading[data-special-heading-id="${id}"] {
      break-before: ${item.breakBefore ? 'page' : 'auto'} !important;
      page-break-before: ${item.breakBefore ? 'always' : 'auto'} !important;
    }
    .pagedjs_page_content .special-heading[data-special-heading-id="${id}"] {
      font-family: "${style.fontFamily}", serif !important;
      font-size: ${style.fontSize}pt !important;
      color: ${style.color} !important;
      font-weight: ${style.isBold ? 'bold' : 'normal'} !important;
      font-style: ${style.isItalic ? 'italic' : 'normal'} !important;
      text-transform: ${style.isAllCaps ? 'uppercase' : 'none'} !important;
      line-height: ${style.lineHeight} !important;
      margin-top: ${style.marginTop}pt !important;
      margin-bottom: ${style.marginBottom}pt !important;
    }
  `;
  }).join('');
  const renderTocLevelStyle = (level: number) => {
    const style = tocStyles[`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'];
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
      outline-offset: -1px;
    }
    .pagedjs_margin-top-left, .pagedjs_margin-top-center, .pagedjs_margin-top-right,
    .pagedjs_margin-bottom-left, .pagedjs_margin-bottom-center, .pagedjs_margin-bottom-right {
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
    }
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
