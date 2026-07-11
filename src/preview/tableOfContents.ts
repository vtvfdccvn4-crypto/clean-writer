const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export function applyTableOfContents(wrapper: HTMLElement, requestedMaxLevel = 6): void {
  const placeholders = Array.from(wrapper.querySelectorAll<HTMLElement>('.toc-placeholder'));
  if (placeholders.length === 0) return;

  // querySelectorAll preserves merged-document order. Folder selections have
  // already cascaded to their descendant document sections during assembly.
  const includedSections = Array.from(
    wrapper.querySelectorAll<HTMLElement>('.document-section[data-include-in-toc="true"]')
  );
  const maxLevel = Math.min(6, Math.max(1, Math.trunc(requestedMaxLevel)));
  const headings = includedSections.flatMap(section =>
    Array.from(section.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
  ).filter(heading => Number.parseInt(heading.tagName.substring(1), 10) <= maxLevel);

  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `heading-toc-${index}`;
  });

  const doc = wrapper.ownerDocument || document;
  const nav = buildTableOfContents(headings, doc);
  placeholders.forEach(placeholder => {
    placeholder.replaceWith(nav.cloneNode(true));
  });
}

function buildTableOfContents(headings: HTMLElement[], doc: Document): HTMLElement {
  const nav = doc.createElement('nav');
  nav.className = 'table-of-contents';
  nav.setAttribute('aria-label', 'Table of contents');

  const list = doc.createElement('ul');
  list.className = 'toc-list';

  headings.forEach(heading => {
    const level = Number.parseInt(heading.tagName.substring(1), 10);
    const item = doc.createElement('li');
    item.className = `toc-item toc-level-${level}`;

    const link = doc.createElement('a');
    link.href = `#${heading.id}`;
    link.className = 'toc-link';

    const label = doc.createElement('span');
    label.className = 'toc-label';
    label.textContent = heading.textContent || '';

    const leader = doc.createElement('span');
    leader.className = 'toc-leader';
    leader.setAttribute('aria-hidden', 'true');

    link.append(label, leader);
    item.appendChild(link);
    list.appendChild(item);
  });

  nav.appendChild(list);
  return nav;
}
