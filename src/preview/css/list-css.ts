import type { ListSetup, ListStyle } from '../../state';
import { resolveListStyle } from '../../styles/resolved-document-styles';
import {
  listStructureCss,
  unorderedListCss,
  type DocumentCssScope,
} from '../../styles/document-style-css';

const LIVE_SCOPE: DocumentCssScope = {
  scope: ':is(.pagedjs_page_content, .paged-stage.is-live-preview)',
  important: true,
};

const content = ':is(.pagedjs_page_content, .paged-stage.is-live-preview)';

function counterStyle(value: string): string {
  const allowed = new Set(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']);
  return allowed.has(value) ? value : 'decimal';
}

function buildUnorderedListCss(selector: string, config: ListStyle): string {
  return unorderedListCss(selector, resolveListStyle(config), LIVE_SCOPE);
}

function buildOrderedListCss(selector: string, config: ListStyle, delimiter: '.' | ')'): string {
  const resolved = resolveListStyle(config);
  return `
    ${listStructureCss(selector, resolved, LIVE_SCOPE)}
    ${content} ${selector} {
      /* Keep list spacing on the list itself. This is important for a list
         that is the only (or first/last) block in a section: selectors based
         on sibling position make its configured margins disappear in the
         single-section preview. */
      counter-reset: document-ordered-list calc(attr(start type(<integer>), 1) - 1) !important;
    }
    ${content} ${selector} > li {
      counter-increment: document-ordered-list;
    }
    ${content} ${selector} > li > .document-list-marker::before {
      content: counter(document-ordered-list, ${counterStyle(config.bulletIcon)}) "${delimiter}";
    }
    ${content} ${selector} > li > .document-list-marker.is-materialized::before {
      content: none;
    }
  `;
}

export function generateListCss(setup: ListSetup): string {
  return `
    ${buildUnorderedListCss('ul[data-marker="asterisk"]', setup.ulAsterisk)}
    ${buildUnorderedListCss('ul[data-marker="dash"]', setup.ulDash)}
    ${buildUnorderedListCss('ul[data-marker="plus"]', setup.ulPlus)}
    ${buildOrderedListCss('ol[data-marker="period"]', setup.ol, '.')}
    ${buildOrderedListCss('ol[data-marker="paren"]', setup.olParen, ')')}
  `;
}
