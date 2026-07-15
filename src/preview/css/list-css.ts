import type { ListSetup, ListStyle } from '../../state';
import { resolveListStyle } from '../../styles/resolved-document-styles';
export function generateListCss(setup: ListSetup): string {
  const content = ':is(.pagedjs_page_content, .paged-stage.is-live-preview)';
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
    ${content} ${selector} > li {
      font-family: ${config.fontFamily} !important;
      font-size: ${points(config.fontSize, 11)}pt !important;
      color: ${config.color || 'inherit'} !important;
      font-weight: ${config.isBold ? 'bold' : 'normal'} !important;
      font-style: ${config.isItalic ? 'italic' : 'normal'} !important;
      line-height: ${Math.min(5, Math.max(0.5, Number(config.lineHeight) || 1.6))} !important;
    }
  `;

  const buildUnorderedListCss = (selector: string, config: ListStyle) => `
    ${content} ${selector} {
      margin-left: 0 !important;
      /* List settings own marker geometry, while surrounding paragraph or
         heading styles own vertical rhythm. Reset the UA list margins so they
         do not silently stack with the configured spacing. */
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      padding-inline-start: ${points(config.marginLeft, 20)}pt !important;
      list-style: none !important;
    }

    ${listTypography(selector, resolveListStyle(config))}

    ${content} ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${points(config.paddingLeft, 8)}pt;
      padding-left: 0 !important;
    }

    ${content} ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
    }

    ${content} ${selector} > li > .document-list-marker::before {
      content: ${cssString(config.bulletIcon, '•')};
      color: ${config.bulletColor || config.color || 'inherit'};
    }

    ${content} ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }

    /* A loose Markdown list contains paragraph elements. Their outer margins
       are not document spacing; retaining them creates a blank band before
       the first item and after the last one. */
    ${content} ${selector} > li > .document-list-content > :first-child {
      margin-top: 0 !important;
    }

    ${content} ${selector} > li > .document-list-content > :last-child {
      margin-bottom: 0 !important;
    }
  `;

  const buildOrderedListCss = (selector: string, config: ListStyle, delimiter: '.' | ')') => `
    ${content} ${selector} {
      margin-left: 0 !important;
      /* See the unordered-list rule: vertical spacing belongs to surrounding
         document blocks, never to browser-default list margins. */
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      padding-inline-start: ${points(config.marginLeft, 20)}pt !important;
      list-style: none !important;
      counter-reset: document-ordered-list calc(attr(start type(<integer>), 1) - 1);
    }

    ${listTypography(selector, resolveListStyle(config))}

    ${content} ${selector} > li {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      column-gap: ${points(config.paddingLeft, 8)}pt;
      padding-left: 0 !important;
      counter-increment: document-ordered-list;
    }

    ${content} ${selector} > li > .document-list-marker {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
    }

    ${content} ${selector} > li > .document-list-marker::before {
      content: counter(document-ordered-list, ${counterStyle(config.bulletIcon)}) "${delimiter}";
    }

    ${content} ${selector} > li > .document-list-content {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }

    ${content} ${selector} > li > .document-list-content > :first-child {
      margin-top: 0 !important;
    }

    ${content} ${selector} > li > .document-list-content > :last-child {
      margin-bottom: 0 !important;
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
