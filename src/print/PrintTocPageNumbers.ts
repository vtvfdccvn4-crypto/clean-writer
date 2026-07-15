/**
 * Resolves TOC references from the completed physical page tree.
 *
 * Paged.js' target-counter extension does not initialise reliably in the
 * isolated export frame (it emits its zero-value fallback). At this point
 * pagination is complete, so the generated pages are the authoritative source
 * of the number for each heading target.
 */
export function renderPrintTocPageNumbers(root: ParentNode): void {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const pageByTargetId = new Map<string, number>();

  pages.forEach((page, index) => {
    page.querySelectorAll<HTMLElement>('[id]').forEach(target => {
      if (!pageByTargetId.has(target.id)) pageByTargetId.set(target.id, index + 1);
    });
  });

  root.querySelectorAll<HTMLAnchorElement>('.table-of-contents .toc-link[href^="#"]').forEach(link => {
    const targetId = decodeFragment(link.getAttribute('href')!);
    const pageNumber = pageByTargetId.get(targetId);
    let output = link.querySelector<HTMLElement>(':scope > .toc-page-number');
    if (!output) {
      output = document.createElement('span');
      output.className = 'toc-page-number';
      output.setAttribute('aria-label', 'Page number');
      link.append(output);
    }
    output.textContent = pageNumber === undefined ? '' : String(pageNumber);
  });
}

function decodeFragment(href: string): string {
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}
