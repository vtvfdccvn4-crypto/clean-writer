import type { TypographySetup } from '../../types';
import { resolveTypographyStyle } from '../../styles/resolved-document-styles';
import { typographyElementCss, type DocumentCssScope } from '../../styles/document-style-css';

const LIVE_SCOPE: DocumentCssScope = {
  scope: ':is(.pagedjs_page_content, .paged-stage.is-live-preview)',
  important: true,
};

export function generateTypographyCss(setup: TypographySetup): string {
  return `
    ${typographyElementCss('p', resolveTypographyStyle(setup.paragraph), LIVE_SCOPE)}
    ${typographyElementCss('h1', resolveTypographyStyle(setup.h1), LIVE_SCOPE)}
    ${typographyElementCss('h2', resolveTypographyStyle(setup.h2), LIVE_SCOPE)}
    ${typographyElementCss('h3', resolveTypographyStyle(setup.h3), LIVE_SCOPE)}
    ${typographyElementCss('h4', resolveTypographyStyle(setup.h4), LIVE_SCOPE)}
    ${typographyElementCss('h5', resolveTypographyStyle(setup.h5), LIVE_SCOPE)}
    ${typographyElementCss('h6', resolveTypographyStyle(setup.h6), LIVE_SCOPE)}
    ${LIVE_SCOPE.scope} a {
      color: inherit !important;
    }
  `;
}
