import type { TypographySetup } from '../../state';
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

