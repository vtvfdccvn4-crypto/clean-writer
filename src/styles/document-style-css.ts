import type { ListStyle, TableStyle, TypographyStyle } from '../types';

/** Options for the scope and specificity of generated document CSS. */
export interface DocumentCssScope {
  /** CSS selector prefix for the content area, e.g. ".clear-writer-print-content". */
  scope: string;
  /**
   * Append !important to every property.
   * Needed for live-preview CSS which shares a document with app styles.
   * Not needed for the isolated print/paginated iframe.
   */
  important?: boolean;
}

/** Escape a value for use inside a CSS quoted string literal. */
export function cssStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ')}"`;
}

function i(opts: DocumentCssScope): string {
  return opts.important ? ' !important' : '';
}

export function typographyElementCss(
  tag: string,
  style: TypographyStyle,
  opts: DocumentCssScope
): string {
  const s = i(opts);
  return `
    ${opts.scope} ${tag} {
      font-family: ${cssStringLiteral(style.fontFamily)}${s};
      font-size: ${style.fontSize}pt${s};
      color: ${style.color}${s};
      font-weight: ${style.isBold ? 'bold' : 'normal'}${s};
      font-style: ${style.isItalic ? 'italic' : 'normal'}${s};
      line-height: ${style.lineHeight}${s};
      margin-top: ${style.marginTop}pt${s};
      margin-bottom: ${style.marginBottom}pt${s};
    }
  `;
}

export function listStructureCss(
  selector: string,
  style: ListStyle,
  opts: DocumentCssScope
): string {
  const s = i(opts);
  return `
    ${opts.scope} ${selector} {
      margin-left: 0${s};
      margin-top: ${style.marginTop}pt${s};
      margin-bottom: ${style.marginBottom}pt${s};
      padding-inline-start: ${Math.max(0, style.marginLeft)}pt${s};
      list-style: none${s};
    }
    ${opts.scope} ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${Math.max(0, Math.min(100, style.paddingLeft))}pt;
      padding: 0${s};
      font-family: ${cssStringLiteral(style.fontFamily)}${s};
      font-size: ${style.fontSize}pt${s};
      color: ${style.color}${s};
      font-weight: ${style.isBold ? 'bold' : 'normal'}${s};
      font-style: ${style.isItalic ? 'italic' : 'normal'}${s};
      line-height: ${style.lineHeight}${s};
    }
    ${opts.scope} ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      color: ${style.bulletColor || style.color || 'inherit'};
      align-self: start;
      display: inline-flex;
      align-items: center;
      line-height: inherit;
    }
    ${opts.scope} ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }
    ${opts.scope} ${selector} > li > .document-list-content > p {
      font-family: inherit${s};
      font-size: inherit${s};
      color: inherit${s};
      font-weight: inherit${s};
      font-style: inherit${s};
      line-height: inherit${s};
    }
    ${opts.scope} ${selector} > li > .document-list-content > :first-child { margin-top: 0${s}; }
    ${opts.scope} ${selector} > li > .document-list-content > :last-child { margin-bottom: 0${s}; }
  `;
}

/** Unordered list CSS including the bullet ::before pseudo-element. */
export function unorderedListCss(
  selector: string,
  style: ListStyle,
  opts: DocumentCssScope
): string {
  return `${listStructureCss(selector, style, opts)}
    ${opts.scope} ${selector} > li > .document-list-marker::before {
      content: ${cssStringLiteral(style.bulletIcon)};
    }
  `;
}

/**
 * Ordered list structural CSS (grid layout, typography, content wrapper).
 * Counter generation is intentionally omitted: the print/paginated path uses
 * pre-materialized marker elements, while the live-preview path adds CSS
 * counters on top of this shared structure.
 */
export function orderedListStructureCss(
  selector: string,
  style: ListStyle,
  opts: DocumentCssScope
): string {
  return listStructureCss(selector, style, opts);
}

export function tableScopedCss(
  styleNumber: 1 | 2,
  style: TableStyle,
  opts: DocumentCssScope
): string {
  const s = i(opts);
  const sel = `table[data-table-style="${styleNumber}"]`;
  return `
    ${opts.scope} ${sel} {
      width: 100%;
      margin: ${style.marginTop}pt 0 ${style.marginBottom}pt${s};
      border-collapse: collapse;
      border-spacing: 0;
      font-family: ${cssStringLiteral(style.fontFamily)}${s};
      font-size: ${style.fontSize}pt${s};
      break-inside: auto;
    }
    ${opts.scope} ${sel} th,
    ${opts.scope} ${sel} td {
      padding: ${style.cellPadding}pt;
      border: ${style.borderWidth}pt solid ${style.borderColor};
      vertical-align: ${style.verticalAlign};
      line-height: 1.2;
    }
    ${opts.scope} ${sel} th:empty::before,
    ${opts.scope} ${sel} td:empty::before {
      content: "\\00a0";
      display: inline-block;
      min-height: 1.2em;
    }
    ${opts.scope} ${sel} thead th {
      color: ${style.headerTextColor};
      background: ${style.headerBackground};
      font-weight: ${style.headerBold ? 'bold' : 'normal'};
    }
    ${opts.scope} ${sel} tbody td {
      color: ${style.bodyTextColor};
      background: ${style.bodyBackground};
    }
    ${opts.scope} ${sel} tbody tr:nth-child(even) td {
      background: ${style.alternateRowColor};
    }
    ${opts.scope} ${sel} tr {
      break-inside: avoid;
    }
  `;
}
