import type { ListSetup, PageSetup, TableSetup, TypographySetup } from '../state';
import { generateListCss, generateTableCss, generateTypographyCss } from './CssGenerator';
import { resolvePageTocStyles, resolveSpecialHeadingStyle } from '../styles/resolved-document-styles';

/** Shared live/print style application, deliberately independent of Paged.js. */
export function applyTypographyPreviewStyle(setup: TypographySetup): void {
  replaceDynamicStyle('dynamic-typography-setup', generateTypographyCss(setup));
}

export function applyListPreviewStyle(setup: ListSetup): void {
  replaceDynamicStyle('dynamic-list-setup', generateListCss(setup));
}

export function applyTablePreviewStyle(setup: TableSetup): void {
  replaceDynamicStyle('dynamic-table-setup', generateTableCss(setup));
}

/** Keeps image-only paragraphs free of paragraph spacing.
 * Image placement itself comes exclusively from each image's Markdown attributes. */
export function applyImagePreviewStyle(): void {
  const content = ':is(.pagedjs_page_content, .paged-stage.is-live-preview)';
  replaceDynamicStyle('dynamic-image-setup', `
    /* Image-only paragraphs are document blocks. Reset their paragraph
       margins so each image's own margin attributes define its spacing. */
    ${content} p:has(> img[data-image-source]:only-child) {
      margin: 0 !important;
    }
  `);
}

/** Styles visible document features without importing print-page behaviour. */
export function applyLiveDocumentStyle(setup: PageSetup): void {
  const paperWidth = dimension(setup.paperWidth, 210, 50, 500);
  const paperHeight = dimension(setup.paperHeight, 297, 50, 500);
  const marginTop = dimension(setup.marginTop, 25, 0, Math.max(0, paperHeight - 40));
  const marginRight = dimension(setup.marginRight, 20, 0, Math.max(0, paperWidth - 40));
  const marginBottom = dimension(setup.marginBottom, 25, 0, Math.max(0, paperHeight - 40));
  const marginLeft = dimension(setup.marginLeft, 20, 0, Math.max(0, paperWidth - 40));
  const tocStyles = resolvePageTocStyles(setup);
  const tocLineHeight = Math.min(3, Math.max(0.5, Number(setup.toc?.lineHeight) || 1.2));
  const specialHeadings = (setup.specialHeadings ?? []).map(item => {
    const style = resolveSpecialHeadingStyle(item);
    const id = escapeCssAttributeValue(item.id);
    return `
      .paged-stage.is-live-preview .special-heading[data-special-heading-id="${id}"] {
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
  const tocLevels = [1, 2, 3, 4, 5, 6].map(level => {
    const style = tocStyles[`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'];
    return `
      .paged-stage.is-live-preview .toc-level-${level} {
        font-family: "${style.fontFamily}", serif;
        font-size: ${style.fontSize}pt;
        color: ${style.color};
        font-weight: ${style.isBold ? 'bold' : 'normal'};
        font-style: ${style.isItalic ? 'italic' : 'normal'};
      }
      .paged-stage.is-live-preview .toc-level-${level} .toc-label {
        text-transform: ${style.isAllCaps ? 'uppercase' : 'none'};
      }
    `;
  }).join('');
  replaceDynamicStyle('dynamic-live-document-setup', `
    /* Live editing is continuous, but its sheet geometry matches Page setup.
       The flex item must not shrink: otherwise narrow preview panes silently
       compress the configured page width and margins. */
    .paged-stage.is-live-preview {
      flex: 0 0 ${paperWidth}mm;
      width: ${paperWidth}mm;
      min-width: ${paperWidth}mm;
      max-width: none;
      min-height: max(100%, ${paperHeight}mm);
      padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
    }
    .paged-stage.is-live-preview .table-of-contents { margin-bottom: 2em; }
    .paged-stage.is-live-preview .toc-list { list-style: none; padding-left: 0; }
    .paged-stage.is-live-preview .toc-item { margin: 0.2em 0; line-height: ${tocLineHeight}; }
    .paged-stage.is-live-preview .toc-level-1 { margin-left: 0; margin-top: 1em; }
    .paged-stage.is-live-preview .toc-level-2 { margin-left: 1.5em; }
    .paged-stage.is-live-preview .toc-level-3 { margin-left: 3em; }
    .paged-stage.is-live-preview .toc-level-4 { margin-left: 4.5em; }
    .paged-stage.is-live-preview .toc-level-5 { margin-left: 6em; }
    .paged-stage.is-live-preview .toc-level-6 { margin-left: 7.5em; }
    .paged-stage.is-live-preview .toc-link { display: flex; align-items: baseline; gap: 0.4em; text-decoration: none; color: inherit; }
    .paged-stage.is-live-preview .toc-label { min-width: 0; }
    .paged-stage.is-live-preview .toc-leader { flex: 1 1 auto; min-width: 1.5em; border-bottom: 1px dotted currentColor; transform: translateY(-0.2em); }
    ${tocLevels}
    ${specialHeadings}
  `);
}

function replaceDynamicStyle(id: string, css: string): void {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.setAttribute('data-clear-writer-print-style', '');
  style.textContent = css;
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function dimension(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
