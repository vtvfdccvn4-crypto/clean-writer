const HEADING_SELECTOR = Array.from({ length: 6 }, (_, index) => `h${index + 1}`).join(',');

export function createHeadingNumberSequence(levels: number[]): string[] {
  const counters = [0, 0, 0, 0, 0, 0];
  return levels.map(level => {
    if (!Number.isInteger(level) || level < 1 || level > 6) return '';
    counters[level - 1] += 1;
    counters.fill(0, level);
    return counters.slice(0, level).join('.');
  });
}

/** Decorates opted-in section headings in document order before pagination. */
export function applyHeadingNumbering(root: ParentNode): void {
  const headings = root.querySelectorAll<HTMLElement>(
    `.document-section[data-number-headings="true"] :is(${HEADING_SELECTOR}):not(.special-heading)`
  );
  const headingList = Array.from(headings);
  const numbers = createHeadingNumberSequence(
    headingList.map(heading => Number(heading.tagName.slice(1)))
  );

  headingList.forEach((heading, index) => {
    const number = numbers[index];
    if (!number) return;
    const doc = root.ownerDocument || document;
    const marker = doc.createElement('span');
    marker.className = 'heading-number';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = `${number}. `;
    heading.prepend(marker);
  });
}
