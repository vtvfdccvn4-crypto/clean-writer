import { parseMarkdownImages } from '../images/markdownImages';
import type { HeaderFooterCell } from '../types';
import type { PrintLayoutSettings } from './PrintLayoutSettings';

export type PrintMarginImageSources = Readonly<Record<string, string>>;

type MarginCell = {
  selector: string;
  cell: HeaderFooterCell;
  parts: readonly MarginPart[];
};

type MarginPart =
  | { readonly type: 'text'; readonly template: string }
  | { readonly type: 'image'; readonly source: string; readonly alt: string; readonly title: string | null };

/** Materialises all header/footer content into each generated physical page. */
export function renderPrintMargins(
  root: ParentNode,
  layout: PrintLayoutSettings,
  imageSources: PrintMarginImageSources
): void {
  const cells: MarginCell[] = [
    createMarginCell('.pagedjs_margin-top-left > .pagedjs_margin-content', layout.header.left),
    createMarginCell('.pagedjs_margin-top-center > .pagedjs_margin-content', layout.header.center),
    createMarginCell('.pagedjs_margin-top-right > .pagedjs_margin-content', layout.header.right),
    createMarginCell('.pagedjs_margin-bottom-left > .pagedjs_margin-content', layout.footer.left),
    createMarginCell('.pagedjs_margin-bottom-center > .pagedjs_margin-content', layout.footer.center),
    createMarginCell('.pagedjs_margin-bottom-right > .pagedjs_margin-content', layout.footer.right)
  ];
  // The document source is the authority for per-section visibility.  Its
  // data attributes have already resolved flags inherited from explorer
  // folders, whereas a flat layout snapshot only knows each node's own flag.
  // Keep the most recent marker for continuation pages that contain no
  // section-opening element of their own.
  let activeVisibility: PageVisibility = { hideHeader: false, hideFooter: false };
  let chapter = '';

  Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page')).forEach((page, pageIndex) => {
    const sectionMarker = page.querySelector<HTMLElement>('[data-section-index]');
    if (sectionMarker) activeVisibility = readSectionVisibility(sectionMarker);
    const heading = page.querySelector<HTMLElement>('h1 .heading-number, h1.heading-number, h1');
    if (heading?.textContent) chapter = resolveChapter(heading.textContent, chapter);

    page.classList.toggle('clear-writer-print-no-header', activeVisibility.hideHeader);
    page.classList.toggle('clear-writer-print-no-footer', activeVisibility.hideFooter);

    for (const entry of cells) {
      const container = page.querySelector<HTMLElement>(entry.selector);
      if (!container) continue;
      materialiseMarginCell(container, entry, layout.metadata, pageIndex + 1, chapter, imageSources);
    }
  });
}

type PageVisibility = {
  hideHeader: boolean;
  hideFooter: boolean;
};

function readSectionVisibility(section: HTMLElement): PageVisibility {
  return {
    hideHeader: section.dataset.hideHeader === 'true',
    hideFooter: section.dataset.hideFooter === 'true'
  };
}

function materialiseMarginCell(
  container: HTMLElement,
  entry: MarginCell,
  metadata: PrintLayoutSettings['metadata'],
  pageNumber: number,
  chapter: string,
  imageSources: PrintMarginImageSources
): void {
  const { cell } = entry;
  const fragment = document.createDocumentFragment();
  for (const part of entry.parts) {
    if (part.type === 'text') {
      fragment.append(document.createTextNode(resolveMarginText(part.template, metadata, pageNumber, chapter)));
      continue;
    }
    const element = document.createElement('img');
    element.alt = resolveMarginText(part.alt, metadata, pageNumber, chapter);
    const title = part.title && resolveMarginText(part.title, metadata, pageNumber, chapter);
    if (title) element.title = title;
    const source = resolveMarginText(part.source, metadata, pageNumber, chapter);
    element.dataset.imageSource = source;
    element.src = imageSources[source] || source;
    fragment.append(element);
  }

  container.classList.add('clear-writer-print-margin-content');
  container.style.display = 'flex';
  container.style.height = '100%';
  container.style.minWidth = '0';
  container.style.alignItems = toFlexAlignment(cell.verticalAlign);
  container.style.justifyContent = toFlexAlignment(cell.horizontalAlign);
  container.style.fontFamily = cell.fontFamily;
  container.style.fontSize = `${cell.fontSize}pt`;
  container.style.fontWeight = cell.isBold ? 'bold' : 'normal';
  container.style.fontStyle = cell.isItalic ? 'italic' : 'normal';
  container.style.whiteSpace = 'pre-wrap';
  if (cell.color) container.style.color = cell.color;
  container.replaceChildren(fragment);
}

function createMarginCell(selector: string, cell: HeaderFooterCell): MarginCell {
  const parts: MarginPart[] = [];
  const images = parseMarkdownImages(cell.content);
  let cursor = 0;
  for (const image of images) {
    if (image.start > cursor) parts.push({ type: 'text', template: cell.content.slice(cursor, image.start) });
    parts.push({ type: 'image', source: image.source, alt: image.alt, title: image.title });
    cursor = image.end;
  }
  if (cursor < cell.content.length) parts.push({ type: 'text', template: cell.content.slice(cursor) });
  return { selector, cell, parts };
}

function resolveMarginText(
  content: string,
  metadata: PrintLayoutSettings['metadata'],
  pageNumber: number,
  chapter: string
): string {
  return content
    .replace(/\$\{author\}/g, metadata.author)
    .replace(/\$\{documentTitle\}/g, metadata.documentTitle)
    .replace(/\$\{documentName\}/g, metadata.documentName)
    .replace(/\$\{documentNumber\}/g, metadata.documentNumber)
    .replace(/\$\{documentRevision\}/g, metadata.documentRevision)
    .replace(/\$\{documentType\}/g, metadata.documentType)
    .replace(/\$\{productName\}/g, metadata.productName)
    .replace(/\$\{productModule\}/g, metadata.productModule)
    .replace(/\$\{productVersion\}/g, metadata.productVersion)
    .replace(/\{page\}/g, String(pageNumber))
    .replace(/\{chapter:([^{}]*)\}/gi, (_token, label: string) => chapter ? `${label}${chapter}` : '')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
}

function resolveChapter(text: string, previous: string): string {
  const match = text.match(/(^|\s)(\d+(?:\.\d+)*)\./);
  return match ? match[2] : previous;
}

function toFlexAlignment(value: HeaderFooterCell['horizontalAlign'] | HeaderFooterCell['verticalAlign']): string {
  if (value === 'left' || value === 'top') return 'flex-start';
  if (value === 'right' || value === 'bottom') return 'flex-end';
  return 'center';
}
