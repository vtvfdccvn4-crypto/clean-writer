/**
 * Rejects accidental physical blank pages before the print handoff.
 * Clear Writer has no intentional blank-page feature, so an empty page is a
 * pagination defect rather than valid document content.
 */
export function validatePrintArtifact(root: ParentNode): number {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  if (pages.length === 0) throw new Error('Print artifact contains no physical pages.');

  pages.forEach((page, index) => {
    const content = page.querySelector<HTMLElement>('.pagedjs_page_content');
    if (!content || !hasMeaningfulPageContent(content)) {
      throw new Error(`Print artifact contains an empty physical page at position ${index + 1}.`);
    }
  });
  return pages.length;
}

/** Exported separately so blank-page semantics can be regression-tested. */
export function isMeaningfulPageContent(content: Pick<HTMLElement, 'textContent' | 'querySelector'>): boolean {
  const text = (content.textContent || '')
    .replace(/[\s\u00a0\u200b]+/g, '');
  if (text.length > 0) return true;
  return content.querySelector('img, svg, canvas, table, hr, pre, blockquote') !== null;
}

function hasMeaningfulPageContent(content: HTMLElement): boolean {
  return isMeaningfulPageContent(content);
}
