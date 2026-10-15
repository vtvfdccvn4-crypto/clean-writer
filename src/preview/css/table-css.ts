import type { TableSetup } from '../../types';
import { resolveTableStyle } from '../../styles/resolved-document-styles';
import { tableScopedCss, type DocumentCssScope } from '../../styles/document-style-css';

const LIVE_SCOPE: DocumentCssScope = {
  scope: ':is(.pagedjs_page_content, .paged-stage.is-live-preview)',
  important: true,
};

export function generateTableCss(setup: TableSetup): string {
  return `${tableScopedCss(1, resolveTableStyle(setup.table1), LIVE_SCOPE)}${tableScopedCss(2, resolveTableStyle(setup.table2), LIVE_SCOPE)}`;
}
