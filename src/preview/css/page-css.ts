import type { PageSetup } from '../../state';
import { resolveHeaderFooterCell } from '../../styles/resolved-document-styles';
import { state } from '../../state';
import { generateSpecialHeadingCss, generateTocCss } from './document-features-css';

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

// The isolated paginator supplies resolved chapter text as a real margin child.
// Hide Paged.js' generated pseudo-content so page counters are not duplicated.
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

  if (/\{pages?\}/.test(formatted)) {
    return formatted
      .split(/(\{pages?\})/g)
      .map(part => part === '{page}'
        ? 'counter(page)'
        : part === '{pages}' ? 'counter(pages)' : `"${part}"`)
      .join(' ');
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

export function generatePageCss(s: PageSetup): string {
  const shouldShowHeaders = state.current.isFullDocMode;

  const emptyCell = {content:''};
  const emptyBox = { centerWidth: '100px', left: emptyCell, center: emptyCell, right: emptyCell };

  const header = shouldShowHeaders ? (s.header || emptyBox) : emptyBox;
  const footer = shouldShowHeaders ? (s.footer || emptyBox) : emptyBox;
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

    ${s.showGuidelines ? `
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
    ${generateSpecialHeadingCss(s, { includePageBreaks: true })}

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
    ${generateTocCss(s, { includePageCounters: true })}
  `;
}
