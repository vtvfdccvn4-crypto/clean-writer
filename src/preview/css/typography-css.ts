import type { TypographySetup } from '../../state';
import { resolveTypographyStyle } from '../../styles/resolved-document-styles';
export function generateTypographyCss(setup: TypographySetup): string {
  const content = ':is(.pagedjs_page_content, .paged-stage.is-live-preview)';
  const applyStyle = (tag: string, s: any) => `
    ${content} ${tag} {
      font-family: ${s.fontFamily} !important;
      font-size: ${s.fontSize}pt !important;
      color: ${s.color || 'inherit'} !important;
      font-weight: ${s.isBold ? 'bold' : 'normal'} !important;
      font-style: ${s.isItalic ? 'italic' : 'normal'} !important;
      line-height: ${s.lineHeight} !important;
      margin-top: ${s.marginTop}pt !important;
      margin-bottom: ${s.marginBottom}pt !important;
    }
  `;

  return `
    ${applyStyle('p', resolveTypographyStyle(setup.paragraph))}
    ${applyStyle('h1', resolveTypographyStyle(setup.h1))}
    ${applyStyle('h2', resolveTypographyStyle(setup.h2))}
    ${applyStyle('h3', resolveTypographyStyle(setup.h3))}
    ${applyStyle('h4', resolveTypographyStyle(setup.h4))}
    ${applyStyle('h5', resolveTypographyStyle(setup.h5))}
    ${applyStyle('h6', resolveTypographyStyle(setup.h6))}
    ${content} a {
      color: inherit !important;
    }
  `;
}
