import type { ListSetup, PageSetup, TableSetup, TypographySetup } from '../state';
import { generateTypographyCss } from './css/typography-css';
import { generateListCss } from './css/list-css';
import { generateTableCss } from './css/table-css';
import { generateSpecialHeadingCss, generateTocCss } from './css/document-features-css';

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
      ${setup.showGuidelines ? 'outline: 1px dashed color-mix(in srgb, #2563eb 58%, transparent); outline-offset: -1px;' : 'outline: none;'}
    }
    ${generateTocCss(setup, { scope: '.paged-stage.is-live-preview' })}
    ${generateSpecialHeadingCss(setup, { scope: '.paged-stage.is-live-preview' })}
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

function dimension(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
