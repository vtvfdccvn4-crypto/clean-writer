import type { HeaderFooterCell } from '../types';
import { parseMarkdownImages } from '../images/markdownImages';
import type { PdfPreviewMarginData } from './contracts';

type MarginEntry = { selector: string; cell: HeaderFooterCell; parts: MarginPart[] };

/**
 * Owns header/footer materialisation for the isolated PDF-preview route.
 * It remains independent from the visible editor preview so print output has
 * a stable, self-contained rendering boundary.
 */
export function materializePdfPreviewMargins(
  root: ParentNode,
  data: PdfPreviewMarginData,
  imageSources: Readonly<Record<string, string>>
): PdfPreviewMarginMaterializationMetrics {
  const startedAt = performance.now();
  const parseStartedAt = performance.now();
  const entries: MarginEntry[] = [
    { selector: '.pagedjs_margin-top-left > .pagedjs_margin-content', cell: data.header.left },
    { selector: '.pagedjs_margin-top-center > .pagedjs_margin-content', cell: data.header.center },
    { selector: '.pagedjs_margin-top-right > .pagedjs_margin-content', cell: data.header.right },
    { selector: '.pagedjs_margin-bottom-left > .pagedjs_margin-content', cell: data.footer.left },
    { selector: '.pagedjs_margin-bottom-center > .pagedjs_margin-content', cell: data.footer.center },
    { selector: '.pagedjs_margin-bottom-right > .pagedjs_margin-content', cell: data.footer.right }
  ].map(entry => ({
    ...entry,
    // Parse Markdown images once per cell instead of once per physical page.
    // Page and chapter substitutions remain dynamic in writeMargin().
    parts: parseParts(entry.cell.content)
  }));
  const parseMs = Math.round(performance.now() - parseStartedAt);
  let visibility = { hideHeader: false, hideFooter: false };
  let chapter = '';
  let domWriteMs = 0;
  let pagesVisited = 0;
  let containersWritten = 0;

  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const totalPages = pages.length;
  pages.forEach((page, index) => {
    pagesVisited += 1;
    const section = page.querySelector<HTMLElement>('[data-section-index]');
    if (section) visibility = {
      hideHeader: section.dataset.hideHeader === 'true',
      hideFooter: section.dataset.hideFooter === 'true'
    };
    const heading = page.querySelector<HTMLElement>('h1 .heading-number, h1.heading-number, h1');
    if (heading?.textContent) chapter = chapterFromHeading(heading.textContent, chapter);
    page.classList.toggle('clear-writer-print-no-header', visibility.hideHeader);
    page.classList.toggle('clear-writer-print-no-footer', visibility.hideFooter);
    const writeStartedAt = performance.now();
    entries.forEach(entry => {
      const container = page.querySelector<HTMLElement>(entry.selector);
      if (container) {
        writeMargin(container, entry.cell, entry.parts, data, index + 1, totalPages, chapter, imageSources);
        containersWritten += 1;
      }
    });
    domWriteMs += performance.now() - writeStartedAt;
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  return {
    elapsedMs,
    parseMs,
    pageScanMs: Math.max(0, Math.round(elapsedMs - parseMs - domWriteMs)),
    domWriteMs: Math.round(domWriteMs),
    pagesVisited,
    containersWritten
  };
}

export type PdfPreviewMarginMaterializationMetrics = {
  elapsedMs: number;
  parseMs: number;
  pageScanMs: number;
  domWriteMs: number;
  pagesVisited: number;
  containersWritten: number;
};

function writeMargin(
  container: HTMLElement,
  cell: HeaderFooterCell,
  parts: MarginPart[],
  data: PdfPreviewMarginData,
  page: number,
  totalPages: number,
  chapter: string,
  imageSources: Readonly<Record<string, string>>
): void {
  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const part of parts) {
    if (part.kind === 'text') fragment.append(doc.createTextNode(resolvePdfPreviewMarginText(part.value, data, page, totalPages, chapter)));
    else {
      const image = doc.createElement('img');
      image.alt = resolvePdfPreviewMarginText(part.alt, data, page, totalPages, chapter);
      image.src = imageSources[part.source] || resolvePdfPreviewMarginText(part.source, data, page, totalPages, chapter);
      if (part.title) image.title = resolvePdfPreviewMarginText(part.title, data, page, totalPages, chapter);
      fragment.append(image);
    }
  }
  container.classList.add('clear-writer-print-margin-content');
  Object.assign(container.style, {
    display: 'flex', height: '100%', minWidth: '0', alignItems: align(cell.verticalAlign),
    justifyContent: align(cell.horizontalAlign), fontFamily: cell.fontFamily,
    fontSize: `${cell.fontSize}pt`, fontWeight: cell.isBold ? 'bold' : 'normal',
    fontStyle: cell.isItalic ? 'italic' : 'normal', whiteSpace: 'pre-wrap', color: cell.color || ''
  });
  container.replaceChildren(fragment);
}

type MarginPart = { kind: 'text'; value: string } | { kind: 'image'; alt: string; source: string; title: string | null };
function parseParts(content: string): MarginPart[] {
  const parts: MarginPart[] = [];
  let cursor = 0;
  // Use the same CommonMark-aware parser as asset resolution. Header/footer
  // paths may contain spaces, parentheses, and titles; a smaller regex would
  // produce a different source key and bypass the resolved image URL.
  for (const image of parseMarkdownImages(content)) {
    if (image.start > cursor) parts.push({ kind: 'text', value: content.slice(cursor, image.start) });
    parts.push({ kind: 'image', alt: image.alt, source: image.source, title: image.title });
    cursor = image.end;
  }
  if (cursor < content.length) parts.push({ kind: 'text', value: content.slice(cursor) });
  return parts;
}

export function resolvePdfPreviewMarginText(
  value: string,
  data: PdfPreviewMarginData,
  page: number,
  totalPages: number,
  chapter: string
): string {
  const metadata = data.metadata;
  return value.replace(/\$\{author\}/g, metadata.author).replace(/\$\{documentTitle\}/g, metadata.documentTitle)
    .replace(/\$\{documentName\}/g, metadata.documentName).replace(/\$\{documentNumber\}/g, metadata.documentNumber)
    .replace(/\$\{documentRevision\}/g, metadata.documentRevision).replace(/\$\{documentType\}/g, metadata.documentType)
    .replace(/\$\{productName\}/g, metadata.productName).replace(/\$\{productModule\}/g, metadata.productModule)
    .replace(/\$\{productVersion\}/g, metadata.productVersion).replace(/\{page\}/g, String(page))
    .replace(/\{pages\}/g, String(totalPages))
    .replace(/\{chapter:([^{}]*)\}/gi, (_token, label: string) => chapter ? `${label}${chapter}` : '')
    .replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
}

function chapterFromHeading(text: string, previous: string): string {
  return text.match(/(^|\s)(\d+(?:\.\d+)*)\./)?.[2] || previous;
}

function align(value: HeaderFooterCell['horizontalAlign'] | HeaderFooterCell['verticalAlign']): string {
  return value === 'left' || value === 'top' ? 'flex-start' : value === 'right' || value === 'bottom' ? 'flex-end' : 'center';
}
