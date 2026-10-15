import type { PageSetup } from '../../types';
import { resolvePageTocStyles, resolveSpecialHeadingStyle } from '../../styles/resolved-document-styles';

interface DocumentFeatureCssOptions {
  /** Selector prefix for the rendering surface (empty for paginated output). */
  scope?: string;
  /** Emit pagination-only break rules for special headings. */
  includePageBreaks?: boolean;
  /** Emit the Paged.js page-counter pseudo-element for TOC links. */
  includePageCounters?: boolean;
}

const scoped = (scope: string, selector: string): string => scope ? `${scope} ${selector}` : selector;

export function generateSpecialHeadingCss(
  setup: PageSetup,
  options: Pick<DocumentFeatureCssOptions, 'scope' | 'includePageBreaks'> = {}
): string {
  const scope = options.scope ?? '';
  const includePageBreaks = options.includePageBreaks ?? false;
  return (setup.specialHeadings ?? []).map(item => {
    const style = resolveSpecialHeadingStyle(item);
    const id = escapeCssAttributeValue(item.id);
    const selector = `.special-heading[data-special-heading-id="${id}"]`;
    return `
      ${includePageBreaks ? `${selector} {
        break-before: ${item.breakBefore ? 'page' : 'auto'} !important;
        page-break-before: ${item.breakBefore ? 'always' : 'auto'} !important;
      }` : ''}
      ${scoped(scope, selector)} {
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
}

export function generateTocCss(
  setup: PageSetup,
  options: Pick<DocumentFeatureCssOptions, 'scope' | 'includePageCounters'> = {}
): string {
  const scope = options.scope ?? '';
  const includePageCounters = options.includePageCounters ?? false;
  const toc = scoped(scope, '.table-of-contents');
  const tocStyles = resolvePageTocStyles(setup);
  const lineHeight = typeof setup.toc?.lineHeight === 'number' && Number.isFinite(setup.toc.lineHeight)
    ? Math.min(3, Math.max(0.5, setup.toc.lineHeight))
    : 1.2;
  const levelStyles = [1, 2, 3, 4, 5, 6].map(level => {
    const style = tocStyles[`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'];
    return `
      ${toc} .toc-item.toc-level-${level} {
        font-family: "${style.fontFamily}", serif;
        font-size: ${style.fontSize}pt;
        color: ${style.color};
        font-weight: ${style.isBold ? 'bold' : 'normal'};
        font-style: ${style.isItalic ? 'italic' : 'normal'};
        margin-left: ${style.indentation}pt;
      }
      ${toc} .toc-item.toc-level-${level} .toc-label {
        text-transform: ${style.isAllCaps ? 'uppercase' : 'none'};
      }
    `;
  }).join('');

  return `
    ${toc} { margin-bottom: 2em; }
    ${toc} .toc-list { list-style: none; padding-left: 0; }
    ${toc} .toc-item { margin: 0.2em 0; line-height: ${lineHeight}; }
    ${toc} .toc-item.toc-level-1 { margin-top: 1em; }
    ${levelStyles}
    ${toc} .toc-link {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      text-decoration: none;
      color: inherit;
    }
    ${toc} .toc-label { min-width: 0; }
    ${toc} .toc-leader {
      flex: 1 1 auto;
      min-width: 1.5em;
      border-bottom: 1px dotted currentColor;
      transform: translateY(-0.2em);
    }
    ${includePageCounters ? `${toc} .toc-link::after {
      content: target-counter(attr(href), page);
      flex: 0 0 auto;
      min-width: 2ch;
      text-align: right;
    }` : ''}
  `;
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
