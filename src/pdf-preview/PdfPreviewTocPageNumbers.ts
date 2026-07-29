/** Resolves TOC links against the completed physical page tree. */
export function materializePdfPreviewTocPageNumbers(root: ParentNode): void {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const pageByTargetId = new Map<string, number>();

  pages.forEach((page, index) => {
    page.querySelectorAll<HTMLElement>('[id]').forEach(target => {
      if (!pageByTargetId.has(target.id)) pageByTargetId.set(target.id, index + 1);
    });
  });

  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  root.querySelectorAll<HTMLAnchorElement>('.table-of-contents .toc-link[href^="#"]').forEach(link => {
    const targetId = decodeFragment(link.getAttribute('href') ?? '');
    const pageNumber = pageByTargetId.get(targetId);
    let output = link.querySelector<HTMLElement>(':scope > .toc-page-number');
    if (!output) {
      output = doc.createElement('span');
      output.className = 'toc-page-number';
      output.setAttribute('aria-label', 'Page number');
      link.append(output);
    }
    output.textContent = pageNumber === undefined ? '' : String(pageNumber);
  });
}

function decodeFragment(href: string): string {
  const fragment = href.startsWith('#') ? href.slice(1) : href;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
